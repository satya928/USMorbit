import Link from "next/link";
import { and, eq, isNull, sql } from "drizzle-orm";
import { Bell, LogOut, MessageSquarePlus, Search } from "lucide-react";
import { getDb } from "@/db";
import { notifications, workOrders } from "@/db/schema";
import { can } from "@/lib/auth/context";
import { listUserTenants, requireContext } from "@/lib/auth/session";
import { ROLE_LABELS } from "@/lib/authz/permissions";
import { workOrderScope } from "@/domain/shared";
import { MobileNav, Sidebar, type NavItem } from "@/components/nav";
import { signOutAction, switchTenantAction } from "../auth-actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireContext();
  const db = getDb();
  const [[{ unread }], [{ pending }], tenantsList] = await Promise.all([
    db.select({ unread: sql<number>`count(*)::int` }).from(notifications).where(and(eq(notifications.tenantId, ctx.tenantId), eq(notifications.userId, ctx.userId), isNull(notifications.readAt))),
    can(ctx, "wo.approve")
      ? db.select({ pending: sql<number>`count(*)::int` }).from(workOrders).where(and(workOrderScope(ctx), eq(workOrders.status, "pending_approval")))
      : Promise.resolve([{ pending: 0 }]),
    listUserTenants(ctx.userId),
  ]);

  // Optional link to a feedback form (e.g. a Google Form) for beta testers; only http(s) URLs are shown.
  const feedbackUrl = /^https?:\/\//.test(process.env.FEEDBACK_URL ?? "") ? process.env.FEEDBACK_URL : undefined;

  const items: NavItem[] = [
    { href: "/dashboard", label: "Command Center", icon: "LayoutDashboard" as const, show: can(ctx, "wo.view") },
    { href: "/work-orders", label: "Work Orders", icon: "ClipboardList" as const, show: can(ctx, "wo.view") },
    { href: "/sites", label: "Sites", icon: "Building2" as const, show: can(ctx, "site.view") },
    { href: "/assets", label: "Assets", icon: "Boxes" as const, show: can(ctx, "asset.view") },
    { href: "/people", label: "People & Contractors", icon: "Users" as const, show: can(ctx, "people.view") || can(ctx, "contractor.view") },
    { href: "/compliance", label: "Compliance", icon: "ShieldCheck" as const, show: can(ctx, "compliance.view") },
    { href: "/inspections", label: "Inspections", icon: "ClipboardCheck" as const, show: can(ctx, "inspection.view") },
    { href: "/approvals", label: "Approvals", icon: "Stamp" as const, show: can(ctx, "wo.approve") || can(ctx, "wo.inspect"), badge: pending },
    { href: "/reports", label: "Reports", icon: "BarChart3" as const, show: can(ctx, "report.view") },
    { href: "/copilot", label: "AI Copilot", icon: "Bot" as const, show: can(ctx, "ai.use") },
    { href: "/settings", label: "Settings", icon: "Settings" as const, show: can(ctx, "settings.manage") || can(ctx, "audit.view") },
  ]
    .filter((i) => i.show)
    .map((i) => ({ href: i.href, label: i.label, icon: i.icon, badge: i.badge }));

  return (
    <div className="flex min-h-screen">
      <Sidebar items={items} footer={<span>Beta · {ctx.tenantName}</span>} />
      <div className="flex min-w-0 flex-1 flex-col">
        {ctx.isDemoTenant && (
          <div className="bg-accent-600 px-4 py-1 text-center text-xs font-medium text-white">Demo workspace — all companies, people and records are fictional.</div>
        )}
        <header className="sticky top-0 z-30 flex items-center gap-2 border-b border-slate-200 bg-white/95 px-3 py-2 backdrop-blur sm:px-6">
          <MobileNav items={items} />
          <form action="/search" className="relative max-w-md flex-1" role="search">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
            <label htmlFor="global-search" className="sr-only">
              Search
            </label>
            <input id="global-search" name="q" type="search" placeholder="Search work orders, sites, assets…" className="input py-1.5 pl-8" />
          </form>
          <div className="ml-auto flex items-center gap-1 sm:gap-2">
            {tenantsList.length > 1 && (
              <form action={switchTenantAction} className="hidden sm:block">
                <label htmlFor="tenant-switch" className="sr-only">
                  Workspace
                </label>
                <select id="tenant-switch" name="tenantId" defaultValue={ctx.tenantId} className="input py-1.5 text-xs" aria-label="Switch workspace">
                  {tenantsList.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
                <noscript>
                  <button type="submit">Switch</button>
                </noscript>
                <SubmitOnChange id="tenant-switch" />
              </form>
            )}
            {feedbackUrl && (
              <a href={feedbackUrl} target="_blank" rel="noopener noreferrer" className="hidden items-center gap-1.5 rounded-md border border-accent-500/40 bg-accent-50 px-2.5 py-1.5 text-xs font-medium text-accent-700 hover:bg-accent-100 sm:inline-flex">
                <MessageSquarePlus className="size-4" aria-hidden /> Beta feedback
              </a>
            )}
            <Link href="/notifications" className="relative rounded-md p-2 text-slate-600 hover:bg-slate-100" aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}>
              <Bell className="size-5" />
              {unread > 0 && <span className="absolute right-1 top-1 grid min-w-4 place-items-center rounded-full bg-red-600 px-1 text-[10px] font-semibold text-white">{unread > 99 ? "99+" : unread}</span>}
            </Link>
            <details className="relative">
              <summary className="flex cursor-pointer list-none items-center gap-2 rounded-md px-2 py-1 hover:bg-slate-100">
                <span className="grid size-8 place-items-center rounded-full bg-navy-700 text-xs font-semibold text-white" aria-hidden>
                  {ctx.userName
                    .split(" ")
                    .map((n) => n[0])
                    .slice(0, 2)
                    .join("")}
                </span>
                <span className="hidden text-left leading-tight md:block">
                  <span className="block text-sm font-medium text-slate-900">{ctx.userName}</span>
                  <span className="block text-xs text-slate-500">{ROLE_LABELS[ctx.role]}</span>
                </span>
              </summary>
              <div className="absolute right-0 z-40 mt-1 w-64 rounded-md border border-slate-200 bg-white p-1 shadow-lg">
                <div className="px-3 py-2 text-xs text-slate-500">
                  <div className="font-medium text-slate-900">{ctx.userEmail}</div>
                  <div>
                    {ROLE_LABELS[ctx.role]} · {ctx.tenantName}
                  </div>
                </div>
                {tenantsList.length > 1 && (
                  <form action={switchTenantAction} className="border-t border-slate-100 px-1 py-1 sm:hidden">
                    {tenantsList
                      .filter((t) => t.id !== ctx.tenantId)
                      .map((t) => (
                        <button key={t.id} name="tenantId" value={t.id} className="block w-full rounded px-2 py-1.5 text-left text-sm hover:bg-slate-50">
                          Switch to {t.name}
                        </button>
                      ))}
                  </form>
                )}
                {feedbackUrl && (
                  <a href={feedbackUrl} target="_blank" rel="noopener noreferrer" className="block rounded px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 sm:hidden">
                    Beta feedback
                  </a>
                )}
                <Link href="/change-password" className="block rounded px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
                  Change password
                </Link>
                <form action={signOutAction}>
                  <button className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50">
                    <LogOut className="size-4" aria-hidden /> Sign out
                  </button>
                </form>
              </div>
            </details>
          </div>
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6">{children}</main>
      </div>
    </div>
  );
}

function SubmitOnChange({ id }: { id: string }) {
  // Tiny inline enhancement: submit the workspace switcher on change.
  return <script dangerouslySetInnerHTML={{ __html: `document.getElementById(${JSON.stringify(id)})?.addEventListener('change',function(e){e.target.form.requestSubmit()})` }} />;
}
