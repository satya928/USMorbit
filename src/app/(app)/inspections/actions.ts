"use server";

import { formToObject, runAction } from "@/lib/actions";
import type { ActionResult } from "@/lib/errors";
import {
  addDefect,
  archiveTemplate,
  createTemplate,
  createWorkOrderFromDefect,
  parseTemplateLines,
  saveAnswers,
  startRun,
  submitRun,
} from "@/domain/inspections/service";

export async function startRunAction(_p: ActionResult | null, fd: FormData) {
  return runAction((ctx, db) => startRun(db, ctx, formToObject(fd)), { revalidate: ["/inspections"], redirectTo: (r) => `/inspections/${r.id}` });
}

/** Answers arrive as answer.<itemId>, score.<itemId>, note.<itemId>. */
function readAnswers(fd: FormData) {
  const ids = new Set<string>();
  for (const k of fd.keys()) {
    const m = /^(answer|score|note)\.(.+)$/.exec(k);
    if (m) ids.add(m[2]);
  }
  return [...ids].map((templateItemId) => ({
    templateItemId,
    value: fd.get(`answer.${templateItemId}`) ?? undefined,
    score: fd.get(`score.${templateItemId}`) ?? undefined,
    note: fd.get(`note.${templateItemId}`) ?? undefined,
  }));
}

async function saveAnswersAction(_p: ActionResult | null, fd: FormData) {
  const id = String(fd.get("id"));
  return runAction((ctx, db) => saveAnswers(db, ctx, id, { answers: readAnswers(fd), notes: fd.get("notes") ?? undefined }), {
    revalidate: [`/inspections/${id}`],
    message: "Progress saved.",
  });
}

export async function addDefectAction(_p: ActionResult | null, fd: FormData) {
  const id = String(fd.get("id"));
  return runAction((ctx, db) => addDefect(db, ctx, id, formToObject(fd)), { revalidate: [`/inspections/${id}`], message: "Defect recorded." });
}

async function submitRunAction(_p: ActionResult | null, fd: FormData) {
  const id = String(fd.get("id"));
  return runAction(
    async (ctx, db) => {
      await saveAnswers(db, ctx, id, { answers: readAnswers(fd), notes: fd.get("notes") ?? undefined });
      return submitRun(db, ctx, id, { signedOffByName: fd.get("signedOffByName") ?? undefined });
    },
    { revalidate: ["/inspections", "/dashboard"], message: (r) => `Inspection submitted — result: ${r.status.replace("_", " ")}.` },
  );
}

export async function defectWorkOrderAction(_p: ActionResult | null, fd: FormData) {
  return runAction((ctx, db) => createWorkOrderFromDefect(db, ctx, String(fd.get("defectId"))), {
    revalidate: ["/inspections", "/work-orders"],
    redirectTo: (wo) => `/work-orders/${wo.id}?created=1`,
  });
}

export async function createTemplateAction(_p: ActionResult | null, fd: FormData) {
  return runAction(
    (ctx, db) =>
      createTemplate(db, ctx, {
        name: fd.get("name"),
        category: fd.get("category"),
        serviceType: fd.get("serviceType"),
        items: parseTemplateLines(String(fd.get("items") ?? "")),
      }),
    { revalidate: ["/inspections"], redirectTo: (t) => `/inspections/templates/${t.id}` },
  );
}

export async function archiveTemplateAction(_p: ActionResult | null, fd: FormData) {
  return runAction((ctx, db) => archiveTemplate(db, ctx, String(fd.get("id"))), { revalidate: ["/inspections"], redirectTo: () => "/inspections?tab=templates" });
}

/** One form, two intents: the clicked button's value decides between saving and submitting. */
export async function answersAction(p: ActionResult | null, fd: FormData) {
  return fd.get("intent") === "submit" ? submitRunAction(p, fd) : saveAnswersAction(p, fd);
}
