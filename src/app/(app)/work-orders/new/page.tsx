import { getDb } from "@/db";
import { can } from "@/lib/auth/context";
import { requireContext } from "@/lib/auth/session";
import { one, requirePagePerm, type SearchParams } from "@/lib/page";
import { siteOptions } from "@/domain/sites/service";
import { assetOptions } from "@/domain/assets/service";
import { categoryOptions } from "@/domain/people/service";
import { Card, Notice, PageHeader } from "@/components/ui";
import { WorkOrderForm } from "../work-order-form";
import { createWorkOrderAction } from "../actions";

export const metadata = { title: "New work order" };

export default async function NewWorkOrderPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requireContext();
  requirePagePerm(ctx, "wo.create");
  const sp = await searchParams;
  const db = getDb();
  const [sites, assets, categories] = await Promise.all([siteOptions(db, ctx), assetOptions(db, ctx), categoryOptions(db, ctx)]);
  const privileged = can(ctx, "wo.edit");
  const fromAi = one(sp.from) === "copilot";
  return (
    <>
      <PageHeader title={privileged ? "New work order" : "Raise a request"} breadcrumbs={[{ label: "Work Orders", href: "/work-orders" }, { label: "New" }]} />
      <div className="max-w-3xl space-y-4">
        {fromAi && <Notice tone="info" title="Prefilled from an AI Copilot draft">Review every field before creating the work order. AI suggestions can be wrong.</Notice>}
        {!sites.length && <Notice tone="warn">You do not have access to any active sites, so you cannot raise work orders yet.</Notice>}
        <Card>
          <WorkOrderForm
            action={createWorkOrderAction}
            mode="create"
            privileged={privileged}
            sites={sites}
            assets={assets}
            categories={categories}
            values={{
              title: one(sp.title),
              description: one(sp.description),
              siteId: one(sp.siteId),
              assetId: one(sp.assetId),
              categoryId: one(sp.categoryId),
              priority: one(sp.priority),
              locationText: one(sp.locationText),
              sourceInspectionId: one(sp.sourceInspectionId),
            }}
          />
        </Card>
      </div>
    </>
  );
}
