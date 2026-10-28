import { and, eq } from "drizzle-orm";
import type { DbOrTx } from "@/db";
import { memberships, people, siteAccess, tenants, users, type Role, type TenantSettings } from "@/db/schema";
import { permissionsFor, type Permission } from "@/lib/authz/permissions";
import { AppError, forbidden } from "@/lib/errors";

/** Everything a domain service needs to authorise and scope a request. Built only on the server. */
export type AuthContext = {
  userId: string;
  userName: string;
  userEmail: string;
  isPlatformAdmin: boolean;
  tenantId: string;
  tenantName: string;
  tenantTimezone: string;
  tenantSettings: TenantSettings;
  isDemoTenant: boolean;
  membershipId: string;
  role: Role;
  perms: ReadonlySet<Permission>;
  /** true → every site in the tenant; otherwise restricted to `siteIds`. */
  allSites: boolean;
  siteIds: string[];
  contractorId: string | null;
  personId: string | null;
};

export async function loadContext(db: DbOrTx, userId: string, tenantId: string): Promise<AuthContext | null> {
  const [row] = await db
    .select({ m: memberships, t: tenants, u: users })
    .from(memberships)
    .innerJoin(tenants, eq(tenants.id, memberships.tenantId))
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(and(eq(memberships.userId, userId), eq(memberships.tenantId, tenantId), eq(memberships.status, "active")))
    .limit(1);
  if (!row) return null;

  const [sitesRows, [person]] = await Promise.all([
    row.m.allSites
      ? Promise.resolve([])
      : db.select({ siteId: siteAccess.siteId }).from(siteAccess).where(eq(siteAccess.membershipId, row.m.id)),
    db
      .select({ id: people.id })
      .from(people)
      .where(and(eq(people.tenantId, tenantId), eq(people.userId, userId)))
      .limit(1),
  ]);

  const allSites = row.m.allSites || row.m.role === "tenant_admin" || row.m.role === "platform_admin";
  return {
    userId,
    userName: row.u.name,
    userEmail: row.u.email,
    isPlatformAdmin: row.u.isPlatformAdmin,
    tenantId,
    tenantName: row.t.name,
    tenantTimezone: row.t.timezone,
    tenantSettings: row.t.settings,
    isDemoTenant: row.t.isDemo,
    membershipId: row.m.id,
    role: row.m.role,
    perms: permissionsFor(row.m.role, { canApprove: row.m.canApprove }),
    allSites,
    siteIds: sitesRows.map((s) => s.siteId),
    contractorId: row.m.contractorId,
    personId: person?.id ?? null,
  };
}

export function can(ctx: AuthContext, perm: Permission): boolean {
  return ctx.perms.has(perm);
}

export function requirePerm(ctx: AuthContext, perm: Permission): void {
  if (!ctx.perms.has(perm)) throw forbidden();
}

export function canAccessSite(ctx: AuthContext, siteId: string): boolean {
  return ctx.allSites || ctx.siteIds.includes(siteId);
}

export function requireSite(ctx: AuthContext, siteId: string): void {
  // NOT_FOUND rather than FORBIDDEN so that out-of-scope IDs are indistinguishable from missing ones.
  if (!canAccessSite(ctx, siteId)) throw new AppError("NOT_FOUND", "Site not found.");
}
