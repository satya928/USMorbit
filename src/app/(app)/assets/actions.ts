"use server";

import { formToObject, runAction } from "@/lib/actions";
import type { ActionResult } from "@/lib/errors";
import { createAsset, setAssetArchived, updateAsset } from "@/domain/assets/service";

export async function createAssetAction(_p: ActionResult | null, fd: FormData) {
  return runAction((ctx, db) => createAsset(db, ctx, formToObject(fd)), { revalidate: ["/assets"], redirectTo: (a) => `/assets/${a.id}` });
}

export async function updateAssetAction(_p: ActionResult | null, fd: FormData) {
  const id = String(fd.get("id"));
  return runAction((ctx, db) => updateAsset(db, ctx, id, formToObject(fd)), { revalidate: ["/assets"], redirectTo: () => `/assets/${id}` });
}

export async function archiveAssetAction(_p: ActionResult | null, fd: FormData) {
  const id = String(fd.get("id"));
  return runAction((ctx, db) => setAssetArchived(db, ctx, id, fd.get("archived") === "true"), { revalidate: ["/assets"], redirectTo: () => "/assets" });
}
