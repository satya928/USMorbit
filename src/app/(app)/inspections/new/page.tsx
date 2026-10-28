import { getDb } from "@/db";
import { requireContext } from "@/lib/auth/session";
import { one, requirePagePerm, type SearchParams } from "@/lib/page";
import { listTemplates, workOrdersForSite } from "@/domain/inspections/service";
import { siteOptions } from "@/domain/sites/service";
import { Card, Notice, PageHeader } from "@/components/ui";
import { StartRunForm } from "../forms";

export const metadata = { title: "Start inspection" };

export default async function NewInspectionPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requireContext();
  requirePagePerm(ctx, "inspection.run");
  const sp = await searchParams;
  const db = getDb();
  const [templates, sites] = await Promise.all([listTemplates(db, ctx), siteOptions(db, ctx)]);
  const workOrders = await workOrdersForSite(db, ctx, sites.map((s) => s.id));
  return (
    <>
      <PageHeader title="Start inspection" breadcrumbs={[{ label: "Inspections", href: "/inspections" }, { label: "New" }]} />
      <Card className="max-w-xl">
        {templates.length ? (
          <StartRunForm templates={templates} sites={sites} workOrders={workOrders} defaults={{ siteId: one(sp.siteId), workOrderId: one(sp.workOrderId), templateId: one(sp.templateId) }} />
        ) : (
          <Notice tone="warn">Create an inspection template first.</Notice>
        )}
      </Card>
    </>
  );
}
