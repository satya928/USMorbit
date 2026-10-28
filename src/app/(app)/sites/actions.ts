"use server";

import { formToObject, runAction } from "@/lib/actions";
import type { ActionResult } from "@/lib/errors";
import { createSite, setSiteArchived, updateSite } from "@/domain/sites/service";

export async function createSiteAction(_p: ActionResult | null, fd: FormData) {
  return runAction((ctx, db) => createSite(db, ctx, formToObject(fd)), { revalidate: ["/sites"], redirectTo: (s) => `/sites/${s.id}` });
}

export async function updateSiteAction(_p: ActionResult | null, fd: FormData) {
  const id = String(fd.get("id"));
  return runAction((ctx, db) => updateSite(db, ctx, id, formToObject(fd)), { revalidate: ["/sites"], redirectTo: () => `/sites/${id}` });
}

export async function archiveSiteAction(_p: ActionResult | null, fd: FormData) {
  const id = String(fd.get("id"));
  const archived = fd.get("archived") === "true";
  return runAction((ctx, db) => setSiteArchived(db, ctx, id, archived), { revalidate: ["/sites"], message: archived ? "Site archived." : "Site restored." });
}
