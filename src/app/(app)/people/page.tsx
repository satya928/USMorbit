import Link from "next/link";
import { Users } from "lucide-react";
import { getDb } from "@/db";
import { can } from "@/lib/auth/context";
import { requireContext } from "@/lib/auth/session";
import { one, requirePagePerm, type SearchParams } from "@/lib/page";
import { listContractors, listPeople, PERSON_TYPE_LABELS } from "@/domain/people/service";
import { Badge, Card, cn, EmptyState, LinkButton, PageHeader, Table, Td, Th } from "@/components/ui";

export const metadata = { title: "People & Contractors" };

export default async function PeoplePage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requireContext();
  requirePagePerm(ctx, "people.view", "contractor.view");
  const sp = await searchParams;
  const tab = one(sp.tab) === "contractors" || !can(ctx, "people.view") ? "contractors" : "people";
  const q = one(sp.q);
  const db = getDb();
  return (
    <>
      <PageHeader
        title="People & Contractors"
        description="Your workforce, client contacts and external service providers."
        actions={
          tab === "people"
            ? can(ctx, "people.manage") && <LinkButton href="/people/new">Add person</LinkButton>
            : can(ctx, "contractor.manage") && <LinkButton href="/people/contractors/new">Add contractor</LinkButton>
        }
      />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <nav className="flex gap-1 rounded-lg bg-slate-100 p-1" aria-label="Tabs">
          {(["people", "contractors"] as const)
            .filter((t) => (t === "people" ? can(ctx, "people.view") : can(ctx, "contractor.view")))
            .map((t) => (
              <Link key={t} href={`/people?tab=${t}`} aria-current={tab === t ? "page" : undefined} className={cn("rounded-md px-3 py-1.5 text-sm font-medium", tab === t ? "bg-white text-slate-900 shadow-xs" : "text-slate-600 hover:text-slate-900")}>
                {t === "people" ? "People" : "Contractors"}
              </Link>
            ))}
        </nav>
        <form className="flex gap-2">
          <input type="hidden" name="tab" value={tab} />
          <input name="q" type="search" defaultValue={q} placeholder={`Search ${tab}`} className="input" aria-label={`Search ${tab}`} />
        </form>
      </div>
      {tab === "people" ? <PeopleTable rows={await listPeople(db, ctx, { q })} /> : <ContractorTable rows={await listContractors(db, ctx, { q })} />}
    </>
  );
}

function PeopleTable({ rows }: { rows: Awaited<ReturnType<typeof listPeople>> }) {
  return (
    <Card bodyClassName="p-0">
      {rows.length ? (
        <Table>
          <thead className="bg-slate-50">
            <tr>
              <Th>Name</Th>
              <Th>Type</Th>
              <Th>Company</Th>
              <Th>Home site</Th>
              <Th>Skills</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((p) => (
              <tr key={p.id} className="hover:bg-slate-50">
                <Td>
                  <Link href={`/people/${p.id}`} className="font-medium text-slate-900 hover:underline">
                    {p.name}
                  </Link>
                  <div className="text-xs text-slate-500">{p.email ?? "—"}</div>
                </Td>
                <Td>{PERSON_TYPE_LABELS[p.personType]}</Td>
                <Td>{p.contractorName ?? "In-house"}</Td>
                <Td>{p.homeSiteName ?? "—"}</Td>
                <Td className="max-w-xs text-xs">{p.skills.join(", ") || "—"}</Td>
                <Td>
                  <span className="flex flex-wrap gap-1">
                    {p.active ? <Badge tone="green">Active</Badge> : <Badge>Inactive</Badge>}
                    {p.userId && <Badge tone="blue">Has login</Badge>}
                  </span>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      ) : (
        <EmptyState icon={<Users className="size-8" />} title="No people found" />
      )}
    </Card>
  );
}

function ContractorTable({ rows }: { rows: Awaited<ReturnType<typeof listContractors>> }) {
  return (
    <Card bodyClassName="p-0">
      {rows.length ? (
        <Table>
          <thead className="bg-slate-50">
            <tr>
              <Th>Company</Th>
              <Th>Services</Th>
              <Th>Regions</Th>
              <Th className="text-right">Assigned</Th>
              <Th className="text-right">Completed</Th>
              <Th className="text-right">Overdue</Th>
              <Th className="text-right">Rework</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((c) => (
              <tr key={c.id} className="hover:bg-slate-50">
                <Td>
                  <Link href={`/people/contractors/${c.id}`} className="font-medium text-slate-900 hover:underline">
                    {c.name}
                  </Link>
                  <div className="text-xs text-slate-500">{c.contactName ?? "—"}</div>
                </Td>
                <Td className="text-xs">{c.categories.join(", ") || "—"}</Td>
                <Td className="text-xs">{c.serviceRegions.join(", ") || "—"}</Td>
                <Td className="text-right tabular-nums">{c.assigned}</Td>
                <Td className="text-right tabular-nums">{c.completed}</Td>
                <Td className={cn("text-right tabular-nums", c.overdue > 0 && "font-semibold text-red-700")}>{c.overdue}</Td>
                <Td className="text-right tabular-nums">{c.rework}</Td>
                <Td>{c.status === "active" ? <Badge tone="green">Active</Badge> : <Badge>Inactive</Badge>}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      ) : (
        <EmptyState title="No contractors found" />
      )}
    </Card>
  );
}
