import type { WorkOrderStatus } from "@/db/schema";
import type { Permission } from "@/lib/authz/permissions";

export const WORK_ORDER_STATUSES: WorkOrderStatus[] = [
  "new",
  "triaged",
  "assigned",
  "in_progress",
  "ready_for_inspection",
  "pending_approval",
  "rework_required",
  "approved",
  "closed",
  "cancelled",
];

export const TERMINAL_STATUSES: WorkOrderStatus[] = ["closed", "cancelled"];
/** Statuses counted as "open" on the dashboard (documented KPI formula). */
export const OPEN_STATUSES: WorkOrderStatus[] = WORK_ORDER_STATUSES.filter(
  (s) => !["approved", "closed", "cancelled"].includes(s),
);

export const STATUS_LABELS: Record<WorkOrderStatus, string> = {
  new: "New",
  triaged: "Triaged",
  assigned: "Assigned",
  in_progress: "In progress",
  ready_for_inspection: "Ready for inspection",
  pending_approval: "Pending approval",
  rework_required: "Rework required",
  approved: "Approved",
  closed: "Closed",
  cancelled: "Cancelled",
};

/**
 * Named workflow actions. Each maps the allowed source statuses to a target status and the
 * permission required. `assign` is handled separately because it can keep the current status.
 */
export type WorkflowAction =
  | "triage"
  | "start"
  | "mark_ready"
  | "pass_inspection"
  | "fail_inspection"
  | "approve"
  | "reject"
  | "request_rework"
  | "close"
  | "cancel";

type Rule = { from: WorkOrderStatus[]; to: WorkOrderStatus; perm: Permission; label: string; needsReason?: boolean };

export const WORKFLOW: Record<WorkflowAction, Rule> = {
  triage: { from: ["new"], to: "triaged", perm: "wo.edit", label: "Mark triaged" },
  start: { from: ["assigned", "rework_required"], to: "in_progress", perm: "wo.execute", label: "Start work" },
  mark_ready: { from: ["in_progress"], to: "ready_for_inspection", perm: "wo.execute", label: "Mark ready for inspection" },
  pass_inspection: {
    from: ["ready_for_inspection"],
    to: "pending_approval",
    perm: "wo.inspect",
    label: "Pass inspection & submit for approval",
  },
  fail_inspection: {
    from: ["ready_for_inspection"],
    to: "rework_required",
    perm: "wo.inspect",
    label: "Return for rework",
    needsReason: true,
  },
  approve: { from: ["pending_approval"], to: "approved", perm: "wo.approve", label: "Approve" },
  reject: { from: ["pending_approval"], to: "rework_required", perm: "wo.approve", label: "Reject", needsReason: true },
  request_rework: {
    from: ["pending_approval"],
    to: "rework_required",
    perm: "wo.approve",
    label: "Request rework",
    needsReason: true,
  },
  close: { from: ["approved"], to: "closed", perm: "wo.close", label: "Close work order" },
  cancel: {
    from: ["new", "triaged", "assigned", "in_progress", "rework_required"],
    to: "cancelled",
    perm: "wo.cancel",
    label: "Cancel",
    needsReason: true,
  },
};

export const ASSIGNABLE_STATUSES: WorkOrderStatus[] = ["new", "triaged", "assigned", "in_progress", "rework_required"];

export function canTransition(action: WorkflowAction, from: WorkOrderStatus): boolean {
  return WORKFLOW[action].from.includes(from);
}

/** Status after assignment: unassigned work moves to `assigned`, in-flight work keeps its status. */
export function statusAfterAssign(from: WorkOrderStatus): WorkOrderStatus {
  return from === "new" || from === "triaged" ? "assigned" : from;
}

export function availableActions(status: WorkOrderStatus): WorkflowAction[] {
  return (Object.keys(WORKFLOW) as WorkflowAction[]).filter((a) => canTransition(a, status));
}

export function isOverdue(wo: { status: WorkOrderStatus; dueAt: Date | null }, now = new Date()): boolean {
  return !!wo.dueAt && OPEN_STATUSES.includes(wo.status) && wo.dueAt.getTime() < now.getTime();
}
