import Link from "next/link";
import { Building2 } from "lucide-react";
import { getDb } from "@/db";
import { can } from "@/lib/auth/context";
import { requireContext } from "@/lib/auth/session";
import { one, requirePagePerm, type SearchParams } from "@/lib/page";
import { listSites } from "@/domain/sites/service";
import { Badge, Card, EmptyState, LinkButton, PageHeader, Table, Td, Th } from "@/components/ui";

export const metadata = { title: "Sites" };

export default async function SitesPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requireContext();
  requirePagePerm(ctx, "site.view");
  const sp = await searchParams;
  const q = one(sp.q);
  const archived = one(sp.archived) === "1";
  const sites = await listSites(getDb(), ctx, { q, includeArchived: archived });
  return (
    <>
      <PageHeader title="Sites" description="Buildings and locations in your portfolio." actions={can(ctx, "site.manage") && <LinkButton href="/sites/new">Add site</LinkButton>} />
      <form className="mb-4 flex flex-wrap items-center gap-2">
        <input name="q" type="search" defaultValue={q} placeholder="Search sites" className="input max-w-xs" aria-label="Search sites" />
        <label className="flex items-center gap-1.5 text-sm text-slate-700">
          <input type="checkbox" name="archived" value="1" defaultChecked={archived} className="size-4 rounded border-slate-300" /> Include archived
        </label>
        <button className="rounded-md bg-navy-800 px-3 py-2 text-sm font-medium text-white">Search</button>
      </form>
      <Card bodyClassName="p-0">
        {sites.length ? (
          <Table>
            <thead className="bg-slate-50">
              <tr>
                <Th>Site</Th>
                <Th>Type</Th>
                <Th>Location</Th>
                <Th>Time zone</Th>
                <Th className="text-right">Assets</Th>
                <Th className="text-right">Open work</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sites.map((s) => (
                <tr key={s.id} className="hover:bg-slate-50">
                  <Td>
                    <Link href={`/sites/${s.id}`} className="font-medium text-slate-900 hover:underline">
                      {s.name}
                    </Link>
                    <div className="font-mono text-xs text-slate-500">{s.code}</div>
                  </Td>
                  <Td>{s.siteType}</Td>
                  <Td>{[s.city, s.country].filter(Boolean).join(", ") || "—"}</Td>
                  <Td className="text-xs">{s.timezone}</Td>
                  <Td className="text-right tabular-nums">{s.assetCount}</Td>
                  <Td className="text-right tabular-nums">{s.openWork}</Td>
                  <Td>{s.archivedAt ? <Badge>Archived</Badge> : s.status === "active" ? <Badge tone="green">Active</Badge> : <Badge>Inactive</Badge>}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <EmptyState icon={<Building2 className="size-8" />} title={q ? "No sites match your search" : "No sites yet"} description={ctx.allSites ? undefined : "You only see sites you have been granted access to."} action={can(ctx, "site.manage") && !q ? <LinkButton href="/sites/new">Add your first site</LinkButton> : undefined} />
        )}
      </Card>
    </>
  );
}
