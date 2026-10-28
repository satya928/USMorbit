import { and, asc, desc, eq, gte, inArray, isNotNull, lt, sql } from "drizzle-orm";
import type { DbOrTx } from "@/db";
import {
  approvalDecisions,
  contractors,
  inspectionDefects,
  inspectionRuns,
  inspectionTemplates,
  people,
  sites,
  users,
  workCategories,
  workOrders,
  type Priority,
  type WorkOrderStatus,
} from "@/db/schema";
import { requirePerm, type AuthContext } from "@/lib/auth/context";
import { formatExportDateTime } from "@/lib/time";
import { listCompliance } from "@/domain/compliance/service";
import { COMPLIANCE_STATUS_LABELS } from "@/domain/compliance/status";
import { contractorPerformanceSql } from "@/domain/people/service";
import { siteScope, workOrderScope } from "@/domain/shared";
import { formatWoNumber } from "@/domain/work-orders/service";
import { OPEN_STATUSES, STATUS_LABELS } from "@/domain/work-orders/state";
import { slaCompliance, type MetricFilters } from "@/domain/metrics/service";

export const REPORTS = {
  "work-orders": { title: "Work-order register", description: "All work orders created in the period." },
  sla: { title: "SLA performance", description: "Completed work meeting its due time, by site and priority." },
  overdue: { title: "Overdue work", description: "Open work orders past their due time (as of now)." },
  breakdown: { title: "Work orders by dimension", description: "Counts by site, category, priority or status." },
  contractors: { title: "Contractor performance", description: "Assigned, completed, overdue and rework counts in the period." },
  inspections: { title: "Inspection results & defects", description: "Inspections submitted in the period and their defects." },
  compliance: { title: "Compliance expiry register", description: "All compliance records with derived status (as of today)." },
  approvals: { title: "Approval & rework cycle", description: "Client approval decisions recorded in the period." },
} as const;
export type ReportKey = keyof typeof REPORTS;
export const isReportKey = (k: string): k is ReportKey => k in REPORTS;

export type ReportFilters = MetricFilters & { groupBy?: "site" | "category" | "priority" | "status" };
type Cell = string | number | null;
export type ReportResult = { columns: { key: string; label: string; numeric?: boolean }[]; rows: Record<string, Cell>[]; note?: string };

const pct = (r: number | null) => (r === null ? null : Math.round(r * 1000) / 10);

function woWhere(ctx: AuthContext, f: ReportFilters) {
  return and(
    workOrderScope(ctx),
    f.siteId ? eq(workOrders.siteId, f.siteId) : undefined,
    f.status ? eq(workOrders.status, f.status as WorkOrderStatus) : undefined,
    f.priority ? eq(workOrders.priority, f.priority as Priority) : undefined,
  );
}

export async function runReport(db: DbOrTx, ctx: AuthContext, key: ReportKey, f: ReportFilters): Promise<ReportResult> {
  requirePerm(ctx, "report.view");
  const period = (col: Parameters<typeof gte>[0]) => and(isNotNull(col), gte(col, f.from), lt(col, f.to));

  switch (key) {
    case "work-orders":
    case "overdue": {
      const rows = await db
        .select({
          number: workOrders.workOrderNumber,
          title: workOrders.title,
          site: sites.name,
          tz: sites.timezone,
          category: workCategories.name,
          priority: workOrders.priority,
          status: workOrders.status,
          assignee: people.name,
          contractor: contractors.name,
          createdAt: workOrders.createdAt,
          dueAt: workOrders.dueAt,
          completedAt: workOrders.completedAt,
          closedAt: workOrders.closedAt,
          reworkCount: workOrders.reworkCount,
        })
        .from(workOrders)
        .innerJoin(sites, eq(sites.id, workOrders.siteId))
        .leftJoin(workCategories, eq(workCategories.id, workOrders.categoryId))
        .leftJoin(people, eq(people.id, workOrders.assigneePersonId))
        .leftJoin(contractors, eq(contractors.id, workOrders.contractorId))
        .where(
          and(
            woWhere(ctx, f),
            key === "overdue"
              ? and(inArray(workOrders.status, OPEN_STATUSES), lt(workOrders.dueAt, new Date()))
              : period(workOrders.createdAt),
          ),
        )
        .orderBy(key === "overdue" ? asc(workOrders.dueAt) : desc(workOrders.createdAt));
      const now = Date.now();
      return {
        columns: [
          { key: "number", label: "Work order" },
          { key: "title", label: "Title" },
          { key: "site", label: "Site" },
          { key: "category", label: "Category" },
          { key: "priority", label: "Priority" },
          { key: "status", label: "Status" },
          { key: "assignee", label: "Assignee" },
          { key: "contractor", label: "Contractor" },
          { key: "created", label: "Created (site time)" },
          { key: "due", label: "Due (site time)" },
          ...(key === "overdue"
            ? [{ key: "hoursOverdue", label: "Hours overdue", numeric: true }]
            : [
                { key: "completed", label: "Completed (site time)" },
                { key: "rework", label: "Rework count", numeric: true },
              ]),
        ],
        rows: rows.map((r) => ({
          number: formatWoNumber(r.number),
          title: r.title,
          site: r.site,
          category: r.category,
          priority: r.priority,
          status: STATUS_LABELS[r.status],
          assignee: r.assignee,
          contractor: r.contractor,
          created: formatExportDateTime(r.createdAt, r.tz),
          due: formatExportDateTime(r.dueAt, r.tz),
          completed: formatExportDateTime(r.completedAt, r.tz),
          rework: r.reworkCount,
          hoursOverdue: r.dueAt ? Math.round((now - r.dueAt.getTime()) / 3_600_000) : null,
        })),
        note: key === "overdue" ? "Overdue is evaluated as of the generation time; the date range does not apply." : undefined,
      };
    }

    case "sla": {
      const [bySite, byPriority, [all]] = await Promise.all([
        slaCompliance(db, ctx, f, "site"),
        slaCompliance(db, ctx, f, "priority"),
        slaCompliance(db, ctx, f),
      ]);
      const toRow = (dim: string) => (r: (typeof bySite)[number]) => ({
        dimension: dim,
        value: r.label,
        eligible: r.eligible,
        met: r.met,
        missed: r.eligible - r.met,
        rate: pct(r.rate),
      });
      return {
        columns: [
          { key: "dimension", label: "Dimension" },
          { key: "value", label: "Value" },
          { key: "eligible", label: "Eligible completed", numeric: true },
          { key: "met", label: "Met SLA", numeric: true },
          { key: "missed", label: "Missed SLA", numeric: true },
          { key: "rate", label: "SLA %", numeric: true },
        ],
        rows: [toRow("Overall")(all), ...bySite.map(toRow("Site")), ...byPriority.map(toRow("Priority"))],
        note: "Eligible = approved/closed work with a due time, completed in the period. Cancelled work is excluded.",
      };
    }

    case "breakdown": {
      const by = f.groupBy ?? "site";
      const dim = {
        site: sql<string>`${sites.name}`,
        category: sql<string>`coalesce(${workCategories.name}, 'Uncategorised')`,
        priority: sql<string>`${workOrders.priority}::text`,
        status: sql<string>`${workOrders.status}::text`,
      }[by];
      const rows = await db
        .select({
          value: dim,
          total: sql<number>`count(*)::int`,
          open: sql<number>`count(*) filter (where ${inArray(workOrders.status, OPEN_STATUSES)})::int`,
          overdue: sql<number>`count(*) filter (where ${inArray(workOrders.status, OPEN_STATUSES)} and ${workOrders.dueAt} < now())::int`,
          closed: sql<number>`count(*) filter (where ${workOrders.status} = 'closed')::int`,
        })
        .from(workOrders)
        .innerJoin(sites, eq(sites.id, workOrders.siteId))
        .leftJoin(workCategories, eq(workCategories.id, workOrders.categoryId))
        .where(and(woWhere(ctx, f), period(workOrders.createdAt)))
        .groupBy(sql`1`)
        .orderBy(sql`2 desc`);
      return {
        columns: [
          { key: "value", label: by[0].toUpperCase() + by.slice(1) },
          { key: "total", label: "Created in period", numeric: true },
          { key: "open", label: "Currently open", numeric: true },
          { key: "overdue", label: "Currently overdue", numeric: true },
          { key: "closed", label: "Closed", numeric: true },
        ],
        rows: rows.map((r) => ({ ...r, value: by === "status" ? STATUS_LABELS[r.value as WorkOrderStatus] : r.value })),
      };
    }

    case "contractors": {
      const perf = contractorPerformanceSql(f.from, f.to);
      const rows = await db
        .select({ name: contractors.name, status: contractors.status, ...perf })
        .from(contractors)
        .where(
          and(
            eq(contractors.tenantId, ctx.tenantId),
            ctx.role === "contractor_manager" ? eq(contractors.id, ctx.contractorId ?? sql`null`) : undefined,
          ),
        )
        .orderBy(asc(contractors.name));
      return {
        columns: [
          { key: "name", label: "Contractor" },
          { key: "status", label: "Status" },
          { key: "assigned", label: "Assigned", numeric: true },
          { key: "completed", label: "Completed", numeric: true },
          { key: "overdue", label: "Overdue", numeric: true },
          { key: "rework", label: "Returned for rework", numeric: true },
          { key: "completionRate", label: "Completion %", numeric: true },
        ],
        rows: rows.map((r) => ({ ...r, completionRate: pct(r.assigned ? r.completed / r.assigned : null) })),
        note: "Counts cover work orders created in the period. Site filter does not apply to contractor totals.",
      };
    }

    case "inspections": {
      const rows = await db
        .select({
          template: inspectionTemplates.name,
          site: sites.name,
          tz: sites.timezone,
          inspector: users.name,
          status: inspectionRuns.status,
          score: inspectionRuns.score,
          submittedAt: inspectionRuns.submittedAt,
          defects: sql<number>`(select count(*)::int from ${inspectionDefects} d where d.run_id = ${inspectionRuns.id})`,
          openDefects: sql<number>`(select count(*)::int from ${inspectionDefects} d where d.run_id = ${inspectionRuns.id} and d.linked_work_order_id is null)`,
          severe: sql<number>`(select count(*)::int from ${inspectionDefects} d where d.run_id = ${inspectionRuns.id} and d.severity in ('high','critical'))`,
        })
        .from(inspectionRuns)
        .innerJoin(inspectionTemplates, eq(inspectionTemplates.id, inspectionRuns.templateId))
        .innerJoin(sites, eq(sites.id, inspectionRuns.siteId))
        .innerJoin(users, eq(users.id, inspectionRuns.inspectorUserId))
        .where(
          and(
            eq(inspectionRuns.tenantId, ctx.tenantId),
            siteScope(ctx, inspectionRuns.siteId),
            f.siteId ? eq(inspectionRuns.siteId, f.siteId) : undefined,
            period(inspectionRuns.submittedAt),
          ),
        )
        .orderBy(desc(inspectionRuns.submittedAt));
      return {
        columns: [
          { key: "submitted", label: "Submitted (site time)" },
          { key: "template", label: "Template" },
          { key: "site", label: "Site" },
          { key: "inspector", label: "Inspector" },
          { key: "status", label: "Result" },
          { key: "score", label: "Score %", numeric: true },
          { key: "defects", label: "Defects", numeric: true },
          { key: "severe", label: "High/critical", numeric: true },
          { key: "openDefects", label: "Without work order", numeric: true },
        ],
        rows: rows.map(({ submittedAt, tz, ...r }) => ({ ...r, submitted: formatExportDateTime(submittedAt, tz), score: r.score === null ? null : Number(r.score) })),
      };
    }

    case "compliance": {
      requirePerm(ctx, "compliance.view");
      const rows = await listCompliance(db, ctx, { siteId: f.siteId });
      return {
        columns: [
          { key: "name", label: "Item" },
          { key: "itemType", label: "Type" },
          { key: "subjectType", label: "Applies to" },
          { key: "relatedName", label: "Related" },
          { key: "issuer", label: "Issuer" },
          { key: "expiryDate", label: "Expiry date" },
          { key: "daysToExpiry", label: "Days to expiry", numeric: true },
          { key: "status", label: "Status" },
          { key: "verified", label: "Verified by" },
        ],
        rows: rows.map((r) => ({
          name: r.name,
          itemType: r.itemType,
          subjectType: r.subjectType,
          relatedName: r.relatedName,
          issuer: r.issuer,
          expiryDate: r.expiryDate,
          daysToExpiry: r.daysToExpiry,
          status: COMPLIANCE_STATUS_LABELS[r.status],
          verified: r.verifiedByName,
        })),
        note: "This register is a tracking aid. It is not a certification of regulatory compliance.",
      };
    }

    case "approvals": {
      const rows = await db
        .select({
          createdAt: approvalDecisions.createdAt,
          decision: approvalDecisions.decision,
          reason: approvalDecisions.reason,
          approver: users.name,
          number: workOrders.workOrderNumber,
          title: workOrders.title,
          site: sites.name,
          tz: sites.timezone,
          reworkCount: workOrders.reworkCount,
          status: workOrders.status,
        })
        .from(approvalDecisions)
        .innerJoin(workOrders, eq(workOrders.id, approvalDecisions.workOrderId))
        .innerJoin(sites, eq(sites.id, workOrders.siteId))
        .innerJoin(users, eq(users.id, approvalDecisions.approverUserId))
        .where(and(woWhere(ctx, f), period(approvalDecisions.createdAt)))
        .orderBy(desc(approvalDecisions.createdAt));
      return {
        columns: [
          { key: "decided", label: "Decided (site time)" },
          { key: "number", label: "Work order" },
          { key: "title", label: "Title" },
          { key: "site", label: "Site" },
          { key: "approver", label: "Approver" },
          { key: "decision", label: "Decision" },
          { key: "reason", label: "Reason" },
          { key: "reworkCount", label: "Total rework cycles", numeric: true },
          { key: "status", label: "Current status" },
        ],
        rows: rows.map((r) => ({
          decided: formatExportDateTime(r.createdAt, r.tz),
          number: formatWoNumber(r.number),
          title: r.title,
          site: r.site,
          approver: r.approver,
          decision: r.decision.replace("_", " "),
          reason: r.reason,
          reworkCount: r.reworkCount,
          status: STATUS_LABELS[r.status],
        })),
      };
    }
  }
}

/** RFC 4180 CSV with spreadsheet formula-injection protection. */
export function toCsv(result: ReportResult, meta: { title: string; generatedAt: Date; filters: Record<string, string> }) {
  const esc = (v: Cell) => {
    if (v === null || v === undefined) return "";
    let s = String(v);
    if (/^[=+\-@\t\r]/.test(s) && typeof v !== "number") s = `'${s}`;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [
    `# ${meta.title}`,
    `# Generated ${meta.generatedAt.toISOString()} (UTC)`,
    `# Filters: ${Object.entries(meta.filters).map(([k, v]) => `${k}=${v}`).join("; ") || "none"}`,
    ...(result.note ? [`# Note: ${result.note}`] : []),
    result.columns.map((c) => esc(c.label)).join(","),
    ...result.rows.map((r) => result.columns.map((c) => esc(r[c.key] ?? null)).join(",")),
  ];
  return lines.join("\r\n") + "\r\n";
}
