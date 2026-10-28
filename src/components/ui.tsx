import clsx from "clsx";
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { ChevronRight, Inbox } from "lucide-react";
import type { WorkOrderStatus } from "@/db/schema";
import { STATUS_LABELS } from "@/domain/work-orders/state";
import { COMPLIANCE_STATUS_LABELS, type ComplianceStatus } from "@/domain/compliance/status";

export const cn = clsx;

const BUTTON = {
  primary: "bg-brand-600 text-white hover:bg-brand-700 shadow-xs",
  secondary: "bg-white text-slate-800 border border-slate-300 hover:bg-slate-50 shadow-xs",
  danger: "bg-red-600 text-white hover:bg-red-700 shadow-xs",
  ghost: "text-slate-700 hover:bg-slate-100",
  accent: "bg-accent-600 text-white hover:bg-accent-700 shadow-xs",
};
const SIZE = { sm: "px-2.5 py-1.5 text-xs", md: "px-3.5 py-2 text-sm" };
export type ButtonVariant = keyof typeof BUTTON;

export function buttonClass(variant: ButtonVariant = "primary", size: keyof typeof SIZE = "md", extra?: string) {
  return cn(
    "inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60",
    BUTTON[variant],
    SIZE[size],
    extra,
  );
}

export function Button({ variant = "primary", size = "md", className, ...props }: ComponentProps<"button"> & { variant?: ButtonVariant; size?: keyof typeof SIZE }) {
  return <button {...props} className={buttonClass(variant, size, className)} />;
}

export function LinkButton({ variant = "primary", size = "md", className, ...props }: ComponentProps<typeof Link> & { variant?: ButtonVariant; size?: keyof typeof SIZE }) {
  return <Link {...props} className={buttonClass(variant, size, className)} />;
}

export function Card({ title, actions, children, className, bodyClassName }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; bodyClassName?: string }) {
  return (
    <section className={cn("rounded-lg border border-slate-200 bg-white shadow-xs", className)}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
          {title && <h2 className="text-sm font-semibold text-slate-900">{title}</h2>}
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={cn("p-4", bodyClassName)}>{children}</div>
    </section>
  );
}

export function PageHeader({ title, description, breadcrumbs, actions }: { title: ReactNode; description?: ReactNode; breadcrumbs?: { label: string; href?: string }[]; actions?: ReactNode }) {
  return (
    <div className="mb-6">
      {breadcrumbs && (
        <nav aria-label="Breadcrumb" className="mb-2 flex flex-wrap items-center gap-1 text-xs text-slate-500">
          {breadcrumbs.map((b, i) => (
            <span key={i} className="flex items-center gap-1">
              {i > 0 && <ChevronRight className="size-3" aria-hidden />}
              {b.href ? (
                <Link href={b.href} className="hover:text-slate-800 hover:underline">
                  {b.label}
                </Link>
              ) : (
                <span aria-current="page">{b.label}</span>
              )}
            </span>
          ))}
        </nav>
      )}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">{title}</h1>
          {description && <p className="mt-1 text-sm text-slate-600">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

const TONES = {
  gray: "bg-slate-100 text-slate-700 ring-slate-200",
  blue: "bg-blue-50 text-blue-700 ring-blue-200",
  teal: "bg-accent-50 text-accent-700 ring-accent-100",
  green: "bg-green-50 text-green-700 ring-green-200",
  amber: "bg-amber-50 text-amber-800 ring-amber-200",
  orange: "bg-orange-50 text-orange-700 ring-orange-200",
  red: "bg-red-50 text-red-700 ring-red-200",
  violet: "bg-violet-50 text-violet-700 ring-violet-200",
};
export type Tone = keyof typeof TONES;

export function Badge({ tone = "gray", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset", TONES[tone], className)}>{children}</span>;
}

const STATUS_TONE: Record<WorkOrderStatus, Tone> = {
  new: "blue",
  triaged: "violet",
  assigned: "violet",
  in_progress: "teal",
  ready_for_inspection: "amber",
  pending_approval: "orange",
  rework_required: "red",
  approved: "green",
  closed: "gray",
  cancelled: "gray",
};
export function StatusBadge({ status }: { status: WorkOrderStatus }) {
  return <Badge tone={STATUS_TONE[status]}>{STATUS_LABELS[status]}</Badge>;
}

const PRIORITY_TONE = { low: "gray", medium: "blue", high: "orange", critical: "red" } as const;
export function PriorityBadge({ priority }: { priority: "low" | "medium" | "high" | "critical" }) {
  return (
    <Badge tone={PRIORITY_TONE[priority]}>
      {priority === "critical" && <span aria-hidden>▲</span>}
      {priority[0].toUpperCase() + priority.slice(1)}
    </Badge>
  );
}

const COMPLIANCE_TONE: Record<ComplianceStatus, Tone> = { valid: "green", expiring: "amber", expired: "red", pending_review: "blue", not_applicable: "gray" };
const COMPLIANCE_ICON: Record<ComplianceStatus, string> = { valid: "✓", expiring: "!", expired: "✕", pending_review: "…", not_applicable: "–" };
export function ComplianceBadge({ status }: { status: ComplianceStatus }) {
  return (
    <Badge tone={COMPLIANCE_TONE[status]}>
      <span aria-hidden>{COMPLIANCE_ICON[status]}</span>
      {COMPLIANCE_STATUS_LABELS[status]}
    </Badge>
  );
}

export function EmptyState({ title, description, action, icon }: { title: string; description?: string; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-4 py-10 text-center">
      <div className="text-slate-400">{icon ?? <Inbox className="size-8" aria-hidden />}</div>
      <p className="text-sm font-medium text-slate-900">{title}</p>
      {description && <p className="max-w-sm text-sm text-slate-500">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function Table({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("overflow-x-auto", className)}>
      <table className="min-w-full divide-y divide-slate-200 text-sm">{children}</table>
    </div>
  );
}
export function Th({ children, className, ...props }: ComponentProps<"th">) {
  return (
    <th scope="col" {...props} className={cn("whitespace-nowrap px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500", className)}>
      {children}
    </th>
  );
}
export function Td({ children, className, ...props }: ComponentProps<"td">) {
  return (
    <td {...props} className={cn("px-3 py-2.5 align-top text-slate-700", className)}>
      {children}
    </td>
  );
}

export function KpiCard({ label, value, hint, href, tone = "default", icon }: { label: string; value: ReactNode; hint?: ReactNode; href?: string; tone?: "default" | "warn" | "bad" | "good"; icon?: ReactNode }) {
  const toneCls = { default: "text-slate-900", warn: "text-amber-700", bad: "text-red-700", good: "text-green-700" }[tone];
  const body = (
    <div className="flex h-full flex-col rounded-lg border border-slate-200 bg-white p-4 shadow-xs transition-colors hover:border-slate-300">
      <div className="flex items-center justify-between text-xs font-medium text-slate-500">
        <span>{label}</span>
        {icon && <span className="text-slate-400">{icon}</span>}
      </div>
      <div className={cn("mt-2 text-3xl font-semibold tabular-nums tracking-tight", toneCls)}>{value}</div>
      {hint && <div className="mt-1 text-xs text-slate-500">{hint}</div>}
    </div>
  );
  return href ? (
    <Link href={href} className="block h-full rounded-lg">
      {body}
    </Link>
  ) : (
    body
  );
}

export function DefinitionList({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
      {items.map(([k, v]) => (
        <div key={k} className="min-w-0">
          <dt className="text-xs font-medium text-slate-500">{k}</dt>
          <dd className="mt-0.5 break-words text-sm text-slate-900">{v ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Pagination({ page, pageSize, total, hrefFor }: { page: number; pageSize: number; total: number; hrefFor: (page: number) => string }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return <p className="px-3 py-3 text-xs text-slate-500">{total} result{total === 1 ? "" : "s"}</p>;
  return (
    <nav className="flex items-center justify-between gap-3 border-t border-slate-100 px-3 py-3 text-xs text-slate-600" aria-label="Pagination">
      <span>
        {(page - 1) * pageSize + 1}–{Math.min(total, page * pageSize)} of {total}
      </span>
      <div className="flex gap-2">
        {page > 1 ? <LinkButton variant="secondary" size="sm" href={hrefFor(page - 1)}>Previous</LinkButton> : <span className={buttonClass("secondary", "sm", "opacity-50")}>Previous</span>}
        {page < pages ? <LinkButton variant="secondary" size="sm" href={hrefFor(page + 1)}>Next</LinkButton> : <span className={buttonClass("secondary", "sm", "opacity-50")}>Next</span>}
      </div>
    </nav>
  );
}

export function Notice({ tone = "info", title, children }: { tone?: "info" | "warn" | "error" | "success"; title?: string; children?: ReactNode }) {
  const cls = {
    info: "border-blue-200 bg-blue-50 text-blue-900",
    warn: "border-amber-200 bg-amber-50 text-amber-900",
    error: "border-red-200 bg-red-50 text-red-900",
    success: "border-green-200 bg-green-50 text-green-900",
  }[tone];
  return (
    <div role={tone === "error" ? "alert" : "status"} className={cn("rounded-md border px-3 py-2 text-sm", cls)}>
      {title && <p className="font-medium">{title}</p>}
      {children && <div className={title ? "mt-0.5" : undefined}>{children}</div>}
    </div>
  );
}

export function ComingLater({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 px-3 py-3 text-sm text-slate-600">
      <Badge tone="gray">Coming later</Badge> <span className="ml-1">{children}</span>
    </div>
  );
}

export function pct(rate: number | null | undefined) {
  return rate === null || rate === undefined ? "—" : `${Math.round(rate * 1000) / 10}%`;
}
