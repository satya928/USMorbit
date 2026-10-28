import { getDb } from "@/db";
import { requireContext } from "@/lib/auth/session";
import { load, requirePagePerm } from "@/lib/page";
import { personOptions } from "@/domain/people/service";
import { getSite, SITE_TYPES } from "@/domain/sites/service";
import { Card, PageHeader } from "@/components/ui";
import { SiteForm } from "../../site-form";
import { updateSiteAction } from "../../actions";

export const metadata = { title: "Edit site" };

export default async function EditSitePage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireContext();
  requirePagePerm(ctx, "site.manage");
  const { id } = await params;
  const [{ site }, people] = await Promise.all([load(getSite(getDb(), ctx, id)), personOptions(getDb(), ctx)]);
  return (
    <>
      <PageHeader title={`Edit ${site.name}`} breadcrumbs={[{ label: "Sites", href: "/sites" }, { label: site.name, href: `/sites/${site.id}` }, { label: "Edit" }]} />
      <Card className="max-w-3xl">
        <SiteForm action={updateSiteAction} values={site} siteTypes={SITE_TYPES} people={people} />
      </Card>
    </>
  );
}
