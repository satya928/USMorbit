import { and, asc, desc, eq, gte, inArray, isNotNull, lt, sql, type SQL } from "drizzle-orm";
import type { DbOrTx } from "@/db";
import {
  complianceItems,
  inspectionRuns,
  sites,
  users,
  workOrderEvents,
  workOrders,
  type Priority,
  type WorkOrderStatus,
} from "@/db/schema";
import { can, requirePerm, type AuthContext } from "@/lib/auth/context";
import { addDays } from "@/lib/time";
import { complianceViewCondition } from "@/domain/compliance/service";
import { siteScope, workOrderScope } from "@/domain/shared";
import { OPEN_STATUSES } from "@/domain/work-orders/state";
import { isoDate } from "@/domain/compliance/status";

/**
 * KPI definitions — the single implementation used by the Command Center, Reports and AI Copilot.
 *
 * - Open work orders: status not in (approved, closed, cancelled).
 * - Overdue: open AND due_at < now.
 * - Critical/high: open AND priority in (high, critical).
 * - Awaiting approval: status = pending_approval.
 * - SLA compliance (period): among work orders in status approved/closed with a due time whose
 *   completed_at (marked ready for inspection) falls in the period, the share with completed_at <= due_at.
 *   Cancelled work is excluded. Returns null when there are no eligible work orders.
 * - Expiring compliance: live items with an expiry date within the next 30 days (today inclusive).
 * - Rework rate (period): returns for rework (inspection failures, client rejections and rework
 *   requests) divided by submissions for inspection, both counted from the event log in the period.
 * - First-time completion (period): among work orders approved in the period, the share never returned
 *   for rework (rework_count = 0).
 */
export type MetricFilters = {
  from: Date;
  to: Date;
  siteId?: string;
  status?: WorkOrderStatus;
  priority?: Priority;
};

export function defaultPeriod(now = new Date()) {
  const to = addDays(new Date(`${isoDate(now)}T00:00:00Z`), 1);
  return { from: addDays(to, -30), to };
}

function woFilter(ctx: AuthContext, f: MetricFilters, extra?: SQL): SQL {
  return and(
    workOrderScope(ctx),
    f.siteId ? eq(workOrders.siteId, f.siteId) : undefined,
    f.status ? eq(workOrders.status, f.status) : undefined,
    f.priority ? eq(workOrders.priority, f.priority) : undefined,
    extra,
  )!;
}

const count = sql<number>`count(*)::int`;
const openIn = inArray(workOrders.status, OPEN_STATUSES);

export async function slaCompliance(db: DbOrTx, ctx: AuthContext, f: MetricFilters, groupBy?: "site" | "priority") {
  const eligible = and(
    inArray(workOrders.status, ["approved", "closed"]),
    isNotNull(workOrders.dueAt),
    isNotNull(workOrders.completedAt),
    gte(workOrders.completedAt, f.from),
    lt(workOrders.completedAt, f.to),
  );
  const met = sql<number>`count(*) filter (where ${workOrders.completedAt} <= ${workOrders.dueAt})::int`;
  if (!groupBy) {
    const [r] = await db.select({ eligible: count, met }).from(workOrders).where(woFilter(ctx, f, eligible));
    return [{ key: "all", label: "All", eligible: r.eligible, met: r.met, rate: r.eligible ? r.met / r.eligible : null }];
  }
  const key = groupBy === "site" ? workOrders.siteId : workOrders.priority;
  const rows = await db
    .select({ key, label: groupBy === "site" ? sites.name : workOrders.priority, eligible: count, met })
    .from(workOrders)
    .innerJoin(sites, eq(sites.id, workOrders.siteId))
    .where(woFilter(ctx, f, eligible))
    .groupBy(key, groupBy === "site" ? sites.name : workOrders.priority);
  return rows.map((r) => ({ ...r, key: String(r.key), label: String(r.label), rate: r.eligible ? r.met / r.eligible : null }));
}

export async function reworkStats(db: DbOrTx, ctx: AuthContext, f: MetricFilters) {
  const inPeriod = and(gte(workOrderEvents.createdAt, f.from), lt(workOrderEvents.createdAt, f.to));
  const [r] = await db
    .select({
      submissions: sql<number>`count(*) filter (where ${workOrderEvents.type} = 'status.mark_ready')::int`,
      returns: sql<number>`count(*) filter (where ${workOrderEvents.type} in ('status.fail_inspection','status.reject','status.request_rework'))::int`,
    })
    .from(workOrderEvents)
    .innerJoin(workOrders, eq(workOrders.id, workOrderEvents.workOrderId))
    .where(and(woFilter(ctx, f), inPeriod));
  const [ftc] = await db
    .select({ approved: count, firstTime: sql<number>`count(*) filter (where ${workOrders.reworkCount} = 0)::int` })
    .from(workOrders)
    .where(woFilter(ctx, f, and(isNotNull(workOrders.approvedAt), gte(workOrders.approvedAt, f.from), lt(workOrders.approvedAt, f.to))));
  return {
    submissions: r.submissions,
    returns: r.returns,
    reworkRate: r.submissions ? r.returns / r.submissions : null,
    approved: ftc.approved,
    firstTimeCompletion: ftc.approved ? ftc.firstTime / ftc.approved : null,
  };
}

export async function getDashboard(db: DbOrTx, ctx: AuthContext, f: MetricFilters) {
  requirePerm(ctx, "wo.view");
  const now = new Date();
  const showCompliance = can(ctx, "compliance.view");

  const [[kpi], byStatus, byPriority, [sla], rework, activity, upcomingCompliance, [expiringCount], sitePerf, trend] = await Promise.all([
    db
      .select({
        open: sql<number>`count(*) filter (where ${openIn})::int`,
        overdue: sql<number>`count(*) filter (where ${openIn} and ${workOrders.dueAt} < ${now})::int`,
        urgent: sql<number>`count(*) filter (where ${openIn} and ${workOrders.priority} in ('high','critical'))::int`,
        awaitingApproval: sql<number>`count(*) filter (where ${workOrders.status} = 'pending_approval')::int`,
      })
      .from(workOrders)
      .where(woFilter(ctx, f)),
    db
      .select({ status: workOrders.status, count })
      .from(workOrders)
      .where(woFilter(ctx, f, and(gte(workOrders.createdAt, f.from), lt(workOrders.createdAt, f.to))))
      .groupBy(workOrders.status),
    db
      .select({ priority: workOrders.priority, count })
      .from(workOrders)
      .where(woFilter(ctx, f, openIn))
      .groupBy(workOrders.priority),
    slaCompliance(db, ctx, f),
    reworkStats(db, ctx, f),
    db
      .select({
        id: workOrderEvents.id,
        type: workOrderEvents.type,
        toStatus: workOrderEvents.toStatus,
        createdAt: workOrderEvents.createdAt,
        actorName: users.name,
        workOrderId: workOrders.id,
        number: workOrders.workOrderNumber,
        title: workOrders.title,
      })
      .from(workOrderEvents)
      .innerJoin(workOrders, eq(workOrders.id, workOrderEvents.workOrderId))
      .leftJoin(users, eq(users.id, workOrderEvents.actorUserId))
      .where(
        and(
          woFilter(ctx, f),
          sql`${workOrderEvents.type} <> 'comment.added'`,
          can(ctx, "wo.view_internal") ? undefined : sql`coalesce((${workOrderEvents.data}->>'internal')::boolean, false) = false`,
        ),
      )
      .orderBy(desc(workOrderEvents.createdAt))
      .limit(12),
    showCompliance
      ? db
          .select({ id: complianceItems.id, name: complianceItems.name, expiryDate: complianceItems.expiryDate, itemType: complianceItems.itemType })
          .from(complianceItems)
          .where(
            and(
              eq(complianceItems.tenantId, ctx.tenantId),
              sql`${complianceItems.archivedAt} is null`,
              eq(complianceItems.notApplicable, false),
              sql`${complianceItems.expiryDate} <= ${isoDate(now, 30)}`,
              f.siteId ? eq(complianceItems.siteId, f.siteId) : undefined,
              ctx.allSites ? undefined : sql`(${complianceItems.siteId} is null or ${siteScope(ctx, complianceItems.siteId)})`,
              ctx.role === "contractor_manager" && ctx.contractorId ? eq(complianceItems.contractorId, ctx.contractorId) : undefined,
            ),
          )
          .orderBy(asc(complianceItems.expiryDate))
          .limit(8)
      : Promise.resolve([]),
    showCompliance
      ? db
          .select({ n: count })
          .from(complianceItems)
          .where(
            and(
              eq(complianceItems.tenantId, ctx.tenantId),
              sql`${complianceItems.archivedAt} is null`,
              complianceViewCondition("expiring30"),
              f.siteId ? eq(complianceItems.siteId, f.siteId) : undefined,
              ctx.allSites ? undefined : sql`(${complianceItems.siteId} is null or ${siteScope(ctx, complianceItems.siteId)})`,
              ctx.role === "contractor_manager" && ctx.contractorId ? eq(complianceItems.contractorId, ctx.contractorId) : undefined,
            ),
          )
      : Promise.resolve([{ n: 0 }]),
    sitePerformance(db, ctx, f),
    db
      .select({
        day: sql<string>`to_char(date_trunc('day', ${workOrders.createdAt} at time zone 'UTC'), 'YYYY-MM-DD')`,
        created: count,
      })
      .from(workOrders)
      .where(woFilter(ctx, f, and(gte(workOrders.createdAt, f.from), lt(workOrders.createdAt, f.to))))
      .groupBy(sql`1`)
      .orderBy(sql`1`),
  ]);

  return {
    kpi: { ...kpi, sla, expiringCompliance: showCompliance ? expiringCount.n : null },
    rework,
    byStatus,
    byPriority,
    activity,
    upcomingCompliance,
    sitePerf,
    trend,
    showCompliance,
  };
}

export async function sitePerformance(db: DbOrTx, ctx: AuthContext, f: MetricFilters) {
  const now = new Date();
  const rows = await db
    .select({
      siteId: sites.id,
      siteName: sites.name,
      code: sites.code,
      open: sql<number>`count(${workOrders.id}) filter (where ${openIn})::int`,
      overdue: sql<number>`count(${workOrders.id}) filter (where ${openIn} and ${workOrders.dueAt} < ${now})::int`,
      slaEligible: sql<number>`count(${workOrders.id}) filter (where ${workOrders.status} in ('approved','closed') and ${workOrders.dueAt} is not null and ${workOrders.completedAt} >= ${f.from} and ${workOrders.completedAt} < ${f.to})::int`,
      slaMet: sql<number>`count(${workOrders.id}) filter (where ${workOrders.status} in ('approved','closed') and ${workOrders.dueAt} is not null and ${workOrders.completedAt} >= ${f.from} and ${workOrders.completedAt} < ${f.to} and ${workOrders.completedAt} <= ${workOrders.dueAt})::int`,
    })
    .from(sites)
    .leftJoin(
      workOrders,
      and(
        eq(workOrders.siteId, sites.id),
        workOrderScope(ctx),
        f.priority ? eq(workOrders.priority, f.priority) : undefined,
        f.status ? eq(workOrders.status, f.status) : undefined,
      ),
    )
    .where(and(eq(sites.tenantId, ctx.tenantId), sql`${sites.archivedAt} is null`, siteScope(ctx, sites.id), f.siteId ? eq(sites.id, f.siteId) : undefined))
    .groupBy(sites.id, sites.name, sites.code)
    .orderBy(asc(sites.name));

  const inspections = await db
    .select({
      siteId: inspectionRuns.siteId,
      avgScore: sql<string | null>`avg(${inspectionRuns.score})::numeric(5,1)`,
      failed: sql<number>`count(*) filter (where ${inspectionRuns.status} = 'failed')::int`,
      total: count,
    })
    .from(inspectionRuns)
    .where(
      and(
        eq(inspectionRuns.tenantId, ctx.tenantId),
        siteScope(ctx, inspectionRuns.siteId),
        isNotNull(inspectionRuns.submittedAt),
        gte(inspectionRuns.submittedAt, f.from),
        lt(inspectionRuns.submittedAt, f.to),
      ),
    )
    .groupBy(inspectionRuns.siteId);
  const insp = new Map(inspections.map((i) => [i.siteId, i]));
  return rows.map((r) => ({
    ...r,
    slaRate: r.slaEligible ? r.slaMet / r.slaEligible : null,
    avgInspectionScore: insp.get(r.siteId)?.avgScore ? Number(insp.get(r.siteId)!.avgScore) : null,
    failedInspections: insp.get(r.siteId)?.failed ?? 0,
    inspections: insp.get(r.siteId)?.total ?? 0,
  }));
}
