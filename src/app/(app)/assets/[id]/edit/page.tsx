import { getDb } from "@/db";
import { requireContext } from "@/lib/auth/session";
import { load, requirePagePerm } from "@/lib/page";
import { ASSET_CATEGORIES, getAsset } from "@/domain/assets/service";
import { siteOptions } from "@/domain/sites/service";
import { Card, PageHeader } from "@/components/ui";
import { AssetForm } from "../../asset-form";
import { updateAssetAction } from "../../actions";

export const metadata = { title: "Edit asset" };

export default async function EditAssetPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireContext();
  requirePagePerm(ctx, "asset.manage");
  const { id } = await params;
  const [{ asset }, sites] = await Promise.all([load(getAsset(getDb(), ctx, id)), siteOptions(getDb(), ctx)]);
  return (
    <>
      <PageHeader title={`Edit ${asset.name}`} breadcrumbs={[{ label: "Assets", href: "/assets" }, { label: asset.code, href: `/assets/${asset.id}` }, { label: "Edit" }]} />
      <Card className="max-w-3xl">
        <AssetForm action={updateAssetAction} sites={sites} categories={ASSET_CATEGORIES} values={asset as unknown as Record<string, string | null>} />
      </Card>
    </>
  );
}
