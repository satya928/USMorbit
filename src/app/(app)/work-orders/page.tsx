import Link from "next/link";
import { ArrowDown, ArrowUp, ClipboardList } from "lucide-react";
import { getDb } from "@/db";
import type { Priority, WorkOrderStatus } from "@/db/schema";
import { can } from "@/lib/auth/context";
import { requireContext } from "@/lib/auth/session";
import { one, qs, requirePagePerm, type SearchParams } from "@/lib/page";
import { formatDateTime } from "@/lib/time";
import { formatWoNumber, listWorkOrders, type WorkOrderFilters } from "@/domain/work-orders/service";
import { isOverdue, STATUS_LABELS, WORK_ORDER_STATUSES } from "@/domain/work-orders/state";
import { siteOptions } from "@/domain/sites/service";
import { contractorOptions, categoryOptions } from "@/domain/people/service";
import { Badge, Card, EmptyState, LinkButton, PageHeader, Pagination, PriorityBadge, StatusBadge, Table, Td, Th } from "@/components/ui";

export const metadata = { title: "Work Orders" };

const SORTS = ["created", "due", "priority", "number", "status"] as const;

export default async function WorkOrdersPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requireContext();
  requirePagePerm(ctx, "wo.view");
  const sp = await searchParams;
  const db = getDb();

  const params = {
    q: one(sp.q),
    status: one(sp.status),
    priority: one(sp.priority),
    site: one(sp.site),
    contractor: one(sp.contractor),
    category: one(sp.category),
    overdue: one(sp.overdue),
    open: one(sp.open),
    sort: one(sp.sort),
    dir: one(sp.dir),
  };
  const sort = SORTS.includes(params.sort as (typeof SORTS)[number]) ? (params.sort as WorkOrderFilters["sort"]) : "created";
  const dir = params.dir === "asc" ? "asc" : "desc";
  const filters: WorkOrderFilters = {
    q: params.q,
    status: params.status && WORK_ORDER_STATUSES.includes(params.status as WorkOrderStatus) ? [params.status as WorkOrderStatus] : undefined,
    priority: params.priority && ["low", "medium", "high", "critical"].includes(params.priority) ? [params.priority as Priority] : undefined,
    siteId: params.site,
    contractorId: params.contractor,
    categoryId: params.category,
    overdue: params.overdue === "1",
    open: params.open === "1",
    sort,
    dir,
    page: Number(one(sp.page) ?? 1),
    pageSize: 20,
  };

  const [data, sites, contractorList, categories] = await Promise.all([
    listWorkOrders(db, ctx, sanitize(filters)),
    siteOptions(db, ctx),
    can(ctx, "contractor.view") ? contractorOptions(db, ctx) : Promise.resolve([]),
    categoryOptions(db, ctx),
  ]);
  const active = Object.entries(params).some(([k, v]) => v && !["sort", "dir"].includes(k));

  const sortLink = (key: string) => qs(params, { sort: key, dir: sort === key && dir === "desc" ? "asc" : "desc", page: undefined });
  const SortHeader = ({ k, children, className }: { k: string; children: React.ReactNode; className?: string }) => (
    <Th className={className} aria-sort={sort === k ? (dir === "asc" ? "ascending" : "descending") : undefined}>
      <Link href={`/work-orders${sortLink(k)}`} className="inline-flex items-center gap-1 hover:text-slate-800">
        {children}
        {sort === k && (dir === "asc" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}
      </Link>
    </Th>
  );

  return (
    <>
      <PageHeader
        title="Work Orders"
        description={ctx.role === "technician" ? "Work assigned to you and requests you raised." : ctx.role === "contractor_manager" ? "Work assigned to your company." : "Requests and jobs across your sites."}
        actions={can(ctx, "wo.create") && <LinkButton href="/work-orders/new">{can(ctx, "wo.edit") ? "New work order" : "Raise a request"}</LinkButton>}
      />
      <form className="mb-4 grid grid-cols-2 gap-2 rounded-lg border border-slate-200 bg-white p-3 md:grid-cols-4 xl:grid-cols-7" aria-label="Filter work orders">
        <div className="col-span-2">
          <label htmlFor="q" className="sr-only">
            Search
          </label>
          <input id="q" name="q" type="search" defaultValue={params.q} placeholder="Search title, location or WO number" className="input" />
        </div>
        <select name="status" defaultValue={params.status ?? ""} className="input" aria-label="Status">
          <option value="">Any status</option>
          {WORK_ORDER_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>
        <select name="priority" defaultValue={params.priority ?? ""} className="input" aria-label="Priority">
          <option value="">Any priority</option>
          {["critical", "high", "medium", "low"].map((p) => (
            <option key={p} value={p}>
              {p[0].toUpperCase() + p.slice(1)}
            </option>
          ))}
        </select>
        <select name="site" defaultValue={params.site ?? ""} className="input" aria-label="Site">
          <option value="">All sites</option>
          {sites.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <select name="category" defaultValue={params.category ?? ""} className="input" aria-label="Category">
          <option value="">Any category</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        {contractorList.length > 1 ? (
          <select name="contractor" defaultValue={params.contractor ?? ""} className="input" aria-label="Contractor">
            <option value="">Any contractor</option>
            {contractorList.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        ) : (
          <span className="hidden xl:block" />
        )}
        <div className="col-span-2 flex flex-wrap items-center gap-3 md:col-span-4 xl:col-span-7">
          <label className="flex items-center gap-1.5 text-sm text-slate-700">
            <input type="checkbox" name="open" value="1" defaultChecked={params.open === "1"} className="size-4 rounded border-slate-300" /> Open only
          </label>
          <label className="flex items-center gap-1.5 text-sm text-slate-700">
            <input type="checkbox" name="overdue" value="1" defaultChecked={params.overdue === "1"} className="size-4 rounded border-slate-300" /> Overdue only
          </label>
          <input type="hidden" name="sort" value={sort} />
          <input type="hidden" name="dir" value={dir} />
          <button className="rounded-md bg-navy-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-navy-700">Apply filters</button>
          {active && (
            <Link href="/work-orders" className="text-sm text-slate-600 hover:underline">
              Clear
            </Link>
          )}
        </div>
      </form>

      <Card bodyClassName="p-0">
        {data.rows.length === 0 ? (
          <EmptyState
            icon={<ClipboardList className="size-8" />}
            title={active ? "No work orders match these filters" : "No work orders yet"}
            description={active ? "Try clearing a filter." : "Create the first request to get started."}
            action={!active && can(ctx, "wo.create") ? <LinkButton href="/work-orders/new">Create request</LinkButton> : undefined}
          />
        ) : (
          <>
            <div className="hidden md:block">
              <Table>
                <thead className="bg-slate-50">
                  <tr>
                    <SortHeader k="number">WO</SortHeader>
                    <Th>Title / location</Th>
                    <Th>Site</Th>
                    <Th>Category</Th>
                    <SortHeader k="priority">Priority</SortHeader>
                    <SortHeader k="status">Status</SortHeader>
                    <Th>Assignee</Th>
                    <SortHeader k="due">SLA due</SortHeader>
                    <SortHeader k="created">Created</SortHeader>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.rows.map((r) => {
                    const overdue = isOverdue(r);
                    return (
                      <tr key={r.id} className="hover:bg-slate-50">
                        <Td className="whitespace-nowrap font-mono text-xs">
                          <Link href={`/work-orders/${r.id}`} className="font-semibold text-brand-700 hover:underline">
                            {formatWoNumber(r.number)}
                          </Link>
                        </Td>
                        <Td className="max-w-xs">
                          <Link href={`/work-orders/${r.id}`} className="font-medium text-slate-900 hover:underline">
                            {r.title}
                          </Link>
                          <div className="truncate text-xs text-slate-500">{[r.assetName, r.locationText].filter(Boolean).join(" · ") || "—"}</div>
                        </Td>
                        <Td className="whitespace-nowrap">{r.siteName}</Td>
                        <Td className="whitespace-nowrap">{r.categoryName ?? "—"}</Td>
                        <Td>
                          <PriorityBadge priority={r.priority} />
                        </Td>
                        <Td>
                          <div className="flex flex-col items-start gap-1">
                            <StatusBadge status={r.status} />
                            {r.reworkCount > 0 && <span className="text-xs text-red-700">Rework ×{r.reworkCount}</span>}
                          </div>
                        </Td>
                        <Td className="whitespace-nowrap">
                          {r.assigneeName ?? <span className="text-slate-400">Unassigned</span>}
                          {r.contractorName && <div className="text-xs text-slate-500">{r.contractorName}</div>}
                        </Td>
                        <Td className="whitespace-nowrap text-xs">
                          <span className={overdue ? "font-semibold text-red-700" : ""}>{formatDateTime(r.dueAt, r.siteTimezone)}</span>
                          {overdue && (
                            <div>
                              <Badge tone="red">Overdue</Badge>
                            </div>
                          )}
                        </Td>
                        <Td className="whitespace-nowrap text-xs text-slate-500">{formatDateTime(r.createdAt, r.siteTimezone, { withZone: false })}</Td>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            </div>
            <ul className="divide-y divide-slate-100 md:hidden">
              {data.rows.map((r) => (
                <li key={r.id}>
                  <Link href={`/work-orders/${r.id}`} className="block px-4 py-3 hover:bg-slate-50">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-xs font-semibold text-brand-700">{formatWoNumber(r.number)}</span>
                      <StatusBadge status={r.status} />
                    </div>
                    <p className="mt-1 font-medium text-slate-900">{r.title}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <PriorityBadge priority={r.priority} />
                      <span>{r.siteName}</span>
                      {isOverdue(r) && <Badge tone="red">Overdue</Badge>}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
            <Pagination page={data.page} pageSize={data.pageSize} total={data.total} hrefFor={(p) => `/work-orders${qs(params, { page: p })}`} />
          </>
        )}
      </Card>
    </>
  );
}

/** Drop malformed ID filters (e.g. hand-edited URLs) instead of erroring. */
function sanitize(f: WorkOrderFilters): WorkOrderFilters {
  const uuid = /^[0-9a-f-]{36}$/i;
  return {
    ...f,
    siteId: f.siteId && uuid.test(f.siteId) ? f.siteId : undefined,
    contractorId: f.contractorId && uuid.test(f.contractorId) ? f.contractorId : undefined,
    categoryId: f.categoryId && uuid.test(f.categoryId) ? f.categoryId : undefined,
    page: Number.isFinite(f.page) ? f.page : 1,
  };
}
