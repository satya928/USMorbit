import Link from "next/link";
import { getDb } from "@/db";
import { can } from "@/lib/auth/context";
import { requireContext } from "@/lib/auth/session";
import { load } from "@/lib/page";
import { formatDate } from "@/lib/time";
import { contractorOptions, getPerson, PERSON_TYPE_LABELS } from "@/domain/people/service";
import { siteOptions } from "@/domain/sites/service";
import { computeComplianceStatus } from "@/domain/compliance/status";
import { formatWoNumber } from "@/domain/work-orders/service";
import { Badge, Card, ComplianceBadge, DefinitionList, LinkButton, PageHeader, StatusBadge } from "@/components/ui";
import { PersonForm } from "../forms";
import { updatePersonAction } from "../actions";

export const metadata = { title: "Person" };

export default async function PersonPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireContext();
  const { id } = await params;
  const db = getDb();
  const { person: p, credentials, openWork } = await load(getPerson(db, ctx, id));
  const editable = can(ctx, "people.manage");
  const [contractors, sites] = editable ? await Promise.all([contractorOptions(db, ctx), siteOptions(db, ctx)]) : [[], []];
  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "People", href: "/people" }, { label: p.name }]}
        title={p.name}
        description={
          <span className="flex items-center gap-2">
            {PERSON_TYPE_LABELS[p.personType]} {p.active ? <Badge tone="green">Active</Badge> : <Badge>Inactive</Badge>}
          </span>
        }
        actions={can(ctx, "compliance.manage") && <LinkButton href={`/compliance/new?subjectType=person&personId=${p.id}`} variant="secondary">Add credential</LinkButton>}
      />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {editable ? (
            <Card title="Profile">
              <PersonForm action={updatePersonAction} values={p} contractors={contractors} sites={sites} />
            </Card>
          ) : (
            <Card title="Profile">
              <DefinitionList items={[["Email", p.email], ["Phone", p.phone], ["Skills", p.skills.join(", ")]]} />
            </Card>
          )}
        </div>
        <div className="space-y-4">
          {can(ctx, "compliance.view") && (
            <Card title="Licences & certifications">
              {credentials.length ? (
                <ul className="space-y-2">
                  {credentials.map((c) => (
                    <li key={c.id} className="text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <Link href={`/compliance/${c.id}`} className="hover:underline">
                          {c.name}
                        </Link>
                        <ComplianceBadge status={computeComplianceStatus(c)} />
                      </div>
                      <div className="text-xs text-slate-500">Expires {formatDate(c.expiryDate)}</div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-slate-500">No credentials recorded.</p>
              )}
            </Card>
          )}
          <Card title={`Open work (${openWork.length})`}>
            {openWork.length ? (
              <ul className="space-y-2">
                {openWork.map((w) => (
                  <li key={w.id} className="flex items-center justify-between gap-2 text-sm">
                    <Link href={`/work-orders/${w.id}`} className="min-w-0 truncate hover:underline">
                      <span className="font-mono text-xs text-brand-700">{formatWoNumber(w.number)}</span> {w.title}
                    </Link>
                    <StatusBadge status={w.status} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-500">No open work assigned.</p>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
