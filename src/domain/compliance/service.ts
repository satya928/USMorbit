import { and, asc, eq, gte, ilike, inArray, isNotNull, isNull, lt, lte, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import type { DbOrTx } from "@/db";
import { assets, complianceItems, contractors, memberships, people, sites, users } from "@/db/schema";
import { requirePerm, type AuthContext } from "@/lib/auth/context";
import { AppError, notFound } from "@/lib/errors";
import { escapeLike, notifyUsers, recordAudit } from "@/domain/shared";
import { isUuid, parseInput, zOptDate, zOptText, zOptUuid } from "@/domain/validation";
import { computeComplianceStatus, daysUntil, isoDate } from "./status";

export const COMPLIANCE_TYPE_LABELS = {
  insurance: "Insurance certificate",
  licence: "Licence",
  certification: "Certification",
  safety_document: "Safety document (SWMS/SWI)",
  site_procedure: "Site procedure",
  permit: "Permit",
  other: "Other",
} as const;

export const COMPLIANCE_VIEWS = ["all", "expiring30", "expiring60", "expiring90", "expired", "pending_review"] as const;
export type ComplianceView = (typeof COMPLIANCE_VIEWS)[number];

export const complianceInput = z
  .object({
    name: z.string().trim().min(2, "Name is required").max(200),
    itemType: z.enum(["insurance", "licence", "certification", "safety_document", "site_procedure", "permit", "other"]),
    subjectType: z.enum(["site", "asset", "person", "contractor", "organization"]),
    siteId: zOptUuid,
    assetId: zOptUuid,
    personId: zOptUuid,
    contractorId: zOptUuid,
    issuer: zOptText(200),
    referenceNumber: zOptText(100),
    issueDate: zOptDate,
    expiryDate: zOptDate,
    notApplicable: z.preprocess((v) => v === true || v === "on" || v === "true", z.boolean()).default(false),
    notes: zOptText(2000),
  })
  .superRefine((v, ctx) => {
    const required = { site: "siteId", asset: "assetId", person: "personId", contractor: "contractorId" } as const;
    if (v.subjectType !== "organization") {
      const key = required[v.subjectType];
      if (!v[key]) ctx.addIssue({ code: "custom", path: [key], message: `Select the related ${v.subjectType}` });
    }
    if (v.issueDate && v.expiryDate && v.expiryDate < v.issueDate)
      ctx.addIssue({ code: "custom", path: ["expiryDate"], message: "Expiry must be after issue date" });
  });

/** Visibility: site-linked items follow site scope; contractor managers see only their contractor's items. */
function complianceScope(ctx: AuthContext): SQL {
  const conds: (SQL | undefined)[] = [eq(complianceItems.tenantId, ctx.tenantId), isNull(complianceItems.archivedAt)];
  if (!ctx.allSites) {
    conds.push(or(isNull(complianceItems.siteId), ctx.siteIds.length ? inArray(complianceItems.siteId, ctx.siteIds) : sql`false`));
  }
  if (ctx.role === "contractor_manager") {
    conds.push(ctx.contractorId ? eq(complianceItems.contractorId, ctx.contractorId) : sql`false`);
  }
  return and(...conds)!;
}

export function complianceViewCondition(view: ComplianceView, now = new Date()): SQL | undefined {
  const today = isoDate(now);
  const live = eq(complianceItems.notApplicable, false);
  const window = (days: number) =>
    and(live, isNotNull(complianceItems.expiryDate), gte(complianceItems.expiryDate, today), lte(complianceItems.expiryDate, isoDate(now, days)));
  switch (view) {
    case "expiring30":
      return window(30);
    case "expiring60":
      return window(60);
    case "expiring90":
      return window(90);
    case "expired":
      return and(live, lt(complianceItems.expiryDate, today));
    case "pending_review":
      return and(
        live,
        eq(complianceItems.verificationStatus, "pending_review"),
        or(isNull(complianceItems.expiryDate), gte(complianceItems.expiryDate, today)),
      );
    default:
      return undefined;
  }
}

export async function listCompliance(db: DbOrTx, ctx: AuthContext, opts: { view?: ComplianceView; q?: string; siteId?: string } = {}) {
  requirePerm(ctx, "compliance.view");
  const q = opts.q ? `%${escapeLike(opts.q)}%` : null;
  const rows = await db
    .select({
      item: complianceItems,
      siteName: sites.name,
      assetName: assets.name,
      personName: people.name,
      contractorName: contractors.name,
      verifiedByName: users.name,
    })
    .from(complianceItems)
    .leftJoin(sites, eq(sites.id, complianceItems.siteId))
    .leftJoin(assets, eq(assets.id, complianceItems.assetId))
    .leftJoin(people, eq(people.id, complianceItems.personId))
    .leftJoin(contractors, eq(contractors.id, complianceItems.contractorId))
    .leftJoin(users, eq(users.id, complianceItems.verifiedByUserId))
    .where(
      and(
        complianceScope(ctx),
        complianceViewCondition(opts.view ?? "all"),
        opts.siteId ? eq(complianceItems.siteId, opts.siteId) : undefined,
        q ? or(ilike(complianceItems.name, q), ilike(complianceItems.issuer, q), ilike(complianceItems.referenceNumber, q)) : undefined,
      ),
    )
    .orderBy(sql`${complianceItems.expiryDate} asc nulls last`, asc(complianceItems.name));
  return rows.map((r) => ({
    ...r.item,
    relatedName: r.siteName ?? r.assetName ?? r.personName ?? r.contractorName ?? ctx.tenantName,
    verifiedByName: r.verifiedByName,
    status: computeComplianceStatus(r.item),
    daysToExpiry: daysUntil(r.item.expiryDate),
  }));
}
export type ComplianceRow = Awaited<ReturnType<typeof listCompliance>>[number];

export async function complianceCounts(db: DbOrTx, ctx: AuthContext) {
  requirePerm(ctx, "compliance.view");
  const count = async (view: ComplianceView) =>
    (await db.select({ n: sql<number>`count(*)::int` }).from(complianceItems).where(and(complianceScope(ctx), complianceViewCondition(view))))[0].n;
  const [all, expiring30, expiring60, expiring90, expired, pending_review] = await Promise.all(COMPLIANCE_VIEWS.map(count));
  return { all, expiring30, expiring60, expiring90, expired, pending_review };
}

export async function getComplianceItem(db: DbOrTx, ctx: AuthContext, id: string) {
  requirePerm(ctx, "compliance.view");
  if (!isUuid(id)) throw notFound("Compliance item");
  const [row] = await listComplianceById(db, ctx, id);
  if (!row) throw notFound("Compliance item");
  return row;
}

async function listComplianceById(db: DbOrTx, ctx: AuthContext, id: string) {
  const rows = await db
    .select({ item: complianceItems, verifiedByName: users.name })
    .from(complianceItems)
    .leftJoin(users, eq(users.id, complianceItems.verifiedByUserId))
    .where(and(complianceScope(ctx), eq(complianceItems.id, id)));
  return rows.map((r) => ({ ...r.item, verifiedByName: r.verifiedByName, status: computeComplianceStatus(r.item), daysToExpiry: daysUntil(r.item.expiryDate) }));
}

async function validateSubject(db: DbOrTx, ctx: AuthContext, v: z.output<typeof complianceInput>) {
  const t = ctx.tenantId;
  const checks: [string | undefined, () => Promise<unknown[]>, string][] = [
    [v.siteId, () => db.select({ id: sites.id }).from(sites).where(and(eq(sites.id, v.siteId!), eq(sites.tenantId, t))), "siteId"],
    [v.assetId, () => db.select({ id: assets.id }).from(assets).where(and(eq(assets.id, v.assetId!), eq(assets.tenantId, t))), "assetId"],
    [v.personId, () => db.select({ id: people.id }).from(people).where(and(eq(people.id, v.personId!), eq(people.tenantId, t))), "personId"],
    [
      v.contractorId,
      () => db.select({ id: contractors.id }).from(contractors).where(and(eq(contractors.id, v.contractorId!), eq(contractors.tenantId, t))),
      "contractorId",
    ],
  ];
  for (const [val, q, field] of checks) {
    if (val && !(await q()).length) throw new AppError("VALIDATION", "Related record not found.", { [field]: "Not found" });
  }
  if (v.siteId && !ctx.allSites && !ctx.siteIds.includes(v.siteId)) throw notFound("Site");
}

/** Only keep the reference matching the subject type so an item is never linked to two entities. */
function subjectRefs(v: z.output<typeof complianceInput>) {
  return {
    siteId: v.subjectType === "site" ? v.siteId! : null,
    assetId: v.subjectType === "asset" ? v.assetId! : null,
    personId: v.subjectType === "person" ? v.personId! : null,
    contractorId: v.subjectType === "contractor" ? v.contractorId! : null,
  };
}

export async function createComplianceItem(db: DbOrTx, ctx: AuthContext, raw: unknown) {
  requirePerm(ctx, "compliance.manage");
  const v = parseInput(complianceInput, raw);
  await validateSubject(db, ctx, v);
  return db.transaction(async (tx) => {
    const [item] = await tx
      .insert(complianceItems)
      .values({
        tenantId: ctx.tenantId,
        name: v.name,
        itemType: v.itemType,
        subjectType: v.subjectType,
        ...subjectRefs(v),
        issuer: v.issuer,
        referenceNumber: v.referenceNumber,
        issueDate: v.issueDate,
        expiryDate: v.expiryDate,
        notApplicable: v.notApplicable,
        notes: v.notes,
        createdByUserId: ctx.userId,
      })
      .returning();
    await recordAudit(tx, ctx, "compliance.created", "compliance_item", item.id, { name: item.name, expiryDate: item.expiryDate });
    return item;
  });
}

export async function updateComplianceItem(db: DbOrTx, ctx: AuthContext, id: string, raw: unknown) {
  requirePerm(ctx, "compliance.manage");
  const v = parseInput(complianceInput, raw);
  const existing = await getComplianceItem(db, ctx, id);
  await validateSubject(db, ctx, v);
  const expiryChanged = existing.expiryDate !== (v.expiryDate ?? null);
  return db.transaction(async (tx) => {
    const [item] = await tx
      .update(complianceItems)
      .set({
        name: v.name,
        itemType: v.itemType,
        subjectType: v.subjectType,
        ...subjectRefs(v),
        issuer: v.issuer ?? null,
        referenceNumber: v.referenceNumber ?? null,
        issueDate: v.issueDate ?? null,
        expiryDate: v.expiryDate ?? null,
        notApplicable: v.notApplicable,
        notes: v.notes ?? null,
        // A changed expiry date is new evidence: it must be re-verified.
        ...(expiryChanged ? { verificationStatus: "pending_review" as const, verifiedAt: null, verifiedByUserId: null } : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(complianceItems.id, existing.id), eq(complianceItems.tenantId, ctx.tenantId)))
      .returning();
    await recordAudit(tx, ctx, "compliance.updated", "compliance_item", item.id, {
      ...(expiryChanged ? { expiryDate: { from: existing.expiryDate, to: item.expiryDate } } : {}),
    });
    return item;
  });
}

export async function verifyComplianceItem(db: DbOrTx, ctx: AuthContext, id: string, verified: boolean) {
  requirePerm(ctx, "compliance.verify");
  const existing = await getComplianceItem(db, ctx, id);
  return db.transaction(async (tx) => {
    const [item] = await tx
      .update(complianceItems)
      .set({
        verificationStatus: verified ? "verified" : "pending_review",
        verifiedByUserId: verified ? ctx.userId : null,
        verifiedAt: verified ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(and(eq(complianceItems.id, existing.id), eq(complianceItems.tenantId, ctx.tenantId)))
      .returning();
    await recordAudit(tx, ctx, verified ? "compliance.verified" : "compliance.unverified", "compliance_item", item.id);
    return item;
  });
}

export async function archiveComplianceItem(db: DbOrTx, ctx: AuthContext, id: string) {
  requirePerm(ctx, "compliance.manage");
  const existing = await getComplianceItem(db, ctx, id);
  await db.transaction(async (tx) => {
    await tx.update(complianceItems).set({ archivedAt: new Date() }).where(and(eq(complianceItems.id, existing.id), eq(complianceItems.tenantId, ctx.tenantId)));
    await recordAudit(tx, ctx, "compliance.archived", "compliance_item", existing.id);
  });
}

/**
 * Create deduplicated in-app alerts for items expired or expiring within 30 days. Safe to call often:
 * the dedupe key includes the expiry date and status, so each alert is raised once per state.
 */
export async function syncComplianceAlerts(db: DbOrTx, tenantId: string) {
  const items = await db
    .select()
    .from(complianceItems)
    .where(
      and(
        eq(complianceItems.tenantId, tenantId),
        isNull(complianceItems.archivedAt),
        eq(complianceItems.notApplicable, false),
        lte(complianceItems.expiryDate, isoDate(new Date(), 30)),
      ),
    );
  if (!items.length) return 0;
  const recipients = await db
    .select({ userId: memberships.userId })
    .from(memberships)
    .where(
      and(
        eq(memberships.tenantId, tenantId),
        eq(memberships.status, "active"),
        sql`${memberships.role} in ('tenant_admin','facilities_manager')`,
      ),
    );
  for (const item of items) {
    const status = computeComplianceStatus(item);
    const days = daysUntil(item.expiryDate);
    await notifyUsers(
      db,
      tenantId,
      recipients.map((r) => r.userId),
      {
        type: status === "expired" ? "compliance.expired" : "compliance.expiring",
        title: status === "expired" ? `Expired: ${item.name}` : `Expiring in ${days} day(s): ${item.name}`,
        body: `Expiry date ${item.expiryDate}`,
        link: `/compliance/${item.id}`,
        dedupeKey: `compliance:${item.id}:${status === "expired" ? "expired" : "expiring"}:${item.expiryDate}`,
      },
    );
  }
  return items.length;
}
