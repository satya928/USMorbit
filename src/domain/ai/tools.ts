import { and, asc, desc, eq, gte, inArray, isNotNull, lt, sql } from "drizzle-orm";
import type { DbOrTx } from "@/db";
import { inspectionDefects, inspectionRuns, inspectionTemplates, sites, workOrders } from "@/db/schema";
import { can, type AuthContext } from "@/lib/auth/context";
import { listCompliance } from "@/domain/compliance/service";
import { runReport } from "@/domain/reports/service";
import { siteScope, workOrderScope } from "@/domain/shared";
import { categoryOptions } from "@/domain/people/service";
import { siteOptions } from "@/domain/sites/service";
import { formatWoNumber } from "@/domain/work-orders/service";
import { OPEN_STATUSES, STATUS_LABELS } from "@/domain/work-orders/state";
import { addDays } from "@/lib/time";

/**
 * Approved Copilot tools. Every tool runs as the signed-in user: permission and tenant/site scope
 * are enforced here (via the same domain services the UI uses) before any data reaches a model.
 * No tool mutates data. `draft_work_order` only returns a proposal the user must confirm.
 */
export type ToolRef = { label: string; href: string };
export type WorkOrderProposal = {
  title: string;
  description: string;
  priority: "low" | "medium" | "high" | "critical";
  categoryId?: string;
  categoryName?: string;
  siteId?: string;
  siteName?: string;
  locationText?: string;
  rationale: string;
};
export type ToolOutput = { summary: string; data: unknown; refs: ToolRef[]; proposal?: WorkOrderProposal };

const woRef = (id: string, n: number, title: string) => ({ label: `${formatWoNumber(n)} ${title}`, href: `/work-orders/${id}` });

async function resolveSite(db: DbOrTx, ctx: AuthContext, hint?: string) {
  if (!hint) return undefined;
  const opts = await siteOptions(db, ctx);
  const h = hint.toLowerCase();
  return opts.find((s) => s.id === hint || s.code.toLowerCase() === h || s.name.toLowerCase().includes(h) || h.includes(s.name.toLowerCase()));
}

export async function summarizeOpenWork(db: DbOrTx, ctx: AuthContext, args: { site?: string }): Promise<ToolOutput> {
  const site = await resolveSite(db, ctx, args.site);
  const rows = await db
    .select({ id: workOrders.id, number: workOrders.workOrderNumber, title: workOrders.title, status: workOrders.status, priority: workOrders.priority, dueAt: workOrders.dueAt, siteName: sites.name })
    .from(workOrders)
    .innerJoin(sites, eq(sites.id, workOrders.siteId))
    .where(and(workOrderScope(ctx), inArray(workOrders.status, OPEN_STATUSES), site ? eq(workOrders.siteId, site.id) : undefined))
    .orderBy(sql`case ${workOrders.priority} when 'critical' then 1 when 'high' then 2 when 'medium' then 3 else 4 end`, asc(workOrders.dueAt));
  const now = Date.now();
  const bySite: Record<string, number> = {};
  const byStatus: Record<string, number> = {};
  let overdue = 0;
  for (const r of rows) {
    bySite[r.siteName] = (bySite[r.siteName] ?? 0) + 1;
    byStatus[STATUS_LABELS[r.status]] = (byStatus[STATUS_LABELS[r.status]] ?? 0) + 1;
    if (r.dueAt && r.dueAt.getTime() < now) overdue++;
  }
  const urgent = rows.filter((r) => r.priority === "critical" || r.priority === "high");
  const scope = site ? site.name : "all sites you can access";
  const summary = rows.length
    ? `${rows.length} open work order(s) across ${scope}; ${overdue} overdue and ${urgent.length} high/critical. ` +
      `By site: ${Object.entries(bySite).map(([k, v]) => `${k} ${v}`).join(", ")}. ` +
      `By status: ${Object.entries(byStatus).map(([k, v]) => `${k} ${v}`).join(", ")}.`
    : `There is no open work for ${scope}.`;
  return {
    summary,
    data: { total: rows.length, overdue, bySite, byStatus, topPriority: urgent.slice(0, 8).map((r) => ({ wo: formatWoNumber(r.number), title: r.title, site: r.siteName, status: r.status, priority: r.priority, dueAt: r.dueAt?.toISOString() })) },
    refs: urgent.slice(0, 6).map((r) => woRef(r.id, r.number, r.title)),
  };
}

export async function listOverdueWork(db: DbOrTx, ctx: AuthContext, args: { site?: string }): Promise<ToolOutput> {
  const site = await resolveSite(db, ctx, args.site);
  const now = new Date();
  const rows = await db
    .select({
      id: workOrders.id,
      number: workOrders.workOrderNumber,
      title: workOrders.title,
      status: workOrders.status,
      priority: workOrders.priority,
      dueAt: workOrders.dueAt,
      assigned: sql<boolean>`(${workOrders.assigneePersonId} is not null or ${workOrders.contractorId} is not null)`,
      reworkCount: workOrders.reworkCount,
      siteName: sites.name,
    })
    .from(workOrders)
    .innerJoin(sites, eq(sites.id, workOrders.siteId))
    .where(and(workOrderScope(ctx), inArray(workOrders.status, OPEN_STATUSES), lt(workOrders.dueAt, now), site ? eq(workOrders.siteId, site.id) : undefined))
    .orderBy(asc(workOrders.dueAt));
  // Blockers are inferred from recorded state only — transparent rules, not speculation.
  const blocker = (r: (typeof rows)[number]) =>
    !r.assigned ? "not assigned" : r.status === "rework_required" ? `returned for rework (${r.reworkCount}x)` : r.status === "pending_approval" ? "waiting on client approval" : r.status === "ready_for_inspection" ? "waiting on inspection" : r.status === "assigned" ? "assigned but not started" : r.status === "new" || r.status === "triaged" ? "awaiting triage/assignment" : "in progress past due time";
  const items = rows.map((r) => ({
    wo: formatWoNumber(r.number),
    title: r.title,
    site: r.siteName,
    priority: r.priority,
    hoursOverdue: Math.round((now.getTime() - r.dueAt!.getTime()) / 3_600_000),
    likelyBlocker: blocker(r),
  }));
  const summary = items.length
    ? `${items.length} overdue work order(s): ` + items.slice(0, 6).map((i) => `${i.wo} (${i.site}, ${i.hoursOverdue}h late — ${i.likelyBlocker})`).join("; ") + (items.length > 6 ? `; and ${items.length - 6} more.` : ".")
    : "No work orders are overdue.";
  return { summary, data: items, refs: rows.slice(0, 8).map((r) => woRef(r.id, r.number, r.title)) };
}

export async function listExpiringCompliance(db: DbOrTx, ctx: AuthContext, args: { days?: number }): Promise<ToolOutput> {
  if (!can(ctx, "compliance.view")) return { summary: "You do not have access to compliance records.", data: [], refs: [] };
  const days = [30, 60, 90].includes(Number(args.days)) ? Number(args.days) : 30;
  const [expiring, expired] = await Promise.all([
    listCompliance(db, ctx, { view: `expiring${days}` as "expiring30" }),
    listCompliance(db, ctx, { view: "expired" }),
  ]);
  const fmt = (r: (typeof expiring)[number]) => `${r.name} (${r.relatedName}) — ${r.daysToExpiry! < 0 ? `expired ${-r.daysToExpiry!} day(s) ago` : `expires in ${r.daysToExpiry} day(s)`}`;
  const summary =
    `${expiring.length} item(s) expire in the next ${days} days` +
    (expiring.length ? `: ${expiring.map(fmt).join("; ")}` : "") +
    `. ${expired.length} item(s) already expired` +
    (expired.length ? `: ${expired.map(fmt).join("; ")}.` : ".");
  return {
    summary,
    data: { expiring: expiring.map((r) => ({ name: r.name, related: r.relatedName, expiryDate: r.expiryDate, status: r.status })), expired: expired.map((r) => ({ name: r.name, related: r.relatedName, expiryDate: r.expiryDate })) },
    refs: [...expired, ...expiring].slice(0, 8).map((r) => ({ label: r.name, href: `/compliance/${r.id}` })),
  };
}

export async function siteInspectionFailures(db: DbOrTx, ctx: AuthContext, args: { site?: string; days?: number }): Promise<ToolOutput> {
  const site = await resolveSite(db, ctx, args.site);
  const since = addDays(new Date(), -(Number(args.days) || 90));
  const runs = await db
    .select({ id: inspectionRuns.id, status: inspectionRuns.status, score: inspectionRuns.score, submittedAt: inspectionRuns.submittedAt, template: inspectionTemplates.name, siteName: sites.name })
    .from(inspectionRuns)
    .innerJoin(inspectionTemplates, eq(inspectionTemplates.id, inspectionRuns.templateId))
    .innerJoin(sites, eq(sites.id, inspectionRuns.siteId))
    .where(and(eq(inspectionRuns.tenantId, ctx.tenantId), siteScope(ctx, inspectionRuns.siteId), site ? eq(inspectionRuns.siteId, site.id) : undefined, isNotNull(inspectionRuns.submittedAt), gte(inspectionRuns.submittedAt, since)))
    .orderBy(desc(inspectionRuns.submittedAt));
  const failed = runs.filter((r) => r.status === "failed" || r.status === "needs_review");
  const defects = failed.length
    ? await db
        .select({ runId: inspectionDefects.runId, description: inspectionDefects.description, severity: inspectionDefects.severity, linked: inspectionDefects.linkedWorkOrderId })
        .from(inspectionDefects)
        .where(inArray(inspectionDefects.runId, failed.map((f) => f.id)))
    : [];
  const scope = site?.name ?? "your sites";
  const summary = runs.length
    ? `${runs.length} inspection(s) submitted at ${scope} in the last ${Number(args.days) || 90} days; ${failed.length} failed or need review. ` +
      (defects.length ? `Defects: ${defects.map((d) => `${d.description} [${d.severity}${d.linked ? ", work order raised" : ", no work order yet"}]`).join("; ")}.` : "No defects recorded on those inspections.")
    : `No inspections were submitted at ${scope} in that period.`;
  return {
    summary,
    data: { runs: runs.map((r) => ({ template: r.template, site: r.siteName, status: r.status, score: r.score })), defects },
    refs: failed.slice(0, 6).map((r) => ({ label: `${r.template} — ${r.siteName} (${r.status})`, href: `/inspections/${r.id}` })),
  };
}

export async function contractorPerformance(db: DbOrTx, ctx: AuthContext, args: { month?: string }): Promise<ToolOutput> {
  if (!can(ctx, "report.view") || !can(ctx, "contractor.view")) return { summary: "You do not have access to contractor performance.", data: [], refs: [] };
  const now = new Date();
  const m = args.month && /^\d{4}-\d{2}$/.test(args.month) ? args.month : now.toISOString().slice(0, 7);
  const from = new Date(`${m}-01T00:00:00Z`);
  const to = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, 1));
  const report = await runReport(db, ctx, "contractors", { from, to });
  const rows = report.rows.filter((r) => Number(r.assigned) > 0);
  const summary = rows.length
    ? `Contractor performance for ${m} (work created that month): ` + rows.map((r) => `${r.name}: ${r.assigned} assigned, ${r.completed} completed, ${r.overdue} overdue, ${r.rework} returned for rework`).join("; ") + "."
    : `No contractor work was created in ${m}.`;
  return { summary, data: report.rows, refs: [{ label: "Contractor performance report", href: `/reports?report=contractors&from=${m}-01` }] };
}

const CATEGORY_KEYWORDS: [string, RegExp][] = [
  ["HVAC", /\b(hvac|air ?con|a\/c|\bac\b|aircon|heating|cooling|chiller|thermostat|ventilation|too (hot|cold))\b/i],
  ["ELEC", /\b(electric|power|outlet|socket|switchboard|breaker|circuit|light(s|ing)?|lamp|flicker)\b/i],
  ["PLUMB", /\b(leak\w*|plumb\w*|pipes?|taps?|toilets?|drains?|water|flood\w*|blocked|sinks?)\b/i],
  ["FIRE", /\b(fire|smoke|alarm|extinguisher|sprinkler|exit sign|evacuation)\b/i],
  ["CLEAN", /\b(clean|spill|rubbish|trash|waste|stain|hygiene|bin|graffiti|dirty)\b/i],
  ["GEN", /\b(generator|backup power|ups)\b/i],
];

/** Deterministic, explainable classification used for drafting and as the no-AI fallback. */
export function classifyRequest(text: string) {
  const code = CATEGORY_KEYWORDS.find(([, re]) => re.test(text))?.[0] ?? "GENERAL";
  const critical = /\b(flood\w*|fire|smoke|smoking|spark\w*|gas leak|injur\w*|unsafe|danger\w*|emergency|no power)\b/i.test(text);
  const high = /\b(urgent|asap|leak\w*|not working|not cooling|broken|outage|blocked|fail\w*)\b/i.test(text);
  const low = /\b(minor|cosmetic|when possible|low priority|scuff)\b/i.test(text);
  const priority = critical ? "critical" : high ? "high" : low ? "low" : "medium";
  return { code, priority: priority as WorkOrderProposal["priority"] };
}

export async function draftWorkOrder(db: DbOrTx, ctx: AuthContext, args: { text: string; site?: string; title?: string; priority?: string; category?: string; location?: string }): Promise<ToolOutput> {
  if (!can(ctx, "wo.create")) return { summary: "You do not have permission to raise work orders.", data: null, refs: [] };
  const text = String(args.text ?? "").slice(0, 2000);
  const cls = classifyRequest(text);
  const cats = await categoryOptions(db, ctx);
  const cat = cats.find((c) => c.code === (args.category ?? "").toUpperCase() || c.name.toLowerCase() === (args.category ?? "").toLowerCase()) ?? cats.find((c) => c.code === cls.code);
  const site = (await resolveSite(db, ctx, args.site)) ?? (await siteOptions(db, ctx)).find((s) => text.toLowerCase().includes(s.name.toLowerCase()));
  const priority = (["low", "medium", "high", "critical"].includes(String(args.priority)) ? args.priority : cls.priority) as WorkOrderProposal["priority"];
  const title = (args.title?.trim() || text.split(/[.\n]/)[0]).slice(0, 120) || "New request";
  const proposal: WorkOrderProposal = {
    title,
    description: text,
    priority,
    categoryId: cat?.id,
    categoryName: cat?.name,
    siteId: site?.id,
    siteName: site?.name,
    locationText: args.location?.slice(0, 300),
    rationale: `Category "${cat?.name ?? "General"}" and priority "${priority}" ${args.priority || args.category ? "suggested by the model" : "matched from keywords in the request"}${site ? `; site matched as ${site.name}` : "; select a site before creating"}.`,
  };
  return { summary: `Drafted work order "${title}" (${priority}${cat ? `, ${cat.name}` : ""}${site ? `, ${site.name}` : ""}). Review and confirm to create it.`, data: proposal, refs: [], proposal };
}

export const COPILOT_TOOLS = {
  summarize_open_work: {
    run: summarizeOpenWork,
    description: "Summarise open work orders the user can see, optionally for one site (by name or code). Returns counts by site and status and the highest-priority items.",
    input_schema: { type: "object", properties: { site: { type: "string", description: "Site name or code; omit for all sites" } }, required: [], additionalProperties: false },
  },
  list_overdue_work: {
    run: listOverdueWork,
    description: "List open work orders past their due time with hours overdue and a likely blocker inferred from the recorded status (unassigned, awaiting inspection, rework, awaiting approval).",
    input_schema: { type: "object", properties: { site: { type: "string" } }, required: [], additionalProperties: false },
  },
  list_expiring_compliance: {
    run: listExpiringCompliance,
    description: "List compliance items (insurance, licences, certifications) expiring within 30, 60 or 90 days, plus items already expired.",
    input_schema: { type: "object", properties: { days: { type: "integer", enum: [30, 60, 90] } }, required: [], additionalProperties: false },
  },
  site_inspection_failures: {
    run: siteInspectionFailures,
    description: "Summarise recent failed or needs-review inspections and their defects, optionally for one site.",
    input_schema: { type: "object", properties: { site: { type: "string" }, days: { type: "integer", description: "Look-back window in days (default 90)" } }, required: [], additionalProperties: false },
  },
  contractor_performance: {
    run: contractorPerformance,
    description: "Contractor performance (assigned, completed, overdue, returned for rework) for work created in a calendar month (YYYY-MM, default current month).",
    input_schema: { type: "object", properties: { month: { type: "string", description: "YYYY-MM" } }, required: [], additionalProperties: false },
  },
  draft_work_order: {
    run: draftWorkOrder,
    description: "Draft (do NOT create) a work order from an issue description. Returns a proposal the user reviews and confirms in the UI. Provide your suggested title, priority (low|medium|high|critical), category code (HVAC, ELEC, PLUMB, FIRE, CLEAN, GEN, GENERAL), site and location when you can infer them.",
    input_schema: {
      type: "object",
      properties: {
        text: { type: "string", description: "The issue description in the user's words" },
        title: { type: "string" },
        priority: { type: "string", enum: ["low", "medium", "high", "critical"] },
        category: { type: "string" },
        site: { type: "string" },
        location: { type: "string" },
      },
      required: ["text"],
      additionalProperties: false,
    },
  },
} as const;
export type CopilotToolName = keyof typeof COPILOT_TOOLS;
