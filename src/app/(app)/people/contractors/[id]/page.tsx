import Link from "next/link";
import { getDb } from "@/db";
import { can } from "@/lib/auth/context";
import { requireContext } from "@/lib/auth/session";
import { load } from "@/lib/page";
import { formatDate } from "@/lib/time";
import { categoryOptions, getContractor, PERSON_TYPE_LABELS } from "@/domain/people/service";
import { computeComplianceStatus } from "@/domain/compliance/status";
import { formatWoNumber } from "@/domain/work-orders/service";
import { Badge, Card, ComplianceBadge, DefinitionList, KpiCard, LinkButton, PageHeader, pct, PriorityBadge, StatusBadge } from "@/components/ui";
import { ContractorForm } from "../../forms";
import { updateContractorAction } from "../../actions";

export const metadata = { title: "Contractor" };

export default async function ContractorPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireContext();
  const { id } = await params;
  const db = getDb();
  const d = await load(getContractor(db, ctx, id));
  const c = d.contractor;
  const editable = can(ctx, "contractor.manage");
  const categories = editable ? await categoryOptions(db, ctx) : [];
  const perf = d.performance;
  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "Contractors", href: "/people?tab=contractors" }, { label: c.name }]}
        title={c.name}
        description={
          <span className="flex items-center gap-2">
            {d.categories.map((x) => x.name).join(", ") || "No categories"} {c.status === "active" ? <Badge tone="green">Active</Badge> : <Badge>Inactive</Badge>}
          </span>
        }
        actions={can(ctx, "compliance.manage") && <LinkButton href={`/compliance/new?subjectType=contractor&contractorId=${c.id}`} variant="secondary">Add compliance document</LinkButton>}
      />
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-5">
        <KpiCard label="Assigned" value={perf.assigned} />
        <KpiCard label="Completed" value={perf.completed} />
        <KpiCard label="Completion rate" value={pct(perf.assigned ? perf.completed / perf.assigned : null)} />
        <KpiCard label="Overdue now" value={perf.overdue} tone={perf.overdue ? "bad" : "good"} />
        <KpiCard label="Returned for rework" value={perf.rework} tone={perf.rework ? "warn" : "default"} />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card title="Recent work">
            {d.work.length ? (
              <ul className="divide-y divide-slate-100">
                {d.work.map((w) => (
                  <li key={w.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <Link href={`/work-orders/${w.id}`} className="text-sm hover:underline">
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
              <p className="text-sm text-slate-500">No work assigned yet.</p>
            )}
          </Card>
          {editable ? (
            <Card title="Company details">
              <ContractorForm action={updateContractorAction} categories={categories} values={{ ...c, categoryIds: d.categories.map((x) => x.id) }} />
            </Card>
          ) : (
            <Card title="Company details">
              <DefinitionList items={[["Contact", c.contactName], ["Email", c.contactEmail], ["Phone", c.contactPhone], ["Regions", c.serviceRegions.join(", ")]]} />
            </Card>
          )}
        </div>
        <div className="space-y-4">
          {can(ctx, "compliance.view") && (
            <Card title="Compliance documents">
              {d.compliance.length ? (
                <ul className="space-y-2">
                  {d.compliance.map((x) => (
                    <li key={x.id} className="text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <Link href={`/compliance/${x.id}`} className="hover:underline">
                          {x.name}
                        </Link>
                        <ComplianceBadge status={computeComplianceStatus(x)} />
                      </div>
                      <div className="text-xs text-slate-500">Expires {formatDate(x.expiryDate)}</div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-slate-500">No documents on file.</p>
              )}
            </Card>
          )}
          <Card title={`Staff (${d.staff.length})`}>
            <ul className="space-y-1.5 text-sm">
              {d.staff.map((s) => (
                <li key={s.id} className="flex justify-between gap-2">
                  {can(ctx, "people.view") ? (
                    <Link href={`/people/${s.id}`} className="hover:underline">
                      {s.name}
                    </Link>
                  ) : (
                    <span>{s.name}</span>
                  )}
                  <span className="text-xs text-slate-500">{PERSON_TYPE_LABELS[s.personType]}</span>
                </li>
              ))}
              {!d.staff.length && <li className="text-slate-500">No staff recorded.</li>}
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
