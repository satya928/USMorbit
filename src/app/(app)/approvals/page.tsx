import Link from "next/link";
import { and, eq, inArray, sql } from "drizzle-orm";
import { Stamp } from "lucide-react";
import { getDb } from "@/db";
import { fileAttachments, people, sites, workOrderChecklistItems, workOrders } from "@/db/schema";
import { can } from "@/lib/auth/context";
import { requireContext } from "@/lib/auth/session";
import { one, requirePagePerm, type SearchParams } from "@/lib/page";
import { formatDateTime } from "@/lib/time";
import { workOrderScope } from "@/domain/shared";
import { formatWoNumber } from "@/domain/work-orders/service";
import { ActionButton } from "@/components/forms";
import { Card, EmptyState, Notice, PageHeader, PriorityBadge, StatusBadge } from "@/components/ui";
import { WORKFLOW, type WorkflowAction } from "@/domain/work-orders/state";
import { transitionAction } from "../work-orders/actions";

export const metadata = { title: "Approvals" };

async function queue(ctx: Awaited<ReturnType<typeof requireContext>>, status: "pending_approval" | "ready_for_inspection") {
  return getDb()
    .select({
      id: workOrders.id,
      number: workOrders.workOrderNumber,
      title: workOrders.title,
      priority: workOrders.priority,
      status: workOrders.status,
      summary: workOrders.clientVisibleSummary,
      reworkCount: workOrders.reworkCount,
      completedAt: workOrders.completedAt,
      siteName: sites.name,
      tz: sites.timezone,
      assigneeName: people.name,
      assigneeUserId: people.userId,
      evidence: sql<number>`(select count(*)::int from ${fileAttachments} f where f.entity_type = 'work_order' and f.entity_id = ${workOrders.id})`,
      checklistDone: sql<number>`(select count(*)::int from ${workOrderChecklistItems} c where c.work_order_id = ${workOrders.id} and c.done)`,
      checklistTotal: sql<number>`(select count(*)::int from ${workOrderChecklistItems} c where c.work_order_id = ${workOrders.id})`,
    })
    .from(workOrders)
    .innerJoin(sites, eq(sites.id, workOrders.siteId))
    .leftJoin(people, eq(people.id, workOrders.assigneePersonId))
    .where(and(workOrderScope(ctx), inArray(workOrders.status, [status])))
    .orderBy(workOrders.submittedForApprovalAt, workOrders.completedAt);
}

export default async function ApprovalsPage({ searchParams }: { searchParams: SearchParams }) {
  const done = one((await searchParams).done);
  const ctx = await requireContext();
  requirePagePerm(ctx, "wo.approve", "wo.inspect");
  const [pending, inspect] = await Promise.all([
    can(ctx, "wo.approve") ? queue(ctx, "pending_approval") : Promise.resolve([]),
    can(ctx, "wo.inspect") ? queue(ctx, "ready_for_inspection") : Promise.resolve([]),
  ]);

  const Row = ({ w, mode }: { w: (typeof pending)[number]; mode: "approve" | "inspect" }) => {
    const self = !ctx.tenantSettings.allowSelfApproval && w.assigneeUserId === ctx.userId;
    return (
      <li className="flex flex-col gap-3 py-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <Link href={`/work-orders/${w.id}`} className="font-medium text-slate-900 hover:underline">
            <span className="font-mono text-xs font-semibold text-brand-700">{formatWoNumber(w.number)}</span> {w.title}
          </Link>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <PriorityBadge priority={w.priority} />
            <StatusBadge status={w.status} />
            <span>{w.siteName}</span>
            <span>· by {w.assigneeName ?? "contractor"}</span>
            <span>· completed {formatDateTime(w.completedAt, w.tz, { withZone: false })}</span>
          </div>
          <p className="mt-1 text-xs text-slate-600">
            Checklist {w.checklistDone}/{w.checklistTotal} · {w.evidence} evidence file(s){w.reworkCount ? ` · previously returned ${w.reworkCount}×` : ""}
          </p>
          {w.summary && <p className="mt-1 text-sm text-slate-700">{w.summary}</p>}
        </div>
        <div className="flex shrink-0 flex-wrap items-start gap-2 lg:max-w-md lg:justify-end">
          {self ? (
            <p className="text-xs text-amber-800">You performed this work — another approver must decide.</p>
          ) : mode === "approve" ? (
            <>
              <ActionButton action={transitionAction} label="Approve" fields={{ id: w.id, returnTo: "/approvals", action: "approve" }} variant="accent" />
              <ActionButton action={transitionAction} label="Request rework" fields={{ id: w.id, returnTo: "/approvals", action: "request_rework" }} reasonLabel="What needs rework?" reasonRequired />
              <ActionButton action={transitionAction} label="Reject" fields={{ id: w.id, returnTo: "/approvals", action: "reject" }} variant="danger" reasonLabel="Reason for rejection" reasonRequired />
            </>
          ) : (
            <>
              <ActionButton action={transitionAction} label="Pass & send for approval" fields={{ id: w.id, returnTo: "/approvals", action: "pass_inspection" }} variant="accent" />
              <ActionButton action={transitionAction} label="Return for rework" fields={{ id: w.id, returnTo: "/approvals", action: "fail_inspection" }} variant="danger" reasonLabel="What needs fixing?" reasonRequired />
            </>
          )}
        </div>
      </li>
    );
  };

  return (
    <>
      <PageHeader title="Approvals" description="Review completed work, evidence and checklists before sign-off. Every decision is recorded with your name, time and reason." />
      <div className="space-y-4">
        {done && done in WORKFLOW && <Notice tone="success">{WORKFLOW[done as WorkflowAction].label} — done.</Notice>}
        {can(ctx, "wo.approve") && (
          <Card title={`Awaiting client approval (${pending.length})`}>
            {pending.length ? (
              <ul className="-my-4 divide-y divide-slate-100">
                {pending.map((w) => (
                  <Row key={w.id} w={w} mode="approve" />
                ))}
              </ul>
            ) : (
              <EmptyState icon={<Stamp className="size-8" />} title="Nothing awaiting approval" description="Work appears here after it passes inspection." />
            )}
          </Card>
        )}
        {can(ctx, "wo.inspect") && (
          <Card title={`Ready for inspection (${inspect.length})`}>
            {inspect.length ? (
              <ul className="-my-4 divide-y divide-slate-100">
                {inspect.map((w) => (
                  <Row key={w.id} w={w} mode="inspect" />
                ))}
              </ul>
            ) : (
              <EmptyState title="Nothing waiting for inspection" />
            )}
          </Card>
        )}
      </div>
    </>
  );
}
