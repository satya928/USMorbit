import Link from "next/link";
import { Boxes } from "lucide-react";
import { getDb } from "@/db";
import { can } from "@/lib/auth/context";
import { requireContext } from "@/lib/auth/session";
import { one, requirePagePerm, type SearchParams } from "@/lib/page";
import { formatDate } from "@/lib/time";
import { ASSET_CATEGORIES, listAssets } from "@/domain/assets/service";
import { siteOptions } from "@/domain/sites/service";
import { Badge, Card, EmptyState, LinkButton, PageHeader, Table, Td, Th } from "@/components/ui";
import { HealthBadge } from "./health";

export const metadata = { title: "Assets" };

export default async function AssetsPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requireContext();
  requirePagePerm(ctx, "asset.view");
  const sp = await searchParams;
  const db = getDb();
  const sites = await siteOptions(db, ctx);
  const siteId = sites.some((s) => s.id === one(sp.site)) ? one(sp.site) : undefined;
  const category = ASSET_CATEGORIES.includes(one(sp.category) ?? "") ? one(sp.category) : undefined;
  const assets = await listAssets(db, ctx, { q: one(sp.q), siteId, category });
  const today = new Date().toISOString().slice(0, 10);
  return (
    <>
      <PageHeader title="Assets" description="Equipment register with service history and a rule-based health indicator." actions={can(ctx, "asset.manage") && <LinkButton href="/assets/new">Add asset</LinkButton>} />
      <form className="mb-4 flex flex-wrap gap-2">
        <input name="q" type="search" defaultValue={one(sp.q)} placeholder="Search code, name, serial" className="input max-w-xs" aria-label="Search assets" />
        <select name="site" defaultValue={siteId ?? ""} className="input w-auto" aria-label="Site">
          <option value="">All sites</option>
          {sites.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <select name="category" defaultValue={category ?? ""} className="input w-auto" aria-label="Category">
          <option value="">All categories</option>
          {ASSET_CATEGORIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <button className="rounded-md bg-navy-800 px-3 py-2 text-sm font-medium text-white">Filter</button>
      </form>
      <Card bodyClassName="p-0">
        {assets.length ? (
          <Table>
            <thead className="bg-slate-50">
              <tr>
                <Th>Asset</Th>
                <Th>Site / location</Th>
                <Th>Category</Th>
                <Th>Criticality</Th>
                <Th>Health</Th>
                <Th>Next maintenance</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {assets.map((a) => (
                <tr key={a.id} className="hover:bg-slate-50">
                  <Td>
                    <Link href={`/assets/${a.id}`} className="font-medium text-slate-900 hover:underline">
                      {a.name}
                    </Link>
                    <div className="font-mono text-xs text-slate-500">{a.code}</div>
                  </Td>
                  <Td>
                    {a.siteName}
                    <div className="text-xs text-slate-500">{a.locationText ?? "—"}</div>
                  </Td>
                  <Td>{a.category}</Td>
                  <Td>
                    <Badge tone={a.criticality === "critical" ? "red" : a.criticality === "high" ? "orange" : "gray"}>{a.criticality}</Badge>
                  </Td>
                  <Td>
                    <HealthBadge health={a.health} />
                  </Td>
                  <Td className={a.nextMaintenanceAt && a.nextMaintenanceAt < today ? "font-medium text-red-700" : ""}>{formatDate(a.nextMaintenanceAt)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <EmptyState icon={<Boxes className="size-8" />} title="No assets found" action={can(ctx, "asset.manage") ? <LinkButton href="/assets/new">Add asset</LinkButton> : undefined} />
        )}
      </Card>
      <p className="mt-3 text-xs text-slate-500">Health is a transparent rule: recorded condition, minus points for overdue maintenance and recent corrective work. It is not a predictive model and uses no sensor data.</p>
    </>
  );
}
