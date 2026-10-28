import Link from "next/link";
import { Pencil } from "lucide-react";
import { getDb } from "@/db";
import { can } from "@/lib/auth/context";
import { requireContext } from "@/lib/auth/session";
import { load } from "@/lib/page";
import { formatDate } from "@/lib/time";
import { getAsset } from "@/domain/assets/service";
import { computeComplianceStatus } from "@/domain/compliance/status";
import { formatWoNumber } from "@/domain/work-orders/service";
import { ActionButton } from "@/components/forms";
import { Card, ComplianceBadge, DefinitionList, EmptyState, LinkButton, PageHeader, PriorityBadge, StatusBadge } from "@/components/ui";
import { HealthBadge } from "../health";
import { archiveAssetAction } from "../actions";

export const metadata = { title: "Asset" };

export default async function AssetPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireContext();
  const { id } = await params;
  const d = await load(getAsset(getDb(), ctx, id));
  const a = d.asset;
  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "Assets", href: "/assets" }, { label: a.code }]}
        title={a.name}
        description={`${a.code} · ${a.category}${a.assetType ? ` · ${a.assetType}` : ""} · ${d.siteName}`}
        actions={
          <>
            {can(ctx, "wo.create") && <LinkButton href={`/work-orders/new?siteId=${a.siteId}&assetId=${a.id}`}>Raise work order</LinkButton>}
            {can(ctx, "asset.manage") && (
              <LinkButton href={`/assets/${a.id}/edit`} variant="secondary">
                <Pencil className="size-4" /> Edit
              </LinkButton>
            )}
          </>
        }
      />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card title="Asset details">
            <DefinitionList
              items={[
                ["Site", <Link key="s" href={`/sites/${a.siteId}`} className="text-brand-700 hover:underline">{d.siteName}</Link>],
                ["Location", a.locationText],
                ["Manufacturer", a.manufacturer],
                ["Model", a.model],
                ["Serial number", a.serialNumber],
                ["Criticality", a.criticality],
                ["Condition", a.condition],
                ["Install date", formatDate(a.installDate)],
                ["Warranty expiry", formatDate(a.warrantyExpiry)],
                ["Last service", formatDate(a.lastServiceAt)],
                ["Next maintenance", formatDate(a.nextMaintenanceAt)],
              ]}
            />
          </Card>
          <Card title={`Work-order history (${d.history.length})`}>
            {d.history.length ? (
              <ul className="divide-y divide-slate-100">
                {d.history.map((w) => (
                  <li key={w.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <Link href={`/work-orders/${w.id}`} className="text-sm hover:underline">
                      <span className="font-mono text-xs font-semibold text-brand-700">{formatWoNumber(w.number)}</span> {w.title}
                      <span className="ml-2 text-xs text-slate-500">{formatDate(w.createdAt, d.siteTimezone)}</span>
                    </Link>
                    <span className="flex gap-1.5">
                      <PriorityBadge priority={w.priority} />
                      <StatusBadge status={w.status} />
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="No work recorded for this asset" />
            )}
          </Card>
        </div>
        <div className="space-y-4">
          <Card title="Health indicator">
            <HealthBadge health={d.health} />
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-600">
              {d.health.reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-slate-500">Rule-based, not predictive. No sensor integration in this beta.</p>
          </Card>
          {can(ctx, "compliance.view") && (
            <Card title="Compliance">
              {d.compliance.length ? (
                <ul className="space-y-2">
                  {d.compliance.map((c) => (
                    <li key={c.id} className="flex items-center justify-between gap-2 text-sm">
                      <Link href={`/compliance/${c.id}`} className="hover:underline">
                        {c.name}
                      </Link>
                      <ComplianceBadge status={computeComplianceStatus(c)} />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-slate-500">No asset compliance records.</p>
              )}
            </Card>
          )}
          {can(ctx, "asset.manage") && (
            <Card>
              <ActionButton action={archiveAssetAction} label="Archive asset" fields={{ id: a.id, archived: "true" }} variant="ghost" confirm="Archive this asset? Its work history is kept." />
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
