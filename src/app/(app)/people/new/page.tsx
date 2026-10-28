import { getDb } from "@/db";
import { requireContext } from "@/lib/auth/session";
import { requirePagePerm } from "@/lib/page";
import { contractorOptions } from "@/domain/people/service";
import { siteOptions } from "@/domain/sites/service";
import { Card, PageHeader } from "@/components/ui";
import { PersonForm } from "../forms";
import { createPersonAction } from "../actions";

export const metadata = { title: "Add person" };

export default async function NewPersonPage() {
  const ctx = await requireContext();
  requirePagePerm(ctx, "people.manage");
  const [contractors, sites] = await Promise.all([contractorOptions(getDb(), ctx), siteOptions(getDb(), ctx)]);
  return (
    <>
      <PageHeader title="Add person" breadcrumbs={[{ label: "People", href: "/people" }, { label: "New" }]} description="To give this person a login, invite them from Settings → Users." />
      <Card className="max-w-3xl">
        <PersonForm action={createPersonAction} contractors={contractors} sites={sites} />
      </Card>
    </>
  );
}
