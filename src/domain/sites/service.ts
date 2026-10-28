import { and, asc, desc, eq, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import type { DbOrTx } from "@/db";
import { assets, complianceItems, inspectionRuns, inspectionTemplates, people, sites, workOrders } from "@/db/schema";
import { requirePerm, requireSite, type AuthContext } from "@/lib/auth/context";
import { AppError, notFound } from "@/lib/errors";
import { OPEN_STATUSES } from "@/domain/work-orders/state";
import { escapeLike, recordAudit, siteScope, workOrderScope } from "@/domain/shared";
import { isUuid, parseInput, zOptEmail, zOptText, zOptUuid, zTimezone } from "@/domain/validation";

export const SITE_TYPES = ["Office", "Retail", "Campus", "Industrial", "Healthcare", "Hospitality", "Residential", "Warehouse", "Other"];

export const siteInput = z.object({
  code: z.string().trim().min(2).max(20).regex(/^[A-Za-z0-9-]+$/, "Letters, numbers and dashes only").transform((s) => s.toUpperCase()),
  name: z.string().trim().min(2, "Name is required").max(200),
  siteType: z.string().trim().min(1).max(50),
  address: zOptText(300),
  city: zOptText(100),
  region: zOptText(100),
  country: zOptText(100),
  timezone: zTimezone,
  contactName: zOptText(200),
  contactEmail: zOptEmail,
  managerPersonId: zOptUuid,
  status: z.enum(["active", "inactive"]).default("active"),
});

export async function listSites(db: DbOrTx, ctx: AuthContext, opts: { q?: string; includeArchived?: boolean } = {}) {
  requirePerm(ctx, "site.view");
  const q = opts.q ? `%${escapeLike(opts.q)}%` : null;
  return db
    .select({
      id: sites.id,
      code: sites.code,
      name: sites.name,
      siteType: sites.siteType,
      city: sites.city,
      country: sites.country,
      timezone: sites.timezone,
      status: sites.status,
      archivedAt: sites.archivedAt,
      openWork: sql<number>`(select count(*)::int from ${workOrders} w where w.site_id = ${sites.id} and w.status in (${sql.join(
        OPEN_STATUSES.map((s) => sql`${s}`),
        sql`, `,
      )}))`,
      assetCount: sql<number>`(select count(*)::int from ${assets} a where a.site_id = ${sites.id} and a.archived_at is null)`,
    })
    .from(sites)
    .where(
      and(
        eq(sites.tenantId, ctx.tenantId),
        siteScope(ctx, sites.id),
        opts.includeArchived ? undefined : isNull(sites.archivedAt),
        q ? or(ilike(sites.name, q), ilike(sites.code, q), ilike(sites.city, q)) : undefined,
      ),
    )
    .orderBy(asc(sites.name));
}

/** Minimal options list for selects — scoped to accessible, non-archived sites. */
export async function siteOptions(db: DbOrTx, ctx: AuthContext) {
  return db
    .select({ id: sites.id, name: sites.name, code: sites.code, timezone: sites.timezone })
    .from(sites)
    .where(and(eq(sites.tenantId, ctx.tenantId), siteScope(ctx, sites.id), isNull(sites.archivedAt)))
    .orderBy(asc(sites.name));
}

export async function getSite(db: DbOrTx, ctx: AuthContext, id: string) {
  requirePerm(ctx, "site.view");
  if (!isUuid(id)) throw notFound("Site");
  const [site] = await db.select().from(sites).where(and(eq(sites.id, id), eq(sites.tenantId, ctx.tenantId)));
  if (!site) throw notFound("Site");
  requireSite(ctx, site.id);

  const [manager] = site.managerPersonId
    ? await db.select({ id: people.id, name: people.name }).from(people).where(eq(people.id, site.managerPersonId))
    : [];
  const [siteAssets, recentWork, compliance, inspections, [openCount]] = await Promise.all([
    db
      .select()
      .from(assets)
      .where(and(eq(assets.tenantId, ctx.tenantId), eq(assets.siteId, id), isNull(assets.archivedAt)))
      .orderBy(asc(assets.code)),
    db
      .select({
        id: workOrders.id,
        number: workOrders.workOrderNumber,
        title: workOrders.title,
        status: workOrders.status,
        priority: workOrders.priority,
        dueAt: workOrders.dueAt,
      })
      .from(workOrders)
      .where(and(workOrderScope(ctx), eq(workOrders.siteId, id)))
      .orderBy(desc(workOrders.createdAt))
      .limit(10),
    ctx.perms.has("compliance.view")
      ? db
          .select()
          .from(complianceItems)
          .where(and(eq(complianceItems.tenantId, ctx.tenantId), eq(complianceItems.siteId, id), isNull(complianceItems.archivedAt)))
          .orderBy(asc(complianceItems.expiryDate))
      : Promise.resolve([]),
    db
      .select({
        id: inspectionRuns.id,
        status: inspectionRuns.status,
        score: inspectionRuns.score,
        submittedAt: inspectionRuns.submittedAt,
        startedAt: inspectionRuns.startedAt,
        templateName: inspectionTemplates.name,
      })
      .from(inspectionRuns)
      .innerJoin(inspectionTemplates, eq(inspectionTemplates.id, inspectionRuns.templateId))
      .where(and(eq(inspectionRuns.tenantId, ctx.tenantId), eq(inspectionRuns.siteId, id)))
      .orderBy(desc(inspectionRuns.startedAt))
      .limit(5),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(workOrders)
      .where(and(workOrderScope(ctx), eq(workOrders.siteId, id), inArray(workOrders.status, OPEN_STATUSES))),
  ]);
  return { site, manager: manager ?? null, assets: siteAssets, recentWork, compliance, inspections, openWork: openCount.count };
}

async function assertCodeFree(db: DbOrTx, tenantId: string, code: string, exceptId?: string) {
  const [dup] = await db.select({ id: sites.id }).from(sites).where(and(eq(sites.tenantId, tenantId), eq(sites.code, code)));
  if (dup && dup.id !== exceptId) throw new AppError("CONFLICT", "A site with this code already exists.", { code: "Code already in use" });
}

async function assertPerson(db: DbOrTx, tenantId: string, personId?: string) {
  if (!personId) return;
  const [p] = await db.select({ id: people.id }).from(people).where(and(eq(people.id, personId), eq(people.tenantId, tenantId)));
  if (!p) throw new AppError("VALIDATION", "Manager not found.", { managerPersonId: "Select a valid person" });
}

export async function createSite(db: DbOrTx, ctx: AuthContext, raw: unknown) {
  requirePerm(ctx, "site.manage");
  const input = parseInput(siteInput, raw);
  await assertCodeFree(db, ctx.tenantId, input.code);
  await assertPerson(db, ctx.tenantId, input.managerPersonId);
  return db.transaction(async (tx) => {
    const [site] = await tx.insert(sites).values({ ...input, tenantId: ctx.tenantId }).returning();
    await recordAudit(tx, ctx, "site.created", "site", site.id, { code: site.code });
    return site;
  });
}

export async function updateSite(db: DbOrTx, ctx: AuthContext, id: string, raw: unknown) {
  requirePerm(ctx, "site.manage");
  const input = parseInput(siteInput, raw);
  const { site: existing } = await getSite(db, ctx, id);
  await assertCodeFree(db, ctx.tenantId, input.code, existing.id);
  await assertPerson(db, ctx.tenantId, input.managerPersonId);
  return db.transaction(async (tx) => {
    const [site] = await tx
      .update(sites)
      .set({
        ...input,
        managerPersonId: input.managerPersonId ?? null,
        address: input.address ?? null,
        city: input.city ?? null,
        region: input.region ?? null,
        country: input.country ?? null,
        contactName: input.contactName ?? null,
        contactEmail: input.contactEmail ?? null,
        updatedAt: new Date(),
      })
      .where(and(eq(sites.id, existing.id), eq(sites.tenantId, ctx.tenantId)))
      .returning();
    await recordAudit(tx, ctx, "site.updated", "site", site.id);
    return site;
  });
}

/** Sites are archived, never hard-deleted, because work history references them. */
export async function setSiteArchived(db: DbOrTx, ctx: AuthContext, id: string, archived: boolean) {
  requirePerm(ctx, "site.manage");
  const { site } = await getSite(db, ctx, id);
  return db.transaction(async (tx) => {
    await tx
      .update(sites)
      .set({ archivedAt: archived ? new Date() : null, status: archived ? "inactive" : "active", updatedAt: new Date() })
      .where(and(eq(sites.id, site.id), eq(sites.tenantId, ctx.tenantId)));
    await recordAudit(tx, ctx, archived ? "site.archived" : "site.restored", "site", site.id);
  });
}
