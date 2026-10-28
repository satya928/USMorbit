import Link from "next/link";
import { FileText, Lock, Pencil } from "lucide-react";
import { getDb } from "@/db";
import { can } from "@/lib/auth/context";
import { requireContext } from "@/lib/auth/session";
import { load, one, type SearchParams } from "@/lib/page";
import { formatDateTime, relativeTime } from "@/lib/time";
import { formatWoNumber, getWorkOrder, listAssignees } from "@/domain/work-orders/service";
import { isOverdue, STATUS_LABELS, WORKFLOW, type WorkflowAction } from "@/domain/work-orders/state";
import type { WorkOrderStatus } from "@/db/schema";
import { ActionButton } from "@/components/forms";
import { UploadForm } from "@/components/upload-form";
import { Badge, Card, DefinitionList, EmptyState, LinkButton, Notice, PageHeader, PriorityBadge, StatusBadge, type ButtonVariant } from "@/components/ui";
import { transitionAction } from "../actions";
import { AddChecklistItem, AssignForm, ChecklistItem, CommentForm } from "./widgets";

export const metadata = { title: "Work order" };

const ACTION_VARIANT: Partial<Record<WorkflowAction, ButtonVariant>> = {
  start: "primary",
  mark_ready: "primary",
  pass_inspection: "accent",
  approve: "accent",
  close: "primary",
  reject: "danger",
  fail_inspection: "danger",
  cancel: "ghost",
};

const EVENT_TEXT: Record<string, string> = {
  created: "Created the work order",
  assigned: "Assigned",
  reassigned: "Reassigned",
  updated: "Updated details",
  "comment.added": "Commented",
  "evidence.added": "Added evidence",
  "checklist.completed": "Completed checklist item",
  "checklist.reopened": "Reopened checklist item",
  "checklist.added": "Added checklist item",
};

function eventText(e: { type: string; toStatus: WorkOrderStatus | null; data: Record<string, unknown> }) {
  const base = EVENT_TEXT[e.type] ?? (e.type.startsWith("status.") ? WORKFLOW[e.type.slice(7) as WorkflowAction]?.label ?? e.type : e.type);
  const d = e.data as { personName?: string; label?: string; fileName?: string; fields?: string[]; credentialOverride?: string };
  const extra = d.personName ? ` to ${d.personName}` : d.label ? `: ${d.label}` : d.fileName ? `: ${d.fileName}` : d.fields?.length ? ` (${d.fields.join(", ")})` : "";
  return base + extra;
}

export default async function WorkOrderPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SearchParams }) {
  const ctx = await requireContext();
  const { id } = await params;
  const sp = await searchParams;
  const db = getDb();
  const d = await load(getWorkOrder(db, ctx, id));
  const wo = d.workOrder;
  const tz = d.site.timezone;
  const perms = d.permissions;
  const num = formatWoNumber(wo.workOrderNumber);
  const assignees = perms.canAssign ? await listAssignees(db, ctx, wo.id) : null;
  const overdue = isOverdue(wo);
  const checklistEditable = perms.canExecute || (perms.canEdit && !["pending_approval", "approved"].includes(wo.status));
  const requiredOpen = d.checklist.filter((c) => c.required && !c.done).length;
  const images = d.files.filter((f) => f.contentType.startsWith("image/"));
  const docs = d.files.filter((f) => !f.contentType.startsWith("image/"));

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "Work Orders", href: "/work-orders" }, { label: num }]}
        title={
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-base text-slate-500">{num}</span>
            <span>{wo.title}</span>
          </span>
        }
        description={
          <span className="flex flex-wrap items-center gap-2">
            <StatusBadge status={wo.status} />
            <PriorityBadge priority={wo.priority} />
            {overdue && <Badge tone="red">Overdue</Badge>}
            {wo.reworkCount > 0 && <Badge tone="red">Rework ×{wo.reworkCount}</Badge>}
            <span className="text-slate-500">
              {d.site.name}
              {d.asset ? ` · ${d.asset.name}` : ""}
            </span>
          </span>
        }
        actions={
          perms.canEdit && (
            <LinkButton href={`/work-orders/${wo.id}/edit`} variant="secondary">
              <Pencil className="size-4" aria-hidden /> Edit
            </LinkButton>
          )
        }
      />
      {one(sp.created) && <div className="mb-4"><Notice tone="success">Work order {num} created.</Notice></div>}
      {one(sp.done) && one(sp.done)! in WORKFLOW && (
        <div className="mb-4">
          <Notice tone="success">
            {WORKFLOW[one(sp.done) as WorkflowAction].label} — done. Status is now {STATUS_LABELS[wo.status].toLowerCase()}.
          </Notice>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card title="Details">
            {wo.description && <p className="mb-4 whitespace-pre-wrap text-sm text-slate-800">{wo.description}</p>}
            <DefinitionList
              items={[
                ["Site", <Link key="s" href={`/sites/${d.site.id}`} className="text-brand-700 hover:underline">{d.site.name}</Link>],
                ["Asset", d.asset ? <Link key="a" href={`/assets/${d.asset.id}`} className="text-brand-700 hover:underline">{d.asset.code} — {d.asset.name}</Link> : "—"],
                ["Location", wo.locationText ?? "—"],
                ["Category", d.category ? `${d.category.name}${d.category.requiredCredential ? ` (requires ${d.category.requiredCredential})` : ""}` : "Uncategorised"],
                ["SLA due", <span key="due" className={overdue ? "font-semibold text-red-700" : ""}>{formatDateTime(wo.dueAt, tz)}</span>],
                ["Assignee", d.assignee?.name ?? "Unassigned"],
                ["Contractor", d.contractor?.name ?? "In-house"],
                ["Created", formatDateTime(wo.createdAt, tz)],
                ["Started", formatDateTime(wo.startedAt, tz)],
                ["Completed", formatDateTime(wo.completedAt, tz)],
                ["Approved", formatDateTime(wo.approvedAt, tz)],
                ["Closed", formatDateTime(wo.closedAt, tz)],
                ...(can(ctx, "wo.view_internal")
                  ? ([
                      ["Estimated cost", wo.estimatedCost ? `$${wo.estimatedCost}` : "—"],
                      ["Actual cost", wo.actualCost ? `$${wo.actualCost}` : "—"],
                    ] as [string, string][])
                  : []),
              ]}
            />
            {wo.clientVisibleSummary && (
              <div className="mt-4 rounded-md bg-slate-50 p-3 text-sm">
                <p className="text-xs font-medium text-slate-500">Client summary</p>
                <p className="mt-1 whitespace-pre-wrap text-slate-800">{wo.clientVisibleSummary}</p>
              </div>
            )}
            {wo.internalNotes && (
              <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm">
                <p className="flex items-center gap-1 text-xs font-medium text-amber-800">
                  <Lock className="size-3" aria-hidden /> Internal notes
                </p>
                <p className="mt-1 whitespace-pre-wrap text-amber-950">{wo.internalNotes}</p>
              </div>
            )}
            {wo.sourceInspectionId && (
              <p className="mt-3 text-xs text-slate-500">
                Raised from{" "}
                <Link href={`/inspections/${wo.sourceInspectionId}`} className="text-brand-700 hover:underline">
                  an inspection defect
                </Link>
                .
              </p>
            )}
          </Card>

          <Card title={`Checklist (${d.checklist.filter((c) => c.done).length}/${d.checklist.length})`} actions={requiredOpen > 0 && <span className="text-xs text-red-700">{requiredOpen} required open</span>}>
            {d.checklist.length ? (
              <div className="-mx-2">
                {d.checklist.map((item) => (
                  <ChecklistItem key={item.id} id={wo.id} item={item} editable={checklistEditable} />
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500">No checklist items.</p>
            )}
            {checklistEditable && <AddChecklistItem id={wo.id} />}
          </Card>

          <Card title={`Evidence (${d.files.length})`}>
            {d.files.length ? (
              <>
                {images.length > 0 && (
                  <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {images.map((f) => (
                      <li key={f.id} className="overflow-hidden rounded-md border border-slate-200">
                        <a href={`/api/files/${f.id}`} target="_blank" rel="noopener">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={`/api/files/${f.id}`} alt={f.caption ?? f.fileName} className="aspect-video w-full bg-slate-100 object-cover" loading="lazy" />
                        </a>
                        <div className="px-2 py-1 text-xs text-slate-600">
                          <div className="truncate">{f.caption ?? f.fileName}</div>
                          <div className="text-slate-400">{formatDateTime(f.createdAt, tz, { withZone: false })}</div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
                {docs.length > 0 && (
                  <ul className="mt-3 space-y-1">
                    {docs.map((f) => (
                      <li key={f.id}>
                        <a href={`/api/files/${f.id}`} className="inline-flex items-center gap-1.5 text-sm text-brand-700 hover:underline">
                          <FileText className="size-4" aria-hidden /> {f.fileName}
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            ) : (
              <p className="text-sm text-slate-500">No photos or documents yet.</p>
            )}
            {perms.canUpload && (
              <div className="mt-4 border-t border-slate-100 pt-4">
                <UploadForm entityType="work_order" entityId={wo.id} />
              </div>
            )}
          </Card>

          <Card title={`Comments (${d.comments.length})`}>
            {d.comments.length ? (
              <ul className="space-y-3">
                {d.comments.map((c) => (
                  <li key={c.id} className={c.internal ? "rounded-md border border-amber-200 bg-amber-50 p-3" : "rounded-md bg-slate-50 p-3"}>
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                      <span className="font-medium text-slate-800">
                        {c.authorName}
                        {c.internal && (
                          <Badge tone="amber" className="ml-2">
                            Internal
                          </Badge>
                        )}
                      </span>
                      <time dateTime={c.createdAt.toISOString()}>{formatDateTime(c.createdAt, tz)}</time>
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-slate-800">{c.body}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-500">No comments yet.</p>
            )}
            {perms.canComment && (
              <div className="mt-4 border-t border-slate-100 pt-4">
                <CommentForm id={wo.id} canInternal={perms.canInternalComment} />
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          <Card title="Workflow">
            <p className="mb-3 text-xs text-slate-500">
              Current status: <span className="font-medium text-slate-800">{STATUS_LABELS[wo.status]}</span>
            </p>
            {perms.selfApprovalBlocked && (
              <div className="mb-3">
                <Notice tone="warn">You performed this work, so you cannot approve or reject it. Another approver must sign off.</Notice>
              </div>
            )}
            {wo.status === "in_progress" && requiredOpen > 0 && perms.actions.includes("mark_ready") && (
              <div className="mb-3">
                <Notice tone="info">Complete {requiredOpen} required checklist item(s) before marking ready.</Notice>
              </div>
            )}
            {perms.actions.length ? (
              <div className="flex flex-wrap gap-2">
                {perms.actions.map((a) => {
                  const rule = WORKFLOW[a];
                  return (
                    <ActionButton
                      key={a}
                      action={transitionAction}
                      label={rule.label}
                      fields={{ id: wo.id, action: a }}
                      variant={ACTION_VARIANT[a] ?? "secondary"}
                      reasonLabel={rule.needsReason ? (a === "cancel" ? "Reason for cancelling" : "Reason (shared with the assignee)") : undefined}
                      reasonRequired={rule.needsReason}
                    />
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-slate-500">{["closed", "cancelled"].includes(wo.status) ? "This work order is complete." : "No actions available for your role at this stage."}</p>
            )}
            {wo.status === "ready_for_inspection" && can(ctx, "inspection.run") && (
              <LinkButton href={`/inspections/new?siteId=${wo.siteId}&workOrderId=${wo.id}`} variant="ghost" size="sm" className="mt-3">
                Run a checklist inspection →
              </LinkButton>
            )}
          </Card>

          {assignees && (
            <Card title="Assignment">
              <AssignForm
                id={wo.id}
                people={assignees.people}
                contractors={assignees.contractors}
                current={{ personId: wo.assigneePersonId, contractorId: wo.contractorId }}
                enforce={assignees.enforce}
                canOverride={can(ctx, "compliance.override")}
              />
            </Card>
          )}

          <Card title="Approvals">
            {d.approvals.length ? (
              <ul className="space-y-2">
                {d.approvals.map((a) => (
                  <li key={a.id} className="text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <Badge tone={a.decision === "approved" ? "green" : "red"}>{a.decision.replace("_", " ")}</Badge>
                      <time className="text-xs text-slate-500">{formatDateTime(a.createdAt, tz, { withZone: false })}</time>
                    </div>
                    <p className="mt-1 text-xs text-slate-600">by {a.approverName}</p>
                    {a.reason && <p className="mt-0.5 text-sm text-slate-800">“{a.reason}”</p>}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-500">No approval decisions yet.</p>
            )}
            {d.inspections.length > 0 && (
              <div className="mt-3 border-t border-slate-100 pt-3 text-xs">
                <p className="font-medium text-slate-500">Linked inspections</p>
                {d.inspections.map((i) => (
                  <Link key={i.id} href={`/inspections/${i.id}`} className="mt-1 block text-brand-700 hover:underline">
                    Inspection · {i.status.replace("_", " ")}
                  </Link>
                ))}
              </div>
            )}
          </Card>

          <Card title="Timeline">
            {d.events.length ? (
              <ol className="relative space-y-3 border-l border-slate-200 pl-4">
                {d.events.map((e) => (
                  <li key={e.id} className="relative">
                    <span className="absolute -left-[21px] top-1.5 size-2.5 rounded-full border-2 border-white bg-slate-400" aria-hidden />
                    <p className="text-sm text-slate-800">
                      <span className="font-medium">{e.actorName ?? "System"}</span> · {eventText(e)}
                    </p>
                    {(e.data as { reason?: string }).reason && <p className="text-xs text-slate-600">Reason: {(e.data as { reason: string }).reason}</p>}
                    {(e.data as { credentialOverride?: string }).credentialOverride && (
                      <p className="text-xs text-amber-800">Credential override: {(e.data as { credentialOverride: string }).credentialOverride}</p>
                    )}
                    <time className="text-xs text-slate-500" dateTime={e.createdAt.toISOString()} title={formatDateTime(e.createdAt, tz)}>
                      {relativeTime(e.createdAt)}
                    </time>
                  </li>
                ))}
              </ol>
            ) : (
              <EmptyState title="No history" />
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
