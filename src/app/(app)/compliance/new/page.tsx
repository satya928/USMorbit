import { getDb } from "@/db";
import { requireContext } from "@/lib/auth/session";
import { one, requirePagePerm, type SearchParams } from "@/lib/page";
import { Card, PageHeader } from "@/components/ui";
import { ComplianceForm } from "../compliance-form";
import { createComplianceAction } from "../actions";
import { complianceOptions } from "../options";

export const metadata = { title: "Add compliance item" };

export default async function NewCompliancePage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requireContext();
  requirePagePerm(ctx, "compliance.manage");
  const sp = await searchParams;
  const options = await complianceOptions(getDb(), ctx);
  return (
    <>
      <PageHeader title="Add compliance item" breadcrumbs={[{ label: "Compliance", href: "/compliance" }, { label: "New" }]} description="Upload the document after saving. New items start as pending review until verified." />
      <Card className="max-w-3xl">
        <ComplianceForm action={createComplianceAction} options={options} values={{ subjectType: one(sp.subjectType), personId: one(sp.personId), contractorId: one(sp.contractorId), siteId: one(sp.siteId), assetId: one(sp.assetId) }} />
      </Card>
    </>
  );
}
