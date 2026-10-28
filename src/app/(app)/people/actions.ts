"use server";

import { formToObject, runAction } from "@/lib/actions";
import type { ActionResult } from "@/lib/errors";
import { createContractor, createPerson, updateContractor, updatePerson } from "@/domain/people/service";

export async function createPersonAction(_p: ActionResult | null, fd: FormData) {
  return runAction((ctx, db) => createPerson(db, ctx, formToObject(fd)), { revalidate: ["/people"], redirectTo: (p) => `/people/${p.id}` });
}
export async function updatePersonAction(_p: ActionResult | null, fd: FormData) {
  const id = String(fd.get("id"));
  const input = formToObject(fd);
  input.active = fd.get("active") === "on";
  return runAction((ctx, db) => updatePerson(db, ctx, id, input), { revalidate: ["/people"], message: "Saved." });
}
export async function createContractorAction(_p: ActionResult | null, fd: FormData) {
  return runAction((ctx, db) => createContractor(db, ctx, formToObject(fd, ["categoryIds"])), { revalidate: ["/people"], redirectTo: (c) => `/people/contractors/${c.id}` });
}
export async function updateContractorAction(_p: ActionResult | null, fd: FormData) {
  const id = String(fd.get("id"));
  return runAction((ctx, db) => updateContractor(db, ctx, id, formToObject(fd, ["categoryIds"])), { revalidate: ["/people"], message: "Saved." });
}
