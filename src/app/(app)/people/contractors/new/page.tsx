import { getDb } from "@/db";
import { requireContext } from "@/lib/auth/session";
import { requirePagePerm } from "@/lib/page";
import { categoryOptions } from "@/domain/people/service";
import { Card, PageHeader } from "@/components/ui";
import { ContractorForm } from "../../forms";
import { createContractorAction } from "../../actions";

export const metadata = { title: "Add contractor" };

export default async function NewContractorPage() {
  const ctx = await requireContext();
  requirePagePerm(ctx, "contractor.manage");
  const categories = await categoryOptions(getDb(), ctx);
  return (
    <>
      <PageHeader title="Add contractor" breadcrumbs={[{ label: "Contractors", href: "/people?tab=contractors" }, { label: "New" }]} />
      <Card className="max-w-3xl">
        <ContractorForm action={createContractorAction} categories={categories} />
      </Card>
    </>
  );
}
