import Link from "next/link";
import { Pencil } from "lucide-react";
import { getDb } from "@/db";
import { can } from "@/lib/auth/context";
import { requireContext } from "@/lib/auth/session";
import { load } from "@/lib/page";
import { formatDate, formatDateTime } from "@/lib/time";
import { getSite } from "@/domain/sites/service";
import { formatWoNumber } from "@/domain/work-orders/service";
import { computeComplianceStatus } from "@/domain/compliance/status";
import { INSPECTION_STATUS_LABELS } from "@/domain/inspections/service";
import { ActionButton } from "@/components/forms";
import { Badge, Card, ComplianceBadge, DefinitionList, EmptyState, LinkButton, Notice, PageHeader, PriorityBadge, StatusBadge } from "@/components/ui";
import { archiveSiteAction } from "../actions";

export const metadata = { title: "Site" };

export default async function SitePage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireContext();
  const { id } = await params;
  const d = await load(getSite(getDb(), ctx, id));
  const s = d.site;
  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "Sites", href: "/sites" }, { label: s.name }]}
        title={s.name}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono">{s.code}</span> · {s.siteType} · {[s.city, s.country].filter(Boolean).join(", ")}
            {s.archivedAt && <Badge>Archived</Badge>}
          </span>
        }
        actions={
          <>
            {can(ctx, "wo.create") && !s.archivedAt && <LinkButton href={`/work-orders/new?siteId=${s.id}`}>New work order</LinkButton>}
            {can(ctx, "site.manage") && (
              <LinkButton href={`/sites/${s.id}/edit`} variant="secondary">
                <Pencil className="size-4" /> Edit
              </LinkButton>
            )}
          </>
        }
      />
      {s.archivedAt && <div className="mb-4"><Notice tone="warn">This site is archived. Its history is kept but new work cannot be raised.</Notice></div>}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card title={`Recent work orders (${d.openWork} open)`} actions={<Link href={`/work-orders?site=${s.id}`} className="text-xs font-medium text-brand-600 hover:underline">View all</Link>}>
            {d.recentWork.length ? (
              <ul className="divide-y divide-slate-100">
                {d.recentWork.map((w) => (
                  <li key={w.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <Link href={`/work-orders/${w.id}`} className="min-w-0 text-sm hover:underline">
                      <span className="font-mono text-xs font-semibold text-brand-700">{formatWoNumber(w.number)}</span> {w.title}
                    </Link>
                    <span className="flex gap-1.5">
                      <PriorityBadge priority={w.priority} />
                      <StatusBadge status={w.status} />
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="No work orders at this site" />
            )}
          </Card>
          <Card title={`Assets (${d.assets.length})`} actions={can(ctx, "asset.manage") && <Link href={`/assets/new?siteId=${s.id}`} className="text-xs font-medium text-brand-600 hover:underline">Add asset</Link>}>
            {d.assets.length ? (
              <ul className="grid gap-2 sm:grid-cols-2">
                {d.assets.map((a) => (
                  <li key={a.id}>
                    <Link href={`/assets/${a.id}`} className="block rounded-md border border-slate-200 p-3 hover:border-slate-300 hover:bg-slate-50">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium text-slate-900">{a.name}</span>
                        <Badge tone={a.criticality === "critical" ? "red" : a.criticality === "high" ? "orange" : "gray"}>{a.criticality}</Badge>
                      </div>
                      <div className="mt-0.5 text-xs text-slate-500">
                        {a.code} · {a.category} · {a.locationText ?? "—"}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="No assets registered" />
            )}
          </Card>
        </div>
        <div className="space-y-4">
          <Card title="Site details">
            <DefinitionList
              items={[
                ["Address", s.address],
                ["Time zone", s.timezone],
                ["Site manager", d.manager?.name],
                ["Contact", s.contactName],
                ["Contact email", s.contactEmail],
                ["Status", s.status],
              ]}
            />
            {can(ctx, "site.manage") && (
              <div className="mt-4 border-t border-slate-100 pt-3">
                <ActionButton action={archiveSiteAction} label={s.archivedAt ? "Restore site" : "Archive site"} fields={{ id: s.id, archived: String(!s.archivedAt) }} variant="ghost" confirm={s.archivedAt ? undefined : "Archive this site? Its history is kept but no new work can be raised."} />
              </div>
            )}
          </Card>
          {can(ctx, "compliance.view") && (
            <Card title="Compliance">
              {d.compliance.length ? (
                <ul className="space-y-2">
                  {d.compliance.map((c) => (
                    <li key={c.id} className="flex items-center justify-between gap-2 text-sm">
                      <Link href={`/compliance/${c.id}`} className="min-w-0 truncate hover:underline">
                        {c.name}
                      </Link>
                      <ComplianceBadge status={computeComplianceStatus(c)} />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-slate-500">No site compliance records.</p>
              )}
            </Card>
          )}
          <Card title="Recent inspections">
            {d.inspections.length ? (
              <ul className="space-y-2">
                {d.inspections.map((i) => (
                  <li key={i.id} className="text-sm">
                    <Link href={`/inspections/${i.id}`} className="hover:underline">
                      {i.templateName}
                    </Link>
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <Badge tone={i.status === "passed" ? "green" : i.status === "failed" ? "red" : "amber"}>{INSPECTION_STATUS_LABELS[i.status]}</Badge>
                      {i.score && <span>{i.score}%</span>}
                      <span>{i.submittedAt ? formatDateTime(i.submittedAt, s.timezone, { withZone: false }) : `started ${formatDate(i.startedAt, s.timezone)}`}</span>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-500">No inspections yet.</p>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
