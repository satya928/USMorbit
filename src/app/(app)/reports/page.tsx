import Link from "next/link";
import { Download } from "lucide-react";
import { getDb } from "@/db";
import { can } from "@/lib/auth/context";
import { requireContext } from "@/lib/auth/session";
import { one, requirePagePerm, type SearchParams } from "@/lib/page";
import { parseReportFilters } from "@/lib/report-filters";
import { addDays } from "@/lib/time";
import { isReportKey, REPORTS, runReport, type ReportKey } from "@/domain/reports/service";
import { siteOptions } from "@/domain/sites/service";
import { STATUS_LABELS, WORK_ORDER_STATUSES } from "@/domain/work-orders/state";
import { buttonClass, Card, cn, EmptyState, Notice, PageHeader, Table, Td, Th } from "@/components/ui";

export const metadata = { title: "Reports" };

export default async function ReportsPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requireContext();
  requirePagePerm(ctx, "report.view");
  const sp = await searchParams;
  const db = getDb();
  const sites = await siteOptions(db, ctx);
  const keys = (Object.keys(REPORTS) as ReportKey[]).filter((k) => k !== "compliance" || can(ctx, "compliance.view")).filter((k) => k !== "contractors" || can(ctx, "contractor.view"));
  const key: ReportKey = isReportKey(one(sp.report) ?? "") && keys.includes(one(sp.report) as ReportKey) ? (one(sp.report) as ReportKey) : "work-orders";
  const f = parseReportFilters((k) => one(sp[k]), sites.map((s) => s.id));
  const result = await runReport(db, ctx, key, f);
  const generatedAt = new Date();
  const toInclusive = addDays(f.to, -1).toISOString().slice(0, 10);
  const query = new URLSearchParams({
    from: f.from.toISOString().slice(0, 10),
    to: toInclusive,
    ...(f.siteId ? { site: f.siteId } : {}),
    ...(f.status ? { status: f.status } : {}),
    ...(f.priority ? { priority: f.priority } : {}),
    ...(f.groupBy ? { groupBy: f.groupBy } : {}),
  });
  const showWoFilters = ["work-orders", "overdue", "breakdown", "approvals", "sla"].includes(key);

  return (
    <>
      <PageHeader title="Reports" description="Operational reports computed from your records. Export any report to CSV with its filters and generation time." />
      <div className="grid gap-4 lg:grid-cols-4">
        <nav aria-label="Reports" className="lg:col-span-1">
          <ul className="space-y-1">
            {keys.map((k) => (
              <li key={k}>
                <Link
                  href={`/reports?report=${k}&${query}`}
                  aria-current={k === key ? "page" : undefined}
                  className={cn("block rounded-md px-3 py-2 text-sm", k === key ? "bg-white font-medium text-slate-900 shadow-xs ring-1 ring-slate-200" : "text-slate-600 hover:bg-white")}
                >
                  {REPORTS[k].title}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="space-y-4 lg:col-span-3">
          <form className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-white p-3" aria-label="Report filters">
            <input type="hidden" name="report" value={key} />
            <div>
              <label className="label text-xs" htmlFor="rf-from">From</label>
              <input id="rf-from" type="date" name="from" defaultValue={f.from.toISOString().slice(0, 10)} className="input py-1.5" />
            </div>
            <div>
              <label className="label text-xs" htmlFor="rf-to">To (inclusive)</label>
              <input id="rf-to" type="date" name="to" defaultValue={toInclusive} className="input py-1.5" />
            </div>
            <div>
              <label className="label text-xs" htmlFor="rf-site">Site</label>
              <select id="rf-site" name="site" defaultValue={f.siteId ?? ""} className="input py-1.5">
                <option value="">All sites</option>
                {sites.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            {showWoFilters && (
              <>
                <div>
                  <label className="label text-xs" htmlFor="rf-status">Status</label>
                  <select id="rf-status" name="status" defaultValue={f.status ?? ""} className="input py-1.5">
                    <option value="">Any</option>
                    {WORK_ORDER_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {STATUS_LABELS[s]}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label text-xs" htmlFor="rf-priority">Priority</label>
                  <select id="rf-priority" name="priority" defaultValue={f.priority ?? ""} className="input py-1.5">
                    <option value="">Any</option>
                    {["critical", "high", "medium", "low"].map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            )}
            {key === "breakdown" && (
              <div>
                <label className="label text-xs" htmlFor="rf-group">Group by</label>
                <select id="rf-group" name="groupBy" defaultValue={f.groupBy ?? "site"} className="input py-1.5">
                  <option value="site">Site</option>
                  <option value="category">Category</option>
                  <option value="priority">Priority</option>
                  <option value="status">Status</option>
                </select>
              </div>
            )}
            <button className="rounded-md bg-navy-800 px-3 py-2 text-sm font-medium text-white hover:bg-navy-700">Run report</button>
          </form>

          <Card
            title={REPORTS[key].title}
            actions={
              can(ctx, "report.export") && (
                <a href={`/api/reports/${key}?${query}`} className={buttonClass("secondary", "sm")}>
                  <Download className="size-4" aria-hidden /> Export CSV
                </a>
              )
            }
            bodyClassName="p-0"
          >
            <div className="border-b border-slate-100 px-4 py-2 text-xs text-slate-500">
              {REPORTS[key].description} · {result.rows.length} row(s) · generated {generatedAt.toISOString().replace("T", " ").slice(0, 16)} UTC
            </div>
            {result.note && (
              <div className="px-4 pt-3">
                <Notice tone="info">{result.note}</Notice>
              </div>
            )}
            {result.rows.length ? (
              <Table>
                <thead className="bg-slate-50">
                  <tr>
                    {result.columns.map((c) => (
                      <Th key={c.key} className={c.numeric ? "text-right" : undefined}>
                        {c.label}
                      </Th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {result.rows.slice(0, 500).map((r, i) => (
                    <tr key={i} className="hover:bg-slate-50">
                      {result.columns.map((c) => (
                        <Td key={c.key} className={cn("whitespace-nowrap", c.numeric && "text-right tabular-nums")}>
                          {r[c.key] ?? "—"}
                        </Td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </Table>
            ) : (
              <EmptyState title="No data for these filters" description="Widen the date range or clear the site filter." />
            )}
          </Card>
          <p className="text-xs text-slate-500">Reports are operational summaries, not certified financial or regulatory reports. Times are shown in each site&apos;s local time zone.</p>
        </div>
      </div>
    </>
  );
}
