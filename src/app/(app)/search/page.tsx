import Link from "next/link";
import { getDb } from "@/db";
import { can } from "@/lib/auth/context";
import { requireContext } from "@/lib/auth/session";
import { one, type SearchParams } from "@/lib/page";
import { listAssets } from "@/domain/assets/service";
import { listContractors, listPeople } from "@/domain/people/service";
import { listSites } from "@/domain/sites/service";
import { formatWoNumber, listWorkOrders } from "@/domain/work-orders/service";
import { Card, EmptyState, PageHeader, StatusBadge } from "@/components/ui";

export const metadata = { title: "Search" };

export default async function SearchPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requireContext();
  const q = (one((await searchParams).q) ?? "").trim().slice(0, 100);
  const db = getDb();
  if (!q) return <PageHeader title="Search" description="Type in the search box above to find work orders, sites, assets and people." />;
  const [wos, sites, assets, people, contractors] = await Promise.all([
    can(ctx, "wo.view") ? listWorkOrders(db, ctx, { q, pageSize: 10 }).then((r) => r.rows) : [],
    can(ctx, "site.view") ? listSites(db, ctx, { q }) : [],
    can(ctx, "asset.view") ? listAssets(db, ctx, { q }) : [],
    can(ctx, "people.view") ? listPeople(db, ctx, { q }) : [],
    can(ctx, "contractor.view") ? listContractors(db, ctx, { q }) : [],
  ]);
  const total = wos.length + sites.length + assets.length + people.length + contractors.length;
  const Section = ({ title, children, count }: { title: string; children: React.ReactNode; count: number }) =>
    count ? (
      <Card title={`${title} (${count})`}>
        <ul className="divide-y divide-slate-100">{children}</ul>
      </Card>
    ) : null;
  return (
    <>
      <PageHeader title={`Results for “${q}”`} description={`${total} result(s) in records you can access`} />
      {total === 0 ? (
        <Card>
          <EmptyState title="No matches" description="Try a work-order number (e.g. WO-1004), site code or asset code." />
        </Card>
      ) : (
        <div className="space-y-4">
          <Section title="Work orders" count={wos.length}>
            {wos.map((w) => (
              <li key={w.id} className="flex items-center justify-between gap-2 py-2">
                <Link href={`/work-orders/${w.id}`} className="text-sm hover:underline">
                  <span className="font-mono text-xs font-semibold text-brand-700">{formatWoNumber(w.number)}</span> {w.title} <span className="text-xs text-slate-500">· {w.siteName}</span>
                </Link>
                <StatusBadge status={w.status} />
              </li>
            ))}
          </Section>
          <Section title="Sites" count={sites.length}>
            {sites.map((s) => (
              <li key={s.id} className="py-2 text-sm">
                <Link href={`/sites/${s.id}`} className="hover:underline">
                  {s.name} <span className="text-xs text-slate-500">· {s.code}</span>
                </Link>
              </li>
            ))}
          </Section>
          <Section title="Assets" count={assets.length}>
            {assets.map((a) => (
              <li key={a.id} className="py-2 text-sm">
                <Link href={`/assets/${a.id}`} className="hover:underline">
                  {a.name} <span className="text-xs text-slate-500">· {a.code} · {a.siteName}</span>
                </Link>
              </li>
            ))}
          </Section>
          <Section title="People" count={people.length}>
            {people.map((p) => (
              <li key={p.id} className="py-2 text-sm">
                <Link href={`/people/${p.id}`} className="hover:underline">
                  {p.name}
                </Link>
              </li>
            ))}
          </Section>
          <Section title="Contractors" count={contractors.length}>
            {contractors.map((c) => (
              <li key={c.id} className="py-2 text-sm">
                <Link href={`/people/contractors/${c.id}`} className="hover:underline">
                  {c.name}
                </Link>
              </li>
            ))}
          </Section>
        </div>
      )}
    </>
  );
}
