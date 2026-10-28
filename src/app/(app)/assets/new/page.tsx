import { getDb } from "@/db";
import { requireContext } from "@/lib/auth/session";
import { one, requirePagePerm, type SearchParams } from "@/lib/page";
import { ASSET_CATEGORIES } from "@/domain/assets/service";
import { siteOptions } from "@/domain/sites/service";
import { Card, PageHeader } from "@/components/ui";
import { AssetForm } from "../asset-form";
import { createAssetAction } from "../actions";

export const metadata = { title: "Add asset" };

export default async function NewAssetPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requireContext();
  requirePagePerm(ctx, "asset.manage");
  const sites = await siteOptions(getDb(), ctx);
  const sp = await searchParams;
  return (
    <>
      <PageHeader title="Add asset" breadcrumbs={[{ label: "Assets", href: "/assets" }, { label: "New" }]} />
      <Card className="max-w-3xl">
        <AssetForm action={createAssetAction} sites={sites} categories={ASSET_CATEGORIES} values={{ siteId: one(sp.siteId) }} />
      </Card>
    </>
  );
}
