"use server";

import { formToObject, runAction } from "@/lib/actions";
import type { ActionResult } from "@/lib/errors";
import { archiveComplianceItem, createComplianceItem, updateComplianceItem, verifyComplianceItem } from "@/domain/compliance/service";

export async function createComplianceAction(_p: ActionResult | null, fd: FormData) {
  return runAction((ctx, db) => createComplianceItem(db, ctx, formToObject(fd)), { revalidate: ["/compliance", "/dashboard"], redirectTo: (i) => `/compliance/${i.id}` });
}
export async function updateComplianceAction(_p: ActionResult | null, fd: FormData) {
  const id = String(fd.get("id"));
  const input = formToObject(fd);
  input.notApplicable = fd.get("notApplicable") === "on";
  return runAction((ctx, db) => updateComplianceItem(db, ctx, id, input), { revalidate: ["/compliance", "/dashboard"], message: "Saved. Changed expiry dates require re-verification." });
}
export async function verifyComplianceAction(_p: ActionResult | null, fd: FormData) {
  const id = String(fd.get("id"));
  const verified = fd.get("verified") === "true";
  return runAction((ctx, db) => verifyComplianceItem(db, ctx, id, verified), { revalidate: ["/compliance"], message: verified ? "Marked as verified." : "Verification removed." });
}
export async function archiveComplianceAction(_p: ActionResult | null, fd: FormData) {
  const id = String(fd.get("id"));
  return runAction((ctx, db) => archiveComplianceItem(db, ctx, id), { revalidate: ["/compliance"], redirectTo: () => "/compliance" });
}
