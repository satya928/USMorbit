"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  BarChart3,
  Bot,
  Boxes,
  Building2,
  ClipboardCheck,
  ClipboardList,
  LayoutDashboard,
  Menu,
  Settings,
  ShieldCheck,
  Stamp,
  Users,
  X,
} from "lucide-react";
import { cn } from "./ui";
import { Logo } from "./logo";

const ICONS = { LayoutDashboard, ClipboardList, Building2, Boxes, Users, ShieldCheck, ClipboardCheck, Stamp, BarChart3, Bot, Settings };
export type NavItem = { href: string; label: string; icon: keyof typeof ICONS; badge?: number };

function Links({ items, onNavigate }: { items: NavItem[]; onNavigate?: () => void }) {
  const path = usePathname();
  return (
    <ul className="space-y-0.5">
      {items.map((item) => {
        const Icon = ICONS[item.icon];
        const active = path === item.href || path.startsWith(item.href + "/");
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                active ? "bg-white/10 text-white" : "text-navy-200 hover:bg-white/5 hover:text-white",
              )}
            >
              <Icon className={cn("size-4 shrink-0", active ? "text-accent-500" : "")} aria-hidden />
              <span className="flex-1">{item.label}</span>
              {!!item.badge && <span className="rounded-full bg-accent-500 px-1.5 text-xs font-semibold text-navy-900">{item.badge}</span>}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function Sidebar({ items, footer }: { items: NavItem[]; footer?: React.ReactNode }) {
  return (
    <aside className="hidden w-60 shrink-0 flex-col bg-navy-900 lg:flex">
      <div className="px-4 py-5">
        <Logo light />
      </div>
      <nav aria-label="Main" className="flex-1 overflow-y-auto px-2">
        <Links items={items} />
      </nav>
      {footer && <div className="border-t border-white/10 px-4 py-3 text-xs text-navy-200">{footer}</div>}
    </aside>
  );
}

export function MobileNav({ items }: { items: NavItem[] }) {
  const [open, setOpen] = useState(false);
  const path = usePathname();
  useEffect(() => setOpen(false), [path]);
  return (
    <div className="lg:hidden">
      <button type="button" onClick={() => setOpen(true)} className="rounded-md p-2 text-slate-700 hover:bg-slate-100" aria-label="Open navigation" aria-expanded={open}>
        <Menu className="size-5" />
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex" role="dialog" aria-modal="true" aria-label="Navigation">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setOpen(false)} />
          <div className="relative flex w-72 max-w-[85%] flex-col bg-navy-900 px-2 py-4">
            <div className="mb-4 flex items-center justify-between px-2">
              <Logo light />
              <button type="button" onClick={() => setOpen(false)} className="rounded-md p-1.5 text-navy-200 hover:bg-white/10" aria-label="Close navigation">
                <X className="size-5" />
              </button>
            </div>
            <nav aria-label="Main">
              <Links items={items} onNavigate={() => setOpen(false)} />
            </nav>
          </div>
        </div>
      )}
    </div>
  );
}
