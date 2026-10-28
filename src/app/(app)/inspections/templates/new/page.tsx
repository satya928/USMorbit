import { requireContext } from "@/lib/auth/session";
import { requirePagePerm } from "@/lib/page";
import { Card, PageHeader } from "@/components/ui";
import { TemplateForm } from "../../forms";

export const metadata = { title: "New inspection template" };

export default async function NewTemplatePage() {
  const ctx = await requireContext();
  requirePagePerm(ctx, "inspection.template.manage");
  return (
    <>
      <PageHeader title="New inspection template" breadcrumbs={[{ label: "Inspections", href: "/inspections?tab=templates" }, { label: "New template" }]} />
      <Card className="max-w-2xl">
        <TemplateForm />
      </Card>
    </>
  );
}
