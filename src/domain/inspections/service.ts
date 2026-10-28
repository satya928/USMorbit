import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import type { DbOrTx } from "@/db";
import {
  fileAttachments,
  inspectionAnswers,
  inspectionDefects,
  inspectionRuns,
  inspectionTemplateItems,
  inspectionTemplates,
  sites,
  users,
  workOrders,
} from "@/db/schema";
import { requirePerm, requireSite, type AuthContext } from "@/lib/auth/context";
import { AppError, notFound } from "@/lib/errors";
import { recordAudit, siteScope } from "@/domain/shared";
import { isUuid, parseInput, zOptText, zOptUuid } from "@/domain/validation";
import { createWorkOrder, formatWoNumber } from "@/domain/work-orders/service";

export const INSPECTION_STATUS_LABELS = {
  draft: "Draft",
  in_progress: "In progress",
  submitted: "Submitted",
  passed: "Passed",
  failed: "Failed",
  needs_review: "Needs review",
} as const;

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

const templateItemInput = z.object({
  prompt: z.string().trim().min(2).max(300),
  answerType: z.enum(["pass_fail", "score"]).default("pass_fail"),
  maxScore: z.coerce.number().int().min(1).max(10).optional(),
  requiresEvidence: z.boolean().default(false),
});

export const templateInput = z.object({
  name: z.string().trim().min(2, "Name is required").max(200),
  category: z.string().trim().min(2).max(100),
  serviceType: zOptText(100),
  items: z.array(templateItemInput).min(1, "Add at least one checklist item").max(60),
});

/**
 * Parse the template builder textarea: one item per line, optional flags after a pipe.
 * Example: "Floors free of debris | evidence" or "Overall cleanliness | score:5".
 */
export function parseTemplateLines(text: string) {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const [prompt, ...flags] = line.split("|").map((s) => s.trim());
      const flagStr = flags.join(" ").toLowerCase();
      const score = /score:(\d+)/.exec(flagStr);
      return {
        prompt,
        answerType: score ? ("score" as const) : ("pass_fail" as const),
        maxScore: score ? Number(score[1]) : undefined,
        requiresEvidence: flagStr.includes("evidence"),
      };
    });
}

export async function listTemplates(db: DbOrTx, ctx: AuthContext) {
  requirePerm(ctx, "inspection.view");
  return db
    .select({
      id: inspectionTemplates.id,
      name: inspectionTemplates.name,
      category: inspectionTemplates.category,
      serviceType: inspectionTemplates.serviceType,
      itemCount: sql<number>`(select count(*)::int from ${inspectionTemplateItems} i where i.template_id = ${inspectionTemplates.id})`,
      runCount: sql<number>`(select count(*)::int from ${inspectionRuns} r where r.template_id = ${inspectionTemplates.id})`,
    })
    .from(inspectionTemplates)
    .where(and(eq(inspectionTemplates.tenantId, ctx.tenantId), isNull(inspectionTemplates.archivedAt)))
    .orderBy(asc(inspectionTemplates.name));
}

export async function getTemplate(db: DbOrTx, ctx: AuthContext, id: string) {
  requirePerm(ctx, "inspection.view");
  if (!isUuid(id)) throw notFound("Template");
  const [t] = await db
    .select()
    .from(inspectionTemplates)
    .where(and(eq(inspectionTemplates.id, id), eq(inspectionTemplates.tenantId, ctx.tenantId)));
  if (!t) throw notFound("Template");
  const items = await db
    .select()
    .from(inspectionTemplateItems)
    .where(eq(inspectionTemplateItems.templateId, id))
    .orderBy(asc(inspectionTemplateItems.position));
  return { template: t, items };
}

export async function createTemplate(db: DbOrTx, ctx: AuthContext, raw: unknown) {
  requirePerm(ctx, "inspection.template.manage");
  const input = parseInput(templateInput, raw);
  return db.transaction(async (tx) => {
    const [t] = await tx
      .insert(inspectionTemplates)
      .values({ tenantId: ctx.tenantId, name: input.name, category: input.category, serviceType: input.serviceType })
      .returning();
    await tx.insert(inspectionTemplateItems).values(input.items.map((it, i) => ({ ...it, tenantId: ctx.tenantId, templateId: t.id, position: i })));
    await recordAudit(tx, ctx, "inspection_template.created", "inspection_template", t.id, { name: t.name });
    return t;
  });
}

export async function archiveTemplate(db: DbOrTx, ctx: AuthContext, id: string) {
  requirePerm(ctx, "inspection.template.manage");
  const { template } = await getTemplate(db, ctx, id);
  await db.update(inspectionTemplates).set({ archivedAt: new Date() }).where(eq(inspectionTemplates.id, template.id));
  await recordAudit(db, ctx, "inspection_template.archived", "inspection_template", template.id);
}

// ---------------------------------------------------------------------------
// Runs
// ---------------------------------------------------------------------------

export async function listRuns(db: DbOrTx, ctx: AuthContext, opts: { siteId?: string; status?: string } = {}) {
  requirePerm(ctx, "inspection.view");
  return db
    .select({
      id: inspectionRuns.id,
      status: inspectionRuns.status,
      score: inspectionRuns.score,
      startedAt: inspectionRuns.startedAt,
      submittedAt: inspectionRuns.submittedAt,
      templateName: inspectionTemplates.name,
      siteName: sites.name,
      siteTimezone: sites.timezone,
      inspectorName: users.name,
      workOrderId: inspectionRuns.workOrderId,
      workOrderNumber: workOrders.workOrderNumber,
      defectCount: sql<number>`(select count(*)::int from ${inspectionDefects} d where d.run_id = ${inspectionRuns.id})`,
    })
    .from(inspectionRuns)
    .innerJoin(inspectionTemplates, eq(inspectionTemplates.id, inspectionRuns.templateId))
    .innerJoin(sites, eq(sites.id, inspectionRuns.siteId))
    .innerJoin(users, eq(users.id, inspectionRuns.inspectorUserId))
    .leftJoin(workOrders, eq(workOrders.id, inspectionRuns.workOrderId))
    .where(
      and(
        eq(inspectionRuns.tenantId, ctx.tenantId),
        siteScope(ctx, inspectionRuns.siteId),
        opts.siteId ? eq(inspectionRuns.siteId, opts.siteId) : undefined,
        opts.status ? eq(inspectionRuns.status, opts.status as (typeof inspectionRuns.status.enumValues)[number]) : undefined,
      ),
    )
    .orderBy(desc(inspectionRuns.startedAt));
}

export const startRunInput = z.object({ templateId: z.uuid("Select a template"), siteId: z.uuid("Select a site"), workOrderId: zOptUuid });

export async function startRun(db: DbOrTx, ctx: AuthContext, raw: unknown) {
  requirePerm(ctx, "inspection.run");
  const input = parseInput(startRunInput, raw);
  requireSite(ctx, input.siteId);
  const { template } = await getTemplate(db, ctx, input.templateId);
  if (template.archivedAt) throw new AppError("VALIDATION", "This template is archived.");
  const [site] = await db.select({ id: sites.id }).from(sites).where(and(eq(sites.id, input.siteId), eq(sites.tenantId, ctx.tenantId)));
  if (!site) throw new AppError("VALIDATION", "Site not found.", { siteId: "Select a valid site" });
  if (input.workOrderId) {
    const [wo] = await db
      .select({ siteId: workOrders.siteId })
      .from(workOrders)
      .where(and(eq(workOrders.id, input.workOrderId), eq(workOrders.tenantId, ctx.tenantId)));
    if (!wo || wo.siteId !== input.siteId) throw new AppError("VALIDATION", "Work order must be at the selected site.", { workOrderId: "Not at this site" });
  }
  const [run] = await db
    .insert(inspectionRuns)
    .values({ tenantId: ctx.tenantId, templateId: template.id, siteId: input.siteId, workOrderId: input.workOrderId, inspectorUserId: ctx.userId })
    .returning();
  return run;
}

async function loadRun(db: DbOrTx, ctx: AuthContext, id: string) {
  if (!isUuid(id)) throw notFound("Inspection");
  const [run] = await db.select().from(inspectionRuns).where(and(eq(inspectionRuns.id, id), eq(inspectionRuns.tenantId, ctx.tenantId)));
  if (!run) throw notFound("Inspection");
  requireSite(ctx, run.siteId);
  return run;
}

export async function getRun(db: DbOrTx, ctx: AuthContext, id: string) {
  requirePerm(ctx, "inspection.view");
  const run = await loadRun(db, ctx, id);
  const [[template], items, answers, defects, files, [site], [inspector], [wo]] = await Promise.all([
    db.select().from(inspectionTemplates).where(eq(inspectionTemplates.id, run.templateId)),
    db.select().from(inspectionTemplateItems).where(eq(inspectionTemplateItems.templateId, run.templateId)).orderBy(asc(inspectionTemplateItems.position)),
    db.select().from(inspectionAnswers).where(eq(inspectionAnswers.runId, run.id)),
    db
      .select({ d: inspectionDefects, woNumber: workOrders.workOrderNumber })
      .from(inspectionDefects)
      .leftJoin(workOrders, eq(workOrders.id, inspectionDefects.linkedWorkOrderId))
      .where(eq(inspectionDefects.runId, run.id))
      .orderBy(asc(inspectionDefects.createdAt)),
    db
      .select()
      .from(fileAttachments)
      .where(and(eq(fileAttachments.tenantId, ctx.tenantId), eq(fileAttachments.entityType, "inspection_run"), eq(fileAttachments.entityId, run.id))),
    db.select({ id: sites.id, name: sites.name, timezone: sites.timezone }).from(sites).where(eq(sites.id, run.siteId)),
    db.select({ name: users.name }).from(users).where(eq(users.id, run.inspectorUserId)),
    run.workOrderId
      ? db
          .select({ id: workOrders.id, number: workOrders.workOrderNumber, title: workOrders.title, status: workOrders.status })
          .from(workOrders)
          .where(eq(workOrders.id, run.workOrderId))
      : Promise.resolve([]),
  ]);
  const editable = ["draft", "in_progress"].includes(run.status) && ctx.perms.has("inspection.run");
  return {
    run,
    template,
    items,
    answers: Object.fromEntries(answers.map((a) => [a.templateItemId, a])),
    defects: defects.map((r) => ({ ...r.d, workOrderNumber: r.woNumber })),
    files,
    site,
    inspectorName: inspector?.name ?? "",
    workOrder: wo ?? null,
    editable,
    canCreateWorkOrder: ctx.perms.has("wo.create"),
  };
}

const answerValue = z.preprocess((v) => (v === "" ? undefined : v), z.enum(["pass", "fail", "na"]).optional());

export const answersInput = z.object({
  answers: z.array(
    z.object({
      templateItemId: z.uuid(),
      value: answerValue,
      score: z.preprocess((v) => (v === "" || v == null ? undefined : Number(v)), z.number().int().min(0).max(10).optional()),
      note: zOptText(1000),
    }),
  ),
  notes: zOptText(4000),
});

async function requireEditableRun(db: DbOrTx, ctx: AuthContext, id: string) {
  requirePerm(ctx, "inspection.run");
  const run = await loadRun(db, ctx, id);
  if (!["draft", "in_progress"].includes(run.status)) throw new AppError("CONFLICT", "This inspection has been submitted and is read-only.");
  return run;
}

export async function saveAnswers(db: DbOrTx, ctx: AuthContext, runId: string, raw: unknown) {
  const input = parseInput(answersInput, raw);
  return db.transaction(async (tx) => {
    const run = await requireEditableRun(tx, ctx, runId);
    const items = await tx.select().from(inspectionTemplateItems).where(eq(inspectionTemplateItems.templateId, run.templateId));
    const byId = new Map(items.map((i) => [i.id, i]));
    for (const a of input.answers) {
      const item = byId.get(a.templateItemId);
      if (!item) throw new AppError("VALIDATION", "Answer references an item outside this template.");
      if (item.answerType === "score" && a.score !== undefined && a.score > (item.maxScore ?? 5)) {
        throw new AppError("VALIDATION", `Score for "${item.prompt}" exceeds the maximum of ${item.maxScore ?? 5}.`);
      }
      await tx
        .insert(inspectionAnswers)
        .values({ tenantId: ctx.tenantId, runId: run.id, templateItemId: item.id, value: a.value ?? null, score: a.score ?? null, note: a.note ?? null })
        .onConflictDoUpdate({
          target: [inspectionAnswers.runId, inspectionAnswers.templateItemId],
          set: { value: a.value ?? null, score: a.score ?? null, note: a.note ?? null, updatedAt: new Date() },
        });
    }
    await tx.update(inspectionRuns).set({ notes: input.notes ?? null, updatedAt: new Date() }).where(eq(inspectionRuns.id, run.id));
  });
}

export const defectInput = z.object({
  description: z.string().trim().min(3, "Describe the defect").max(1000),
  severity: z.enum(["low", "medium", "high", "critical"]).default("medium"),
  locationText: zOptText(300),
  templateItemId: zOptUuid,
});

export async function addDefect(db: DbOrTx, ctx: AuthContext, runId: string, raw: unknown) {
  const input = parseInput(defectInput, raw);
  const run = await requireEditableRun(db, ctx, runId);
  if (input.templateItemId) {
    const [item] = await db
      .select({ id: inspectionTemplateItems.id })
      .from(inspectionTemplateItems)
      .where(and(eq(inspectionTemplateItems.id, input.templateItemId), eq(inspectionTemplateItems.templateId, run.templateId)));
    if (!item) throw new AppError("VALIDATION", "Checklist item not in this template.");
  }
  const [d] = await db.insert(inspectionDefects).values({ ...input, tenantId: ctx.tenantId, runId: run.id, createdByUserId: ctx.userId }).returning();
  return d;
}

/** Result rules: any failed item or high/critical defect → failed; missing required evidence → needs_review; else passed. */
export function computeRunResult(input: {
  items: { id: string; answerType: "pass_fail" | "score"; maxScore: number | null; requiresEvidence: boolean }[];
  answers: Record<string, { value: string | null; score: number | null } | undefined>;
  defects: { severity: string }[];
  evidenceCount: number;
}) {
  const missing = input.items.filter((i) => {
    const a = input.answers[i.id];
    return i.answerType === "score" ? a?.score == null && a?.value !== "na" : !a?.value;
  });
  let earned = 0;
  let possible = 0;
  let anyFail = false;
  for (const i of input.items) {
    const a = input.answers[i.id];
    if (!a || a.value === "na") continue;
    if (i.answerType === "score") {
      const max = i.maxScore ?? 5;
      possible += max;
      earned += a.score ?? 0;
      if ((a.score ?? 0) / max < 0.5) anyFail = true;
    } else {
      possible += 1;
      if (a.value === "pass") earned += 1;
      if (a.value === "fail") anyFail = true;
    }
  }
  const severeDefect = input.defects.some((d) => d.severity === "high" || d.severity === "critical");
  const evidenceMissing = input.items.some((i) => i.requiresEvidence) && input.evidenceCount === 0;
  const status = anyFail || severeDefect ? "failed" : evidenceMissing ? "needs_review" : "passed";
  const score = possible ? Math.round((earned / possible) * 1000) / 10 : null;
  return { missing, status, score, evidenceMissing } as const;
}

export async function submitRun(db: DbOrTx, ctx: AuthContext, runId: string, raw: unknown) {
  const { signedOffByName } = parseInput(z.object({ signedOffByName: zOptText(200) }), raw);
  return db.transaction(async (tx) => {
    const run = await requireEditableRun(tx, ctx, runId);
    const [items, answers, defects, [{ files }]] = await Promise.all([
      tx.select().from(inspectionTemplateItems).where(eq(inspectionTemplateItems.templateId, run.templateId)),
      tx.select().from(inspectionAnswers).where(eq(inspectionAnswers.runId, run.id)),
      tx.select({ severity: inspectionDefects.severity }).from(inspectionDefects).where(eq(inspectionDefects.runId, run.id)),
      tx
        .select({ files: sql<number>`count(*)::int` })
        .from(fileAttachments)
        .where(and(eq(fileAttachments.entityType, "inspection_run"), eq(fileAttachments.entityId, run.id))),
    ]);
    const result = computeRunResult({ items, answers: Object.fromEntries(answers.map((a) => [a.templateItemId, a])), defects, evidenceCount: files });
    if (result.missing.length) {
      throw new AppError("VALIDATION", `Answer all items before submitting (${result.missing.length} remaining).`);
    }
    const [updated] = await tx
      .update(inspectionRuns)
      .set({ status: result.status, score: result.score?.toString() ?? null, submittedAt: new Date(), signedOffByName: signedOffByName ?? null, updatedAt: new Date() })
      .where(eq(inspectionRuns.id, run.id))
      .returning();
    await recordAudit(tx, ctx, "inspection.submitted", "inspection_run", run.id, { status: result.status, score: result.score });
    return updated;
  });
}

/** Create a work order prefilled from a defect, then link the two. */
export async function createWorkOrderFromDefect(db: DbOrTx, ctx: AuthContext, defectId: string) {
  requirePerm(ctx, "wo.create");
  if (!isUuid(defectId)) throw notFound("Defect");
  const [row] = await db
    .select({ d: inspectionDefects, run: inspectionRuns, templateName: inspectionTemplates.name, itemPrompt: inspectionTemplateItems.prompt })
    .from(inspectionDefects)
    .innerJoin(inspectionRuns, eq(inspectionRuns.id, inspectionDefects.runId))
    .innerJoin(inspectionTemplates, eq(inspectionTemplates.id, inspectionRuns.templateId))
    .leftJoin(inspectionTemplateItems, eq(inspectionTemplateItems.id, inspectionDefects.templateItemId))
    .where(and(eq(inspectionDefects.id, defectId), eq(inspectionDefects.tenantId, ctx.tenantId)));
  if (!row) throw notFound("Defect");
  requireSite(ctx, row.run.siteId);
  if (row.d.linkedWorkOrderId) throw new AppError("CONFLICT", "A work order already exists for this defect.");

  return db.transaction(async (tx) => {
  const wo = await createWorkOrder(tx, ctx, {
    title: `Defect: ${row.d.description.slice(0, 120)}`,
    description: [
      row.d.description,
      "",
      `Source: ${row.templateName} inspection${row.itemPrompt ? ` — item "${row.itemPrompt}"` : ""}.`,
      `Severity: ${row.d.severity}.`,
    ].join("\n"),
    siteId: row.run.siteId,
    locationText: row.d.locationText ?? undefined,
    priority: row.d.severity,
    sourceInspectionId: row.run.id,
  });
  await tx.update(inspectionDefects).set({ linkedWorkOrderId: wo.id }).where(eq(inspectionDefects.id, row.d.id));
  await recordAudit(tx, ctx, "inspection.defect_work_order", "inspection_defect", row.d.id, { workOrder: formatWoNumber(wo.workOrderNumber) });
  return wo;
  });
}

export async function workOrdersForSite(db: DbOrTx, ctx: AuthContext, siteIds: string[]) {
  if (!siteIds.length) return [];
  return db
    .select({ id: workOrders.id, number: workOrders.workOrderNumber, title: workOrders.title, siteId: workOrders.siteId })
    .from(workOrders)
    .where(and(eq(workOrders.tenantId, ctx.tenantId), inArray(workOrders.siteId, siteIds), sql`${workOrders.status} not in ('closed','cancelled')`))
    .orderBy(desc(workOrders.createdAt))
    .limit(200);
}
