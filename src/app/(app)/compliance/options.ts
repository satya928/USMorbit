import type { DB } from "@/db";
import type { AuthContext } from "@/lib/auth/context";
import { assetOptions } from "@/domain/assets/service";
import { contractorOptions, personOptions } from "@/domain/people/service";
import { siteOptions } from "@/domain/sites/service";

export async function complianceOptions(db: DB, ctx: AuthContext) {
  const [sites, assets, people, contractors] = await Promise.all([siteOptions(db, ctx), assetOptions(db, ctx), personOptions(db, ctx), contractorOptions(db, ctx)]);
  return { sites, assets: assets.map((a) => ({ id: a.id, name: `${a.code} — ${a.name}` })), people, contractors };
}
