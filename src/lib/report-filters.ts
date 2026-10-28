import type { Priority, WorkOrderStatus } from "@/db/schema";
import { defaultPeriod } from "@/domain/metrics/service";
import type { ReportFilters } from "@/domain/reports/service";
import { WORK_ORDER_STATUSES } from "@/domain/work-orders/state";
import { addDays, parseDateParam } from "@/lib/time";

/** Parse report filters from query params. `to` is inclusive in the UI and exclusive internally. */
export function parseReportFilters(get: (k: string) => string | undefined, siteIds: string[]): ReportFilters {
  const def = defaultPeriod();
  const from = parseDateParam(get("from")) ?? def.from;
  const toParam = parseDateParam(get("to"));
  const status = get("status");
  const priority = get("priority");
  const groupBy = get("groupBy");
  return {
    from,
    to: toParam ? addDays(toParam, 1) : def.to,
    siteId: siteIds.includes(get("site") ?? "") ? get("site") : undefined,
    status: WORK_ORDER_STATUSES.includes(status as WorkOrderStatus) ? (status as WorkOrderStatus) : undefined,
    priority: ["low", "medium", "high", "critical"].includes(priority ?? "") ? (priority as Priority) : undefined,
    groupBy: ["site", "category", "priority", "status"].includes(groupBy ?? "") ? (groupBy as ReportFilters["groupBy"]) : undefined,
  };
}
