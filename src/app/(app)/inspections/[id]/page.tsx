import Link from "next/link";
import { getDb } from "@/db";
import { requireContext } from "@/lib/auth/session";
import { load } from "@/lib/page";
import { formatDateTime } from "@/lib/time";
import { getRun, INSPECTION_STATUS_LABELS } from "@/domain/inspections/service";
import { ActionButton } from "@/components/forms";
import { UploadForm } from "@/components/upload-form";
import { Badge, Card, DefinitionList, Notice, PageHeader, StatusBadge } from "@/components/ui";
import { AnswersForm, DefectForm } from "../forms";
import { defectWorkOrderAction } from "../actions";

export const metadata = { title: "Inspection" };

export default async function InspectionPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireContext();
  const { id } = await params;
  const d = await load(getRun(getDb(), ctx, id));
  const tz = d.site.timezone;
  const tone = d.run.status === "passed" ? "green" : d.run.status === "failed" ? "red" : d.run.status === "needs_review" ? "amber" : "blue";
  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "Inspections", href: "/inspections" }, { label: d.template.name }]}
        title={d.template.name}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <Badge tone={tone}>{INSPECTION_STATUS_LABELS[d.run.status]}</Badge>
            {d.run.score && <span className="font-medium">{d.run.score}%</span>}
            <span>
              {d.site.name} · {d.inspectorName}
            </span>
          </span>
        }
      />
      {d.run.status === "needs_review" && <div className="mb-4"><Notice tone="warn">Submitted without the required photo evidence — review before relying on this result.</Notice></div>}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card title="Checklist">
            <AnswersForm runId={d.run.id} items={d.items} answers={d.answers} notes={d.run.notes} editable={d.editable} />
          </Card>
          <Card title={`Defects (${d.defects.length})`}>
            {d.defects.length ? (
              <ul className="space-y-3">
                {d.defects.map((df) => (
                  <li key={df.id} className="flex flex-wrap items-start justify-between gap-3 rounded-md border border-slate-200 p-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900">{df.description}</p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        <Badge tone={df.severity === "critical" || df.severity === "high" ? "red" : df.severity === "medium" ? "amber" : "gray"}>{df.severity}</Badge>
                        {df.locationText && <span className="ml-2">{df.locationText}</span>}
                      </p>
                    </div>
                    {df.linkedWorkOrderId ? (
                      <Link href={`/work-orders/${df.linkedWorkOrderId}`} className="text-sm font-medium text-brand-700 hover:underline">
                        WO-{df.workOrderNumber} →
                      </Link>
                    ) : d.canCreateWorkOrder ? (
                      <ActionButton action={defectWorkOrderAction} label="Create work order" fields={{ defectId: df.id }} variant="primary" />
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-500">No defects recorded.</p>
            )}
            {d.editable && (
              <div className="mt-3">
                <DefectForm runId={d.run.id} items={d.items} />
              </div>
            )}
          </Card>
        </div>
        <div className="space-y-4">
          <Card title="Details">
            <DefinitionList
              items={[
                ["Site", <Link key="s" href={`/sites/${d.site.id}`} className="text-brand-700 hover:underline">{d.site.name}</Link>],
                ["Started", formatDateTime(d.run.startedAt, tz)],
                ["Submitted", formatDateTime(d.run.submittedAt, tz)],
                ["Signed off by", d.run.signedOffByName],
              ]}
            />
            {d.workOrder && (
              <div className="mt-3 border-t border-slate-100 pt-3 text-sm">
                <p className="text-xs text-slate-500">Linked work order</p>
                <Link href={`/work-orders/${d.workOrder.id}`} className="mt-1 flex items-center justify-between gap-2 hover:underline">
                  <span>
                    WO-{d.workOrder.number} {d.workOrder.title}
                  </span>
                  <StatusBadge status={d.workOrder.status} />
                </Link>
                {d.workOrder.status === "ready_for_inspection" && <p className="mt-2 text-xs text-slate-500">Use the work order&apos;s workflow panel to pass it to client approval or return it for rework.</p>}
              </div>
            )}
          </Card>
          <Card title={`Evidence (${d.files.length})`}>
            {d.files.length ? (
              <ul className="grid grid-cols-2 gap-2">
                {d.files.map((f) => (
                  <li key={f.id}>
                    <a href={`/api/files/${f.id}`} target="_blank" rel="noopener" className="block overflow-hidden rounded border border-slate-200">
                      {f.contentType.startsWith("image/") ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={`/api/files/${f.id}`} alt={f.caption ?? f.fileName} className="aspect-video w-full object-cover" />
                      ) : (
                        <span className="block p-2 text-xs">{f.fileName}</span>
                      )}
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-500">No photos attached.</p>
            )}
            {d.editable && (
              <div className="mt-3 border-t border-slate-100 pt-3">
                <UploadForm entityType="inspection_run" entityId={d.run.id} label="Add photo" />
              </div>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
