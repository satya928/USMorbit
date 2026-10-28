import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { getDb } from "@/db";
import { can } from "@/lib/auth/context";
import { requireContext } from "@/lib/auth/session";
import { one, requirePagePerm, type SearchParams } from "@/lib/page";
import { formatDate } from "@/lib/time";
import { COMPLIANCE_TYPE_LABELS, COMPLIANCE_VIEWS, complianceCounts, listCompliance, type ComplianceView } from "@/domain/compliance/service";
import { Card, cn, ComplianceBadge, EmptyState, LinkButton, Notice, PageHeader, Table, Td, Th } from "@/components/ui";

export const metadata = { title: "Compliance" };

const VIEW_LABELS: Record<ComplianceView, string> = {
  all: "All",
  expiring30: "Expiring ≤30d",
  expiring60: "≤60d",
  expiring90: "≤90d",
  expired: "Expired",
  pending_review: "Pending review",
};

export default async function CompliancePage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requireContext();
  requirePagePerm(ctx, "compliance.view");
  const sp = await searchParams;
  const view = COMPLIANCE_VIEWS.includes(one(sp.view) as ComplianceView) ? (one(sp.view) as ComplianceView) : "all";
  const q = one(sp.q);
  const db = getDb();
  const [rows, counts] = await Promise.all([listCompliance(db, ctx, { view, q }), complianceCounts(db, ctx)]);
  return (
    <>
      <PageHeader
        title="Compliance"
        description="Insurance, licences, certifications and safety documents for contractors, people, sites and assets."
        actions={can(ctx, "compliance.manage") && <LinkButton href="/compliance/new">Add item</LinkButton>}
      />
      <div className="mb-4">
        <Notice tone="info">USM Orbit tracks evidence and expiry dates. It does not certify regulatory compliance — verify documents against the issuing authority.</Notice>
      </div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <nav className="flex flex-wrap gap-1 rounded-lg bg-slate-100 p-1" aria-label="Compliance views">
          {COMPLIANCE_VIEWS.map((v) => (
            <Link
              key={v}
              href={`/compliance?view=${v}`}
              aria-current={view === v ? "page" : undefined}
              className={cn("rounded-md px-3 py-1.5 text-sm font-medium", view === v ? "bg-white text-slate-900 shadow-xs" : "text-slate-600 hover:text-slate-900")}
            >
              {VIEW_LABELS[v]} <span className={cn("ml-1 tabular-nums", v === "expired" && counts.expired ? "text-red-700" : "text-slate-500")}>{counts[v]}</span>
            </Link>
          ))}
        </nav>
        <form className="flex gap-2">
          <input type="hidden" name="view" value={view} />
          <input name="q" type="search" defaultValue={q} placeholder="Search name, issuer, reference" className="input" aria-label="Search compliance" />
        </form>
      </div>
      <Card bodyClassName="p-0">
        {rows.length ? (
          <Table>
            <thead className="bg-slate-50">
              <tr>
                <Th>Item</Th>
                <Th>Applies to</Th>
                <Th>Issuer</Th>
                <Th>Expiry</Th>
                <Th>Status</Th>
                <Th>Verified</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <Td>
                    <Link href={`/compliance/${r.id}`} className="font-medium text-slate-900 hover:underline">
                      {r.name}
                    </Link>
                    <div className="text-xs text-slate-500">{COMPLIANCE_TYPE_LABELS[r.itemType]}</div>
                  </Td>
                  <Td>
                    {r.relatedName}
                    <div className="text-xs capitalize text-slate-500">{r.subjectType}</div>
                  </Td>
                  <Td>{r.issuer ?? "—"}</Td>
                  <Td className="whitespace-nowrap">
                    {formatDate(r.expiryDate)}
                    {r.daysToExpiry !== null && (
                      <div className={cn("text-xs", r.daysToExpiry < 0 ? "text-red-700" : r.daysToExpiry <= 30 ? "text-amber-700" : "text-slate-500")}>
                        {r.daysToExpiry < 0 ? `${-r.daysToExpiry} days ago` : `in ${r.daysToExpiry} days`}
                      </div>
                    )}
                  </Td>
                  <Td>
                    <ComplianceBadge status={r.status} />
                  </Td>
                  <Td className="text-xs">{r.verifiedByName ?? <span className="text-slate-400">Not verified</span>}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <EmptyState icon={<ShieldCheck className="size-8" />} title={view === "all" ? "No compliance items yet" : `Nothing in “${VIEW_LABELS[view]}”`} description={view === "expired" ? "No expired items — good." : undefined} />
        )}
      </Card>
    </>
  );
}
