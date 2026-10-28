import Link from "next/link";
import { ClipboardCheck } from "lucide-react";
import { getDb } from "@/db";
import { can } from "@/lib/auth/context";
import { requireContext } from "@/lib/auth/session";
import { one, requirePagePerm, type SearchParams } from "@/lib/page";
import { formatDateTime } from "@/lib/time";
import { INSPECTION_STATUS_LABELS, listRuns, listTemplates } from "@/domain/inspections/service";
import { Badge, Card, cn, EmptyState, LinkButton, PageHeader, Table, Td, Th } from "@/components/ui";

export const metadata = { title: "Inspections" };

export default async function InspectionsPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requireContext();
  requirePagePerm(ctx, "inspection.view");
  const sp = await searchParams;
  const tab = one(sp.tab) === "templates" ? "templates" : "runs";
  const db = getDb();
  const [runs, templates] = await Promise.all([listRuns(db, ctx), listTemplates(db, ctx)]);
  return (
    <>
      <PageHeader
        title="Inspections"
        description="Quality audits and checks with evidence and defects."
        actions={
          <>
            {can(ctx, "inspection.template.manage") && (
              <LinkButton href="/inspections/templates/new" variant="secondary">
                New template
              </LinkButton>
            )}
            {can(ctx, "inspection.run") && <LinkButton href="/inspections/new">Start inspection</LinkButton>}
          </>
        }
      />
      <nav className="mb-4 flex w-fit gap-1 rounded-lg bg-slate-100 p-1" aria-label="Tabs">
        {(["runs", "templates"] as const).map((t) => (
          <Link key={t} href={`/inspections?tab=${t}`} aria-current={tab === t ? "page" : undefined} className={cn("rounded-md px-3 py-1.5 text-sm font-medium", tab === t ? "bg-white text-slate-900 shadow-xs" : "text-slate-600")}>
            {t === "runs" ? `Inspections (${runs.length})` : `Templates (${templates.length})`}
          </Link>
        ))}
      </nav>
      <Card bodyClassName="p-0">
        {tab === "runs" ? (
          runs.length ? (
            <Table>
              <thead className="bg-slate-50">
                <tr>
                  <Th>Inspection</Th>
                  <Th>Site</Th>
                  <Th>Inspector</Th>
                  <Th>Result</Th>
                  <Th className="text-right">Score</Th>
                  <Th className="text-right">Defects</Th>
                  <Th>Date</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {runs.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <Td>
                      <Link href={`/inspections/${r.id}`} className="font-medium text-slate-900 hover:underline">
                        {r.templateName}
                      </Link>
                      {r.workOrderNumber && <div className="text-xs text-slate-500">WO-{r.workOrderNumber}</div>}
                    </Td>
                    <Td>{r.siteName}</Td>
                    <Td>{r.inspectorName}</Td>
                    <Td>
                      <Badge tone={r.status === "passed" ? "green" : r.status === "failed" ? "red" : r.status === "needs_review" ? "amber" : "blue"}>{INSPECTION_STATUS_LABELS[r.status]}</Badge>
                    </Td>
                    <Td className="text-right tabular-nums">{r.score ? `${r.score}%` : "—"}</Td>
                    <Td className="text-right tabular-nums">{r.defectCount}</Td>
                    <Td className="whitespace-nowrap text-xs text-slate-500">{formatDateTime(r.submittedAt ?? r.startedAt, r.siteTimezone, { withZone: false })}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          ) : (
            <EmptyState icon={<ClipboardCheck className="size-8" />} title="No inspections yet" action={can(ctx, "inspection.run") ? <LinkButton href="/inspections/new">Start inspection</LinkButton> : undefined} />
          )
        ) : templates.length ? (
          <Table>
            <thead className="bg-slate-50">
              <tr>
                <Th>Template</Th>
                <Th>Category</Th>
                <Th className="text-right">Items</Th>
                <Th className="text-right">Times used</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {templates.map((t) => (
                <tr key={t.id} className="hover:bg-slate-50">
                  <Td>
                    <Link href={`/inspections/templates/${t.id}`} className="font-medium text-slate-900 hover:underline">
                      {t.name}
                    </Link>
                    <div className="text-xs text-slate-500">{t.serviceType ?? ""}</div>
                  </Td>
                  <Td>{t.category}</Td>
                  <Td className="text-right tabular-nums">{t.itemCount}</Td>
                  <Td className="text-right tabular-nums">{t.runCount}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <EmptyState title="No templates yet" action={can(ctx, "inspection.template.manage") ? <LinkButton href="/inspections/templates/new">Create template</LinkButton> : undefined} />
        )}
      </Card>
    </>
  );
}
