import Link from "next/link";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { tenants } from "@/db/schema";
import { can } from "@/lib/auth/context";
import { requireContext } from "@/lib/auth/session";
import { ROLE_LABELS } from "@/lib/authz/permissions";
import { one, requirePagePerm, type SearchParams } from "@/lib/page";
import { formatDateTime } from "@/lib/time";
import { aiStatus } from "@/domain/ai/provider";
import { listAuditLog, listMembers, listSlaPolicies } from "@/domain/settings/service";
import { categoryOptions, contractorOptions } from "@/domain/people/service";
import { siteOptions } from "@/domain/sites/service";
import { Badge, Card, cn, ComingLater, Notice, PageHeader, Pagination, Table, Td, Th } from "@/components/ui";
import { CategoryForm, InviteForm, MemberEditor, ProfileForm, SlaForm, WorkflowForm } from "./forms";

export const metadata = { title: "Settings" };

const TABS = [
  ["workspace", "Workspace"],
  ["users", "Users & roles"],
  ["workflow", "Workflow"],
  ["categories", "Categories"],
  ["sla", "SLA presets"],
  ["notifications", "Notifications"],
  ["audit", "Audit log"],
  ["ai", "AI"],
  ["demo", "Demo data"],
] as const;

export default async function SettingsPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requireContext();
  requirePagePerm(ctx, "settings.manage", "audit.view");
  const sp = await searchParams;
  const admin = can(ctx, "settings.manage");
  const tabs = admin ? TABS : TABS.filter(([k]) => k === "audit");
  const tab = tabs.find(([k]) => k === one(sp.tab))?.[0] ?? tabs[0][0];
  const db = getDb();

  return (
    <>
      <PageHeader title="Settings" description={admin ? "Workspace configuration, access control and audit history." : "Audit history (read-only)."} />
      <div className="grid gap-4 lg:grid-cols-5">
        <nav aria-label="Settings sections" className="lg:col-span-1">
          <ul className="flex gap-1 overflow-x-auto lg:flex-col">
            {tabs.map(([k, label]) => (
              <li key={k}>
                <Link href={`/settings?tab=${k}`} aria-current={tab === k ? "page" : undefined} className={cn("block whitespace-nowrap rounded-md px-3 py-2 text-sm", tab === k ? "bg-white font-medium text-slate-900 shadow-xs ring-1 ring-slate-200" : "text-slate-600 hover:bg-white")}>
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="space-y-4 lg:col-span-4">{await renderTab(tab, ctx, db, Number(one(sp.page) ?? 1))}</div>
      </div>
    </>
  );
}

async function renderTab(tab: string, ctx: Awaited<ReturnType<typeof requireContext>>, db: ReturnType<typeof getDb>, page: number) {
  switch (tab) {
    case "workspace": {
      const [t] = await db.select().from(tenants).where(eq(tenants.id, ctx.tenantId));
      return (
        <Card title="Workspace profile">
          <ProfileForm values={t} />
        </Card>
      );
    }
    case "users": {
      const [members, sites, contractors] = await Promise.all([listMembers(db, ctx), siteOptions(db, ctx), contractorOptions(db, ctx)]);
      const siteName = new Map(sites.map((s) => [s.id, s.name]));
      return (
        <>
          <Card title="Add a user">
            <InviteForm sites={sites} contractors={contractors} />
          </Card>
          <Card title={`Members (${members.length})`} bodyClassName="p-0">
            <Table>
              <thead className="bg-slate-50">
                <tr>
                  <Th>User</Th>
                  <Th>Role</Th>
                  <Th>Site access</Th>
                  <Th>Last sign-in</Th>
                  <Th>Actions</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {members.map((m) => (
                  <tr key={m.membershipId}>
                    <Td>
                      <div className="font-medium text-slate-900">{m.name}</div>
                      <div className="text-xs text-slate-500">{m.email}</div>
                      {m.googleLinked && <Badge tone="blue" className="mt-1">Google sign-in linked</Badge>}
                    </Td>
                    <Td>
                      {ROLE_LABELS[m.role]}
                      {m.canApprove && m.role === "supervisor" && <div className="text-xs text-slate-500">+ can approve</div>}
                      {m.contractorName && <div className="text-xs text-slate-500">{m.contractorName}</div>}
                      {m.status !== "active" && <Badge tone="red">Disabled</Badge>}
                    </Td>
                    <Td className="max-w-56 text-xs">{m.allSites || m.role === "tenant_admin" ? "All sites" : m.siteIds.map((id) => siteName.get(id)).filter(Boolean).join(", ") || <span className="text-red-700">No sites</span>}</Td>
                    <Td className="whitespace-nowrap text-xs">{formatDateTime(m.lastLoginAt, ctx.tenantTimezone, { withZone: false })}</Td>
                    <Td>
                      <MemberEditor member={m} sites={sites} contractors={contractors} self={m.userId === ctx.userId} />
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>
          <p className="text-xs text-slate-500">Role and access changes are recorded in the audit log. Users cannot change their own role or disable themselves.</p>
        </>
      );
    }
    case "workflow":
      return (
        <Card title="Workflow configuration">
          <WorkflowForm values={ctx.tenantSettings} />
          <div className="mt-4 rounded-md bg-slate-50 p-3 text-xs text-slate-600">
            Status flow: New → Triaged → Assigned → In progress → Ready for inspection → Pending approval → Approved → Closed. Inspection or client rejection returns work to Rework required → In progress. Transitions are enforced on the server.
          </div>
        </Card>
      );
    case "categories": {
      const cats = await categoryOptions(db, ctx);
      return (
        <Card title="Work-order categories">
          <div className="space-y-3">
            {cats.map((c) => (
              <CategoryForm key={c.id} values={c} />
            ))}
            <div className="border-t border-slate-100 pt-3">
              <p className="mb-2 text-sm font-medium text-slate-700">Add category</p>
              <CategoryForm />
            </div>
          </div>
          <p className="mt-3 text-xs text-slate-500">A required credential is matched by name against the assignee&apos;s compliance records (must be verified and not expired).</p>
        </Card>
      );
    }
    case "sla": {
      const sla = await listSlaPolicies(db, ctx);
      const all = (["critical", "high", "medium", "low"] as const).map((p) => sla.find((s) => s.priority === p) ?? { priority: p, responseHours: 24, resolutionHours: 72 });
      return (
        <Card title="SLA presets">
          <p className="mb-3 text-sm text-slate-600">New work orders get a due time of creation + resolution hours for their priority, unless a manager sets one.</p>
          <div className="space-y-3">
            {all.map((s) => (
              <SlaForm key={s.priority} values={s} />
            ))}
          </div>
        </Card>
      );
    }
    case "notifications":
      return (
        <Card title="Notification preferences">
          <p className="mb-3 text-sm text-slate-600">In-app notifications are sent for assignments, inspection and approval requests, rework, approvals and compliance expiry (30 days and expired).</p>
          <ComingLater>Email notifications and per-user preferences.</ComingLater>
        </Card>
      );
    case "audit": {
      const log = await listAuditLog(db, ctx, { page });
      return (
        <Card title="Audit log" bodyClassName="p-0">
          <Table>
            <thead className="bg-slate-50">
              <tr>
                <Th>When</Th>
                <Th>Actor</Th>
                <Th>Action</Th>
                <Th>Details</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {log.rows.map((r) => (
                <tr key={r.id}>
                  <Td className="whitespace-nowrap text-xs">{formatDateTime(r.createdAt, ctx.tenantTimezone)}</Td>
                  <Td>{r.actorName ?? "System"}</Td>
                  <Td>
                    <code className="text-xs">{r.action}</code>
                  </Td>
                  <Td className="max-w-md truncate font-mono text-xs text-slate-500" title={JSON.stringify(r.data)}>
                    {Object.keys(r.data).length ? JSON.stringify(r.data) : "—"}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
          <Pagination page={log.page} pageSize={log.pageSize} total={log.total} hrefFor={(p) => `/settings?tab=audit&page=${p}`} />
          <p className="px-3 pb-3 text-xs text-slate-500">Work-order status changes, assignments and approvals are also recorded in each work order&apos;s timeline.</p>
        </Card>
      );
    }
    case "ai": {
      const s = aiStatus();
      return (
        <Card title="AI configuration">
          {s.configured ? <Notice tone="success" title="AI provider configured">Provider: {s.provider} · Model: {s.model}. The API key is stored on the server and never shown.</Notice> : <Notice tone="warn" title="AI provider not configured">The Copilot runs in deterministic demo mode. Set AI_PROVIDER, AI_API_KEY and optionally AI_MODEL in the server environment, then restart.</Notice>}
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-600">
            <li>AI runs server-side and can only call approved, read-only tools scoped to the signed-in user&apos;s permissions.</li>
            <li>The Copilot cannot create or change records; drafted work orders require review and confirmation.</li>
            <li>Only usage metadata is logged (feature, latency, success, tools used) — not prompt or answer text.</li>
          </ul>
        </Card>
      );
    }
    case "demo":
      return (
        <Card title="Demo data">
          <p className="text-sm text-slate-600">
            {ctx.isDemoTenant ? "This is a demo workspace with fictional data." : "This workspace is not a demo workspace."} To reset demo data on a development or demo server, run:
          </p>
          <pre className="mt-2 overflow-x-auto rounded-md bg-slate-900 p-3 text-xs text-slate-100">npm run db:reset</pre>
          <p className="mt-2 text-xs text-slate-500">The reset only deletes workspaces flagged as demo and users with .demo email addresses. It refuses to run with NODE_ENV=production unless ALLOW_DEMO_SEED=true.</p>
        </Card>
      );
  }
  return null;
}
