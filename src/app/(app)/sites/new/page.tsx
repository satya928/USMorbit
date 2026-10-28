import { getDb } from "@/db";
import { requireContext } from "@/lib/auth/session";
import { requirePagePerm } from "@/lib/page";
import { personOptions } from "@/domain/people/service";
import { SITE_TYPES } from "@/domain/sites/service";
import { Card, PageHeader } from "@/components/ui";
import { SiteForm } from "../site-form";
import { createSiteAction } from "../actions";

export const metadata = { title: "Add site" };

export default async function NewSitePage() {
  const ctx = await requireContext();
  requirePagePerm(ctx, "site.manage");
  const people = await personOptions(getDb(), ctx);
  return (
    <>
      <PageHeader title="Add site" breadcrumbs={[{ label: "Sites", href: "/sites" }, { label: "New" }]} />
      <Card className="max-w-3xl">
        <SiteForm action={createSiteAction} siteTypes={SITE_TYPES} people={people} />
      </Card>
    </>
  );
}
