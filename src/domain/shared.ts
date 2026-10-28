import { and, eq, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import type { DbOrTx } from "@/db";
import { auditLogs, memberships, notifications, siteAccess, workOrders, type Role } from "@/db/schema";
import type { AuthContext } from "@/lib/auth/context";

export async function recordAudit(
  db: DbOrTx,
  ctx: Pick<AuthContext, "tenantId" | "userId">,
  action: string,
  entityType: string,
  entityId: string | null,
  data: Record<string, unknown> = {},
) {
  await db.insert(auditLogs).values({ tenantId: ctx.tenantId, actorUserId: ctx.userId, action, entityType, entityId, data });
}

export type NewNotification = { type: string; title: string; body?: string; link?: string; dedupeKey?: string };

export async function notifyUsers(db: DbOrTx, tenantId: string, userIds: (string | null | undefined)[], n: NewNotification) {
  const ids = [...new Set(userIds.filter((x): x is string => !!x))];
  if (!ids.length) return;
  await db
    .insert(notifications)
    .values(ids.map((userId) => ({ tenantId, userId, ...n, dedupeKey: n.dedupeKey ?? null })))
    .onConflictDoNothing();
}

/** Active users in a tenant holding one of `roles` with access to `siteId`. */
export async function usersForSite(db: DbOrTx, tenantId: string, siteId: string, roles: Role[], extra?: SQL) {
  const rows = await db
    .selectDistinct({ userId: memberships.userId })
    .from(memberships)
    .leftJoin(siteAccess, and(eq(siteAccess.membershipId, memberships.id), eq(siteAccess.siteId, siteId)))
    .where(
      and(
        eq(memberships.tenantId, tenantId),
        eq(memberships.status, "active"),
        inArray(memberships.role, roles),
        or(eq(memberships.allSites, true), eq(memberships.role, "tenant_admin"), sql`${siteAccess.id} is not null`),
        extra,
      ),
    );
  return rows.map((r) => r.userId);
}

/** SQL condition restricting a site-bearing table to the sites in scope. */
export function siteScope(ctx: AuthContext, column: Parameters<typeof inArray>[0]): SQL {
  if (ctx.allSites) return sql`true`;
  return ctx.siteIds.length ? inArray(column, ctx.siteIds) : sql`false`;
}

/**
 * Record-level visibility for work orders. Always tenant + site scoped; technicians only see work
 * assigned to them (or that they requested); contractor managers only their contractor's work.
 */
export function workOrderScope(ctx: AuthContext): SQL {
  const conds: (SQL | undefined)[] = [
    eq(workOrders.tenantId, ctx.tenantId),
    isNull(workOrders.archivedAt),
    siteScope(ctx, workOrders.siteId),
  ];
  if (ctx.role === "technician") {
    conds.push(
      or(ctx.personId ? eq(workOrders.assigneePersonId, ctx.personId) : sql`false`, eq(workOrders.requesterUserId, ctx.userId)),
    );
  }
  if (ctx.role === "contractor_manager") {
    conds.push(ctx.contractorId ? eq(workOrders.contractorId, ctx.contractorId) : sql`false`);
  }
  return and(...conds)!;
}

export type Page<T> = { rows: T[]; total: number; page: number; pageSize: number };

export function pageParams(page?: number, pageSize?: number) {
  const p = Math.max(1, Math.floor(page ?? 1));
  const size = Math.min(100, Math.max(5, Math.floor(pageSize ?? 20)));
  return { page: p, pageSize: size, offset: (p - 1) * size };
}

export function escapeLike(s: string) {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}
