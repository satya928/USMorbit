import { getDb } from "@/db";
import { requireContext } from "@/lib/auth/session";
import { load, requirePagePerm } from "@/lib/page";
import { utcToZonedInput } from "@/lib/time";
import { siteOptions } from "@/domain/sites/service";
import { assetOptions } from "@/domain/assets/service";
import { categoryOptions } from "@/domain/people/service";
import { formatWoNumber, getWorkOrder } from "@/domain/work-orders/service";
import { Card, Notice, PageHeader } from "@/components/ui";
import { WorkOrderForm } from "../../work-order-form";
import { updateWorkOrderAction } from "../../actions";

export const metadata = { title: "Edit work order" };

export default async function EditWorkOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireContext();
  requirePagePerm(ctx, "wo.edit");
  const { id } = await params;
  const db = getDb();
  const [d, sites, assets, categories] = await Promise.all([load(getWorkOrder(db, ctx, id)), siteOptions(db, ctx), assetOptions(db, ctx), categoryOptions(db, ctx)]);
  const wo = d.workOrder;
  const num = formatWoNumber(wo.workOrderNumber);
  return (
    <>
      <PageHeader title={`Edit ${num}`} breadcrumbs={[{ label: "Work Orders", href: "/work-orders" }, { label: num, href: `/work-orders/${wo.id}` }, { label: "Edit" }]} />
      <div className="max-w-3xl">
        {d.permissions.canEdit ? (
          <Card>
            <WorkOrderForm
              action={updateWorkOrderAction}
              mode="edit"
              privileged
              sites={sites}
              assets={assets}
              categories={categories}
              values={{ ...wo, sourceInspectionId: undefined, dueAt: utcToZonedInput(wo.dueAt, d.site.timezone) }}
            />
          </Card>
        ) : (
          <Notice tone="warn">This work order is closed or cancelled and can no longer be edited.</Notice>
        )}
      </div>
    </>
  );
}
