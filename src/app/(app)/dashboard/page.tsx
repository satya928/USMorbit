import Link from "next/link";
import { AlertTriangle, CheckCircle2, Clock, Flame, ShieldAlert, Stamp } from "lucide-react";
import { getDb } from "@/db";
import { WORK_ORDER_STATUSES, STATUS_LABELS, OPEN_STATUSES } from "@/domain/work-orders/state";
import { getDashboard, defaultPeriod } from "@/domain/metrics/service";
import { syncComplianceAlerts } from "@/domain/compliance/service";
import { siteOptions } from "@/domain/sites/service";
import { daysUntil } from "@/domain/compliance/status";
import { formatWoNumber } from "@/domain/work-orders/service";
import { can } from "@/lib/auth/context";
import { requireContext } from "@/lib/auth/session";
import { one, requirePagePerm, type SearchParams } from "@/lib/page";
import { addDays, formatDate, parseDateParam, relativeTime } from "@/lib/time";
import { HBarChart, TrendChart } from "@/components/charts";
import { Card, EmptyState, KpiCard, LinkButton, PageHeader, pct, Table, Td, Th } from "@/components/ui";
import type { Priority, WorkOrderStatus } from "@/db/schema";

export const metadata = { title: "Command Center" };

const EVENT_LABEL: Record<string, string> = {
  created: "created",
  assigned: "assigned",
  reassigned: "reassigned",
  updated: "updated",
  "evidence.added": "added evidence to",
  "checklist.completed": "completed a checklist item on",
  "checklist.reopened": "reopened a checklist item on",
  "checklist.added": "added a checklist item to",
};
const describe = (type: string, to?: string | null) =>
  EVENT_LABEL[type] ?? (to ? `moved to ${STATUS_LABELS[to as WorkOrderStatus].toLowerCase()}` : type.replace(/[._]/g, " "));

export default async function DashboardPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requireContext();
  requirePagePerm(ctx, "wo.view");
  const sp = await searchParams;
  const db = getDb();

  const preset = one(sp.range) ?? "30";
  const def = defaultPeriod();
  let from = addDays(def.to, -Number(["7", "30", "90"].includes(preset) ? preset : 30));
  let to = def.to;
  if (preset === "custom") {
    from = parseDateParam(one(sp.from)) ?? addDays(def.to, -30);
    to = parseDateParam(one(sp.to)) ? addDays(parseDateParam(one(sp.to))!, 1) : def.to;
  }
  const status = WORK_ORDER_STATUSES.includes(one(sp.status) as WorkOrderStatus) ? (one(sp.status) as WorkOrderStatus) : undefined;
  const priority = ["low", "medium", "high", "critical"].includes(one(sp.priority) ?? "") ? (one(sp.priority) as Priority) : undefined;
  const sites = await siteOptions(db, ctx);
  const siteId = sites.some((s) => s.id === one(sp.site)) ? one(sp.site) : undefined;

  if (can(ctx, "compliance.manage")) await syncComplianceAlerts(db, ctx.tenantId);
  const d = await getDashboard(db, ctx, { from, to, siteId, status, priority });
  const k = d.kpi;
  const sla = k.sla;
  const filtersActive = !!(siteId || status || priority);
  const woLink = (extra: Record<string, string>) => `/work-orders?${new URLSearchParams({ ...(siteId ? { site: siteId } : {}), ...(priority ? { priority } : {}), ...extra })}`;

  const statusData = WORK_ORDER_STATUSES.filter((s) => s !== "cancelled").map((s) => ({ label: STATUS_LABELS[s], value: d.byStatus.find((r) => r.status === s)?.count ?? 0 }));
  const priorityData = (["critical", "high", "medium", "low"] as const).map((p) => ({ label: p[0].toUpperCase() + p.slice(1), value: d.byPriority.find((r) => r.priority === p)?.count ?? 0 }));
  const days = Math.round((to.getTime() - from.getTime()) / 86_400_000);
  const trendData = Array.from({ length: days }, (_, i) => {
    const day = addDays(from, i).toISOString().slice(0, 10);
    return { label: formatDate(day).slice(0, 6), value: d.trend.find((t) => t.day === day)?.created ?? 0 };
  });

  return (
    <>
      <PageHeader
        title="Command Center"
        description={`Live operations for ${ctx.tenantName}${siteId ? ` · ${sites.find((s) => s.id === siteId)?.name}` : ""}`}
        actions={
          <>
            {can(ctx, "wo.create") && <LinkButton href="/work-orders/new">Create request</LinkButton>}
            {can(ctx, "inspection.run") && (
              <LinkButton href="/inspections/new" variant="secondary">
                Start inspection
              </LinkButton>
            )}
            {can(ctx, "site.manage") && (
              <LinkButton href="/sites/new" variant="secondary">
                Add site
              </LinkButton>
            )}
          </>
        }
      />

      <form className="mb-6 flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-white p-3" aria-label="Dashboard filters">
        <div>
          <label className="label text-xs" htmlFor="range">
            Period
          </label>
          <select id="range" name="range" defaultValue={preset} className="input py-1.5">
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
            <option value="custom">Custom range</option>
          </select>
        </div>
        <div>
          <label className="label text-xs" htmlFor="from">
            From
          </label>
          <input id="from" type="date" name="from" defaultValue={one(sp.from) ?? from.toISOString().slice(0, 10)} className="input py-1.5" />
        </div>
        <div>
          <label className="label text-xs" htmlFor="to">
            To
          </label>
          <input id="to" type="date" name="to" defaultValue={one(sp.to) ?? addDays(to, -1).toISOString().slice(0, 10)} className="input py-1.5" />
        </div>
        <div>
          <label className="label text-xs" htmlFor="site">
            Site
          </label>
          <select id="site" name="site" defaultValue={siteId ?? ""} className="input py-1.5">
            <option value="">All sites</option>
            {sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label text-xs" htmlFor="status">
            Status
          </label>
          <select id="status" name="status" defaultValue={status ?? ""} className="input py-1.5">
            <option value="">Any status</option>
            {WORK_ORDER_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label text-xs" htmlFor="priority">
            Priority
          </label>
          <select id="priority" name="priority" defaultValue={priority ?? ""} className="input py-1.5">
            <option value="">Any priority</option>
            {["critical", "high", "medium", "low"].map((p) => (
              <option key={p} value={p}>
                {p[0].toUpperCase() + p.slice(1)}
              </option>
            ))}
          </select>
        </div>
        <button className="rounded-md bg-navy-800 px-3 py-2 text-sm font-medium text-white hover:bg-navy-700">Apply</button>
        {(filtersActive || preset !== "30") && (
          <Link href="/dashboard" className="py-2 text-sm text-slate-600 hover:underline">
            Reset
          </Link>
        )}
        <p className="w-full text-xs text-slate-500">
          Period applies to SLA, rework and created-work charts. Counts of open, overdue and pending work are as of now. Custom “To” date is inclusive.
        </p>
      </form>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <KpiCard label="Open work orders" value={k.open} icon={<Clock className="size-4" />} href={woLink({ open: "1" })} hint="Not approved, closed or cancelled" />
        <KpiCard label="Overdue" value={k.overdue} tone={k.overdue ? "bad" : "good"} icon={<AlertTriangle className="size-4" />} href={woLink({ overdue: "1" })} hint="Open and past due time" />
        <KpiCard label="Critical / high" value={k.urgent} tone={k.urgent ? "warn" : "default"} icon={<Flame className="size-4" />} href={woLink({ open: "1", priority: priority ?? "high" })} hint="Open, high or critical" />
        <KpiCard label="Awaiting approval" value={k.awaitingApproval} icon={<Stamp className="size-4" />} href={woLink({ status: "pending_approval" })} hint="Pending client sign-off" />
        <KpiCard
          label="SLA compliance"
          value={pct(sla.rate)}
          tone={sla.rate === null ? "default" : sla.rate >= 0.9 ? "good" : sla.rate >= 0.75 ? "warn" : "bad"}
          icon={<CheckCircle2 className="size-4" />}
          hint={sla.eligible ? `${sla.met} of ${sla.eligible} completed on time` : "No completed work in period"}
        />
        {k.expiringCompliance !== null ? (
          <KpiCard label="Compliance expiring" value={k.expiringCompliance} tone={k.expiringCompliance ? "warn" : "good"} icon={<ShieldAlert className="size-4" />} href="/compliance?view=expiring30" hint="Next 30 days" />
        ) : (
          <KpiCard label="Rework rate" value={pct(d.rework.reworkRate)} hint={`${d.rework.returns} returns / ${d.rework.submissions} submissions`} />
        )}
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Card title="Work created in period" className="lg:col-span-2" actions={<span className="text-xs text-slate-500">{trendData.reduce((a, b) => a + b.value, 0)} total</span>}>
          <TrendChart data={trendData} unit="created" />
        </Card>
        <Card title="Quality">
          <dl className="space-y-4">
            <div>
              <dt className="text-xs text-slate-500">Rework rate</dt>
              <dd className="text-2xl font-semibold tabular-nums">{pct(d.rework.reworkRate)}</dd>
              <dd className="text-xs text-slate-500">
                {d.rework.returns} returned of {d.rework.submissions} submitted for inspection
              </dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">First-time completion</dt>
              <dd className="text-2xl font-semibold tabular-nums">{pct(d.rework.firstTimeCompletion)}</dd>
              <dd className="text-xs text-slate-500">of {d.rework.approved} approved without rework</dd>
            </div>
          </dl>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title="Work orders by status" actions={<span className="text-xs text-slate-500">Created in period</span>}>
          {statusData.some((s) => s.value) ? <HBarChart data={statusData} unit="work orders" /> : <EmptyState title="No work created in this period" />}
          <ChartTable rows={statusData} label="Status" />
        </Card>
        <Card title="Open work by priority">
          {priorityData.some((s) => s.value) ? <HBarChart data={priorityData} unit="open work orders" /> : <EmptyState title="No open work" description="Everything is completed." />}
          <ChartTable rows={priorityData} label="Priority" />
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card title="Site performance" className="lg:col-span-2" bodyClassName="p-0">
          {d.sitePerf.length ? (
            <Table>
              <thead className="bg-slate-50">
                <tr>
                  <Th>Site</Th>
                  <Th className="text-right">Open</Th>
                  <Th className="text-right">Overdue</Th>
                  <Th className="text-right">SLA</Th>
                  <Th className="text-right">Avg inspection</Th>
                  <Th className="text-right">Failed insp.</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {d.sitePerf.map((s) => (
                  <tr key={s.siteId} className="hover:bg-slate-50">
                    <Td>
                      <Link href={`/sites/${s.siteId}`} className="font-medium text-slate-900 hover:underline">
                        {s.siteName}
                      </Link>
                      <div className="text-xs text-slate-500">{s.code}</div>
                    </Td>
                    <Td className="text-right tabular-nums">{s.open}</Td>
                    <Td className={`text-right tabular-nums ${s.overdue ? "font-semibold text-red-700" : ""}`}>{s.overdue}</Td>
                    <Td className="text-right tabular-nums">{pct(s.slaRate)}</Td>
                    <Td className="text-right tabular-nums">{s.avgInspectionScore === null ? "—" : `${s.avgInspectionScore}%`}</Td>
                    <Td className="text-right tabular-nums">{s.failedInspections}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          ) : (
            <EmptyState title="No sites in scope" />
          )}
        </Card>
        {d.showCompliance ? (
          <Card title="Upcoming compliance expirations" actions={<Link href="/compliance?view=expiring30" className="text-xs font-medium text-brand-600 hover:underline">View all</Link>}>
            {d.upcomingCompliance.length ? (
              <ul className="divide-y divide-slate-100">
                {d.upcomingCompliance.map((c) => {
                  const days = daysUntil(c.expiryDate)!;
                  return (
                    <li key={c.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                      <Link href={`/compliance/${c.id}`} className="min-w-0 truncate text-slate-800 hover:underline">
                        {c.name}
                      </Link>
                      <span className={`shrink-0 text-xs font-medium ${days < 0 ? "text-red-700" : "text-amber-700"}`}>{days < 0 ? `Expired ${-days}d ago` : `${days}d left`}</span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <EmptyState title="Nothing expiring in 30 days" />
            )}
          </Card>
        ) : null}
      </div>

      <Card title="Recent activity" className="mt-4">
        {d.activity.length ? (
          <ol className="divide-y divide-slate-100">
            {d.activity.map((a) => (
              <li key={a.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2 text-sm">
                <span className="min-w-0">
                  <span className="font-medium text-slate-900">{a.actorName ?? "System"}</span> <span className="text-slate-600">{describe(a.type, a.toStatus)}</span>{" "}
                  <Link href={`/work-orders/${a.workOrderId}`} className="font-medium text-brand-700 hover:underline">
                    {formatWoNumber(a.number)}
                  </Link>{" "}
                  <span className="text-slate-600">{a.title}</span>
                </span>
                <time className="text-xs text-slate-500" dateTime={a.createdAt.toISOString()}>
                  {relativeTime(a.createdAt)}
                </time>
              </li>
            ))}
          </ol>
        ) : (
          <EmptyState title="No activity yet" description="Activity appears here as work is created and updated." action={can(ctx, "wo.create") ? <LinkButton href="/work-orders/new">Create a request</LinkButton> : undefined} />
        )}
      </Card>
      <p className="mt-4 text-xs text-slate-500">
        Open = {OPEN_STATUSES.length} active statuses. SLA compliance = approved/closed work with a due time, completed in the period, finished on or before due. All values are calculated from your records.
      </p>
    </>
  );
}

function ChartTable({ rows, label }: { rows: { label: string; value: number }[]; label: string }) {
  return (
    <details className="mt-2 text-xs text-slate-600">
      <summary className="cursor-pointer select-none text-slate-500 hover:text-slate-800">View as table</summary>
      <table className="mt-2 w-full">
        <thead>
          <tr className="text-left text-slate-500">
            <th className="py-1 font-medium">{label}</th>
            <th className="py-1 text-right font-medium">Count</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} className="border-t border-slate-100">
              <td className="py-1">{r.label}</td>
              <td className="py-1 text-right tabular-nums">{r.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}
