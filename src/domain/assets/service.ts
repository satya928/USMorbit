import { and, asc, desc, eq, gte, ilike, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import type { DbOrTx } from "@/db";
import { assets, complianceItems, sites, workOrders } from "@/db/schema";
import { requirePerm, requireSite, type AuthContext } from "@/lib/auth/context";
import { AppError, notFound } from "@/lib/errors";
import { escapeLike, recordAudit, siteScope, workOrderScope } from "@/domain/shared";
import { isUuid, parseInput, zOptDate, zOptText } from "@/domain/validation";

export const ASSET_CATEGORIES = ["HVAC", "Electrical", "Lighting", "Plumbing", "Fire & Safety", "Generator", "Lifts", "Security", "Cleaning Equipment", "Other"];

export const assetInput = z.object({
  siteId: z.uuid("Select a site"),
  code: z.string().trim().min(2).max(30).regex(/^[A-Za-z0-9-]+$/, "Letters, numbers and dashes only").transform((s) => s.toUpperCase()),
  name: z.string().trim().min(2, "Name is required").max(200),
  category: z.string().trim().min(1).max(50),
  assetType: zOptText(100),
  locationText: zOptText(300),
  manufacturer: zOptText(100),
  model: zOptText(100),
  serialNumber: zOptText(100),
  installDate: zOptDate,
  warrantyExpiry: zOptDate,
  criticality: z.enum(["low", "medium", "high", "critical"]).default("medium"),
  condition: z.enum(["good", "fair", "poor", "failed"]).default("good"),
  lastServiceAt: zOptDate,
  nextMaintenanceAt: zOptDate,
});

/**
 * Transparent rule-based health indicator (0–100). Not predictive: it starts from the recorded
 * condition and subtracts points for overdue maintenance and recent corrective work.
 */
export function assetHealth(a: { condition: string; nextMaintenanceAt: string | null }, recentWorkOrders: number, today = new Date()) {
  const base = { good: 95, fair: 75, poor: 50, failed: 15 }[a.condition] ?? 70;
  const overdue = a.nextMaintenanceAt && a.nextMaintenanceAt < today.toISOString().slice(0, 10) ? 15 : 0;
  const repeat = Math.min(30, recentWorkOrders * 8);
  const score = Math.max(0, Math.min(100, base - overdue - repeat));
  const reasons = [`Condition: ${a.condition}`];
  if (overdue) reasons.push("Maintenance overdue (−15)");
  if (repeat) reasons.push(`${recentWorkOrders} work order(s) in 90 days (−${repeat})`);
  return { score, band: score >= 80 ? "good" : score >= 55 ? "watch" : "at_risk", reasons } as const;
}

const ninetyDaysAgo = () => new Date(Date.now() - 90 * 86_400_000);

export async function listAssets(db: DbOrTx, ctx: AuthContext, opts: { q?: string; siteId?: string; category?: string } = {}) {
  requirePerm(ctx, "asset.view");
  const q = opts.q ? `%${escapeLike(opts.q)}%` : null;
  const rows = await db
    .select({
      a: assets,
      siteName: sites.name,
      recentWork: sql<number>`(select count(*)::int from ${workOrders} w where w.asset_id = ${assets.id} and w.created_at >= ${ninetyDaysAgo()} and w.status <> 'cancelled')`,
    })
    .from(assets)
    .innerJoin(sites, eq(sites.id, assets.siteId))
    .where(
      and(
        eq(assets.tenantId, ctx.tenantId),
        isNull(assets.archivedAt),
        siteScope(ctx, assets.siteId),
        opts.siteId ? eq(assets.siteId, opts.siteId) : undefined,
        opts.category ? eq(assets.category, opts.category) : undefined,
        q ? or(ilike(assets.name, q), ilike(assets.code, q), ilike(assets.serialNumber, q), ilike(assets.locationText, q)) : undefined,
      ),
    )
    .orderBy(asc(sites.name), asc(assets.code));
  return rows.map((r) => ({ ...r.a, siteName: r.siteName, health: assetHealth(r.a, r.recentWork) }));
}

export async function assetOptions(db: DbOrTx, ctx: AuthContext) {
  return db
    .select({ id: assets.id, name: assets.name, code: assets.code, siteId: assets.siteId, locationText: assets.locationText })
    .from(assets)
    .where(and(eq(assets.tenantId, ctx.tenantId), isNull(assets.archivedAt), siteScope(ctx, assets.siteId)))
    .orderBy(asc(assets.code));
}

export async function getAsset(db: DbOrTx, ctx: AuthContext, id: string) {
  requirePerm(ctx, "asset.view");
  if (!isUuid(id)) throw notFound("Asset");
  const [row] = await db
    .select({ a: assets, siteName: sites.name, siteTimezone: sites.timezone })
    .from(assets)
    .innerJoin(sites, eq(sites.id, assets.siteId))
    .where(and(eq(assets.id, id), eq(assets.tenantId, ctx.tenantId)));
  if (!row) throw notFound("Asset");
  requireSite(ctx, row.a.siteId);
  const [history, compliance, [recent]] = await Promise.all([
    db
      .select({
        id: workOrders.id,
        number: workOrders.workOrderNumber,
        title: workOrders.title,
        status: workOrders.status,
        priority: workOrders.priority,
        createdAt: workOrders.createdAt,
        closedAt: workOrders.closedAt,
      })
      .from(workOrders)
      .where(and(workOrderScope(ctx), eq(workOrders.assetId, id)))
      .orderBy(desc(workOrders.createdAt)),
    ctx.perms.has("compliance.view")
      ? db
          .select()
          .from(complianceItems)
          .where(and(eq(complianceItems.tenantId, ctx.tenantId), eq(complianceItems.assetId, id), isNull(complianceItems.archivedAt)))
      : Promise.resolve([]),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(workOrders)
      .where(
        and(
          eq(workOrders.tenantId, ctx.tenantId),
          eq(workOrders.assetId, id),
          gte(workOrders.createdAt, ninetyDaysAgo()),
          sql`${workOrders.status} <> 'cancelled'`,
        ),
      ),
  ]);
  return {
    asset: row.a,
    siteName: row.siteName,
    siteTimezone: row.siteTimezone,
    history,
    compliance,
    health: assetHealth(row.a, recent.count),
  };
}

async function validate(db: DbOrTx, ctx: AuthContext, input: z.output<typeof assetInput>, exceptId?: string) {
  requireSite(ctx, input.siteId);
  const [site] = await db
    .select({ id: sites.id })
    .from(sites)
    .where(and(eq(sites.id, input.siteId), eq(sites.tenantId, ctx.tenantId), isNull(sites.archivedAt)));
  if (!site) throw new AppError("VALIDATION", "Site not found.", { siteId: "Select a valid site" });
  const [dup] = await db.select({ id: assets.id }).from(assets).where(and(eq(assets.tenantId, ctx.tenantId), eq(assets.code, input.code)));
  if (dup && dup.id !== exceptId) throw new AppError("CONFLICT", "An asset with this code already exists.", { code: "Code already in use" });
}

const nullify = (input: z.output<typeof assetInput>) =>
  Object.fromEntries(Object.entries(input).map(([k, v]) => [k, v ?? null])) as z.output<typeof assetInput>;

export async function createAsset(db: DbOrTx, ctx: AuthContext, raw: unknown) {
  requirePerm(ctx, "asset.manage");
  const input = parseInput(assetInput, raw);
  await validate(db, ctx, input);
  return db.transaction(async (tx) => {
    const [asset] = await tx.insert(assets).values({ ...input, tenantId: ctx.tenantId }).returning();
    await recordAudit(tx, ctx, "asset.created", "asset", asset.id, { code: asset.code });
    return asset;
  });
}

export async function updateAsset(db: DbOrTx, ctx: AuthContext, id: string, raw: unknown) {
  requirePerm(ctx, "asset.manage");
  const input = parseInput(assetInput, raw);
  const { asset: existing } = await getAsset(db, ctx, id);
  await validate(db, ctx, input, existing.id);
  return db.transaction(async (tx) => {
    const [asset] = await tx
      .update(assets)
      .set({ ...nullify(input), updatedAt: new Date() })
      .where(and(eq(assets.id, existing.id), eq(assets.tenantId, ctx.tenantId)))
      .returning();
    await recordAudit(tx, ctx, "asset.updated", "asset", asset.id);
    return asset;
  });
}

export async function setAssetArchived(db: DbOrTx, ctx: AuthContext, id: string, archived: boolean) {
  requirePerm(ctx, "asset.manage");
  const { asset } = await getAsset(db, ctx, id);
  await db.transaction(async (tx) => {
    await tx
      .update(assets)
      .set({ archivedAt: archived ? new Date() : null, updatedAt: new Date() })
      .where(and(eq(assets.id, asset.id), eq(assets.tenantId, ctx.tenantId)));
    await recordAudit(tx, ctx, archived ? "asset.archived" : "asset.restored", "asset", asset.id);
  });
}
