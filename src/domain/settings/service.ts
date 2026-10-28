import { randomBytes } from "node:crypto";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import type { DbOrTx } from "@/db";
import {
  auditLogs,
  contractors,
  memberships,
  people,
  sessions,
  siteAccess,
  sites,
  userIdentities,
  slaPolicies,
  tenants,
  users,
  workCategories,
  type TenantSettings,
} from "@/db/schema";
import { hashPassword } from "@/lib/auth/password";
import { requirePerm, type AuthContext } from "@/lib/auth/context";
import { AppError, forbidden, notFound } from "@/lib/errors";
import { recordAudit } from "@/domain/shared";
import { isUuid, parseInput, zOptText, zOptUuid, zTimezone } from "@/domain/validation";

const ASSIGNABLE_ROLES = [
  "tenant_admin",
  "facilities_manager",
  "supervisor",
  "technician",
  "contractor_manager",
  "client_approver",
  "auditor",
] as const;

const checkbox = z.preprocess((v) => v === true || v === "on" || v === "true", z.boolean());
const idList = z.preprocess((v) => (Array.isArray(v) ? v : v ? [v] : []), z.array(z.uuid()));

export const memberInput = z.object({
  role: z.enum(ASSIGNABLE_ROLES),
  allSites: checkbox.default(false),
  canApprove: checkbox.default(false),
  contractorId: zOptUuid,
  siteIds: idList.default([]),
});

export const inviteInput = memberInput.extend({
  name: z.string().trim().min(2, "Name is required").max(200),
  email: z.email("Enter a valid email").transform((s) => s.toLowerCase().trim()),
  createPerson: checkbox.default(true),
});

export async function listMembers(db: DbOrTx, ctx: AuthContext) {
  requirePerm(ctx, "settings.manage");
  const rows = await db
    .select({
      membershipId: memberships.id,
      userId: users.id,
      name: users.name,
      email: users.email,
      role: memberships.role,
      status: memberships.status,
      allSites: memberships.allSites,
      canApprove: memberships.canApprove,
      contractorId: memberships.contractorId,
      contractorName: contractors.name,
      lastLoginAt: users.lastLoginAt,
      siteIds: sql<string[]>`coalesce((select array_agg(sa.site_id) from ${siteAccess} sa where sa.membership_id = ${memberships.id}), '{}')`,
      googleLinked: sql<boolean>`exists(select 1 from ${userIdentities} ui where ui.user_id = ${users.id} and ui.provider = 'google')`,
    })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .leftJoin(contractors, eq(contractors.id, memberships.contractorId))
    .where(eq(memberships.tenantId, ctx.tenantId))
    .orderBy(asc(users.name));
  return rows;
}

async function validateMember(db: DbOrTx, ctx: AuthContext, input: z.output<typeof memberInput>) {
  if (input.role === "contractor_manager" && !input.contractorId) {
    throw new AppError("VALIDATION", "Contractor managers must be linked to a contractor.", { contractorId: "Select a contractor" });
  }
  if (input.contractorId) {
    const [c] = await db.select({ id: contractors.id }).from(contractors).where(and(eq(contractors.id, input.contractorId), eq(contractors.tenantId, ctx.tenantId)));
    if (!c) throw new AppError("VALIDATION", "Contractor not found.", { contractorId: "Not found" });
  }
  if (input.siteIds.length) {
    const found = await db.select({ id: sites.id }).from(sites).where(and(eq(sites.tenantId, ctx.tenantId), inArray(sites.id, input.siteIds)));
    if (found.length !== new Set(input.siteIds).size) throw new AppError("VALIDATION", "One or more sites are invalid.", { siteIds: "Invalid site" });
  }
}

async function writeSiteAccess(tx: DbOrTx, ctx: AuthContext, membershipId: string, siteIds: string[]) {
  await tx.delete(siteAccess).where(eq(siteAccess.membershipId, membershipId));
  if (siteIds.length) await tx.insert(siteAccess).values([...new Set(siteIds)].map((siteId) => ({ tenantId: ctx.tenantId, membershipId, siteId })));
}

/** Creates (or links) a user and returns a one-time temporary password to hand over securely. */
export async function inviteMember(db: DbOrTx, ctx: AuthContext, raw: unknown) {
  requirePerm(ctx, "settings.manage");
  const input = parseInput(inviteInput, raw);
  await validateMember(db, ctx, input);
  return db.transaction(async (tx) => {
    let [user] = await tx.select().from(users).where(eq(users.email, input.email));
    let tempPassword: string | null = null;
    if (!user) {
      tempPassword = `Ks-${randomBytes(9).toString("base64url")}1`;
      [user] = await tx
        .insert(users)
        .values({ email: input.email, name: input.name, passwordHash: await hashPassword(tempPassword), mustChangePassword: true })
        .returning();
    }
    const [existing] = await tx.select({ id: memberships.id }).from(memberships).where(and(eq(memberships.tenantId, ctx.tenantId), eq(memberships.userId, user.id)));
    if (existing) throw new AppError("CONFLICT", "This user is already a member of the workspace.", { email: "Already a member" });
    const [m] = await tx
      .insert(memberships)
      .values({
        tenantId: ctx.tenantId,
        userId: user.id,
        role: input.role,
        allSites: input.allSites,
        canApprove: input.canApprove,
        contractorId: input.contractorId ?? null,
      })
      .returning();
    await writeSiteAccess(tx, ctx, m.id, input.allSites ? [] : input.siteIds);
    if (input.createPerson && ["technician", "supervisor", "client_approver", "contractor_manager"].includes(input.role)) {
      const personType =
        input.role === "client_approver" ? "client_contact" : input.role === "contractor_manager" ? "contractor_contact" : input.role;
      await tx
        .insert(people)
        .values({
          tenantId: ctx.tenantId,
          userId: user.id,
          name: input.name,
          email: input.email,
          personType: personType as "technician" | "supervisor" | "client_contact" | "contractor_contact",
          contractorId: input.contractorId ?? null,
        })
        .onConflictDoNothing();
    }
    await recordAudit(tx, ctx, "member.invited", "membership", m.id, { email: input.email, role: input.role });
    return { membershipId: m.id, tempPassword };
  });
}

export async function updateMember(db: DbOrTx, ctx: AuthContext, membershipId: string, raw: unknown) {
  requirePerm(ctx, "settings.manage");
  if (!isUuid(membershipId)) throw notFound("Member");
  const input = parseInput(memberInput, raw);
  await validateMember(db, ctx, input);
  return db.transaction(async (tx) => {
    const [m] = await tx.select().from(memberships).where(and(eq(memberships.id, membershipId), eq(memberships.tenantId, ctx.tenantId)));
    if (!m) throw notFound("Member");
    if (m.userId === ctx.userId && input.role !== m.role) throw forbidden("You cannot change your own role.");
    await tx
      .update(memberships)
      .set({ role: input.role, allSites: input.allSites, canApprove: input.canApprove, contractorId: input.contractorId ?? null, updatedAt: new Date() })
      .where(eq(memberships.id, m.id));
    await writeSiteAccess(tx, ctx, m.id, input.allSites ? [] : input.siteIds);
    await recordAudit(tx, ctx, "member.updated", "membership", m.id, {
      role: m.role !== input.role ? { from: m.role, to: input.role } : undefined,
      allSites: input.allSites,
      canApprove: input.canApprove,
      siteIds: input.allSites ? "all" : input.siteIds,
    });
  });
}

export async function setMemberStatus(db: DbOrTx, ctx: AuthContext, membershipId: string, active: boolean) {
  requirePerm(ctx, "settings.manage");
  if (!isUuid(membershipId)) throw notFound("Member");
  const [m] = await db.select().from(memberships).where(and(eq(memberships.id, membershipId), eq(memberships.tenantId, ctx.tenantId)));
  if (!m) throw notFound("Member");
  if (m.userId === ctx.userId) throw forbidden("You cannot disable your own access.");
  await db.update(memberships).set({ status: active ? "active" : "disabled", updatedAt: new Date() }).where(eq(memberships.id, m.id));
  await recordAudit(db, ctx, active ? "member.enabled" : "member.disabled", "membership", m.id);
}

// ---------------------------------------------------------------------------
// Tenant profile & workflow configuration
// ---------------------------------------------------------------------------

export const tenantProfileInput = z.object({ name: z.string().trim().min(2).max(200), country: zOptText(100), timezone: zTimezone });

export const workflowInput = z.object({
  enforceCredentials: checkbox,
  allowSelfApproval: checkbox,
  defaultChecklist: z.preprocess(
    (v) =>
      typeof v === "string"
        ? v
            .split("\n")
            .map((s) => s.trim())
            .filter(Boolean)
        : v,
    z.array(z.string().max(300)).max(30),
  ),
});

export async function updateTenantProfile(db: DbOrTx, ctx: AuthContext, raw: unknown) {
  requirePerm(ctx, "settings.manage");
  const input = parseInput(tenantProfileInput, raw);
  await db.update(tenants).set({ ...input, country: input.country ?? null, updatedAt: new Date() }).where(eq(tenants.id, ctx.tenantId));
  await recordAudit(db, ctx, "tenant.updated", "tenant", ctx.tenantId);
}

export async function updateWorkflowSettings(db: DbOrTx, ctx: AuthContext, raw: unknown) {
  requirePerm(ctx, "settings.manage");
  const input = parseInput(workflowInput, raw);
  const settings: TenantSettings = { ...ctx.tenantSettings, ...input };
  await db.update(tenants).set({ settings, updatedAt: new Date() }).where(eq(tenants.id, ctx.tenantId));
  await recordAudit(db, ctx, "tenant.workflow_updated", "tenant", ctx.tenantId, {
    enforceCredentials: input.enforceCredentials,
    allowSelfApproval: input.allowSelfApproval,
  });
}

// ---------------------------------------------------------------------------
// Categories & SLA
// ---------------------------------------------------------------------------

export const categoryInput = z.object({
  code: z.string().trim().min(2).max(20).regex(/^[A-Za-z0-9_-]+$/).transform((s) => s.toUpperCase()),
  name: z.string().trim().min(2).max(100),
  requiredCredential: zOptText(100),
});

export async function createCategory(db: DbOrTx, ctx: AuthContext, raw: unknown) {
  requirePerm(ctx, "settings.manage");
  const input = parseInput(categoryInput, raw);
  const [dup] = await db.select({ id: workCategories.id }).from(workCategories).where(and(eq(workCategories.tenantId, ctx.tenantId), eq(workCategories.code, input.code)));
  if (dup) throw new AppError("CONFLICT", "Category code already exists.", { code: "Already in use" });
  const [c] = await db.insert(workCategories).values({ ...input, tenantId: ctx.tenantId }).returning();
  await recordAudit(db, ctx, "category.created", "work_category", c.id, { code: c.code });
  return c;
}

export async function updateCategory(db: DbOrTx, ctx: AuthContext, id: string, raw: unknown) {
  requirePerm(ctx, "settings.manage");
  if (!isUuid(id)) throw notFound("Category");
  const input = parseInput(categoryInput.omit({ code: true }), raw);
  const [c] = await db
    .update(workCategories)
    .set({ name: input.name, requiredCredential: input.requiredCredential ?? null, updatedAt: new Date() })
    .where(and(eq(workCategories.id, id), eq(workCategories.tenantId, ctx.tenantId)))
    .returning();
  if (!c) throw notFound("Category");
  await recordAudit(db, ctx, "category.updated", "work_category", c.id, { requiredCredential: c.requiredCredential });
}

export async function listSlaPolicies(db: DbOrTx, ctx: AuthContext) {
  return db.select().from(slaPolicies).where(eq(slaPolicies.tenantId, ctx.tenantId)).orderBy(sql`case ${slaPolicies.priority} when 'critical' then 1 when 'high' then 2 when 'medium' then 3 else 4 end`);
}

export const slaInput = z.object({
  priority: z.enum(["low", "medium", "high", "critical"]),
  responseHours: z.coerce.number().int().min(1).max(24 * 90),
  resolutionHours: z.coerce.number().int().min(1).max(24 * 365),
});

export async function upsertSlaPolicy(db: DbOrTx, ctx: AuthContext, raw: unknown) {
  requirePerm(ctx, "settings.manage");
  const input = parseInput(slaInput, raw);
  if (input.resolutionHours < input.responseHours) throw new AppError("VALIDATION", "Resolution time must be at least the response time.");
  await db
    .insert(slaPolicies)
    .values({ ...input, tenantId: ctx.tenantId })
    .onConflictDoUpdate({ target: [slaPolicies.tenantId, slaPolicies.priority], set: { ...input, updatedAt: new Date() } });
  await recordAudit(db, ctx, "sla.updated", "sla_policy", null, input);
}

// ---------------------------------------------------------------------------
// Audit log
// ---------------------------------------------------------------------------

export async function listAuditLog(db: DbOrTx, ctx: AuthContext, opts: { page?: number; action?: string } = {}) {
  requirePerm(ctx, "audit.view");
  const pageSize = 50;
  const page = Math.max(1, opts.page ?? 1);
  const where = and(eq(auditLogs.tenantId, ctx.tenantId), opts.action ? sql`${auditLogs.action} like ${opts.action + "%"}` : undefined);
  const [rows, [{ total }]] = await Promise.all([
    db
      .select({ log: auditLogs, actorName: users.name })
      .from(auditLogs)
      .leftJoin(users, eq(users.id, auditLogs.actorUserId))
      .where(where)
      .orderBy(desc(auditLogs.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ total: sql<number>`count(*)::int` }).from(auditLogs).where(where),
  ]);
  return { rows: rows.map((r) => ({ ...r.log, actorName: r.actorName })), total, page, pageSize };
}

/** Admin password reset: issues a one-time temporary password and signs the user out everywhere. */
export async function resetMemberPassword(db: DbOrTx, ctx: AuthContext, membershipId: string) {
  requirePerm(ctx, "settings.manage");
  if (!isUuid(membershipId)) throw notFound("Member");
  const [m] = await db.select().from(memberships).where(and(eq(memberships.id, membershipId), eq(memberships.tenantId, ctx.tenantId)));
  if (!m) throw notFound("Member");
  if (m.userId === ctx.userId) throw forbidden("Use Change password to update your own password.");
  // A user who belongs to other workspaces is not this tenant's to reset.
  const others = await db.select({ id: memberships.id }).from(memberships).where(and(eq(memberships.userId, m.userId), sql`${memberships.tenantId} <> ${ctx.tenantId}`));
  if (others.length) throw forbidden("This user belongs to other workspaces; ask a platform administrator to reset their password.");
  const tempPassword = `Ks-${randomBytes(9).toString("base64url")}1`;
  await db.transaction(async (tx) => {
    await tx.update(users).set({ passwordHash: await hashPassword(tempPassword), mustChangePassword: true, updatedAt: new Date() }).where(eq(users.id, m.userId));
    await tx.delete(sessions).where(eq(sessions.userId, m.userId));
    await recordAudit(tx, ctx, "member.password_reset", "membership", m.id);
  });
  return { tempPassword };
}
