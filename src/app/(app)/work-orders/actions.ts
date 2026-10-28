"use server";

import { and, eq } from "drizzle-orm";
import { sites } from "@/db/schema";
import type { DbOrTx } from "@/db";
import type { AuthContext } from "@/lib/auth/context";
import { formToObject, lines, runAction } from "@/lib/actions";
import type { ActionResult } from "@/lib/errors";
import { zonedInputToUtc } from "@/lib/time";
import {
  addChecklistItem,
  addComment,
  assignWorkOrder,
  createWorkOrder,
  formatWoNumber,
  setChecklistItem,
  transitionWorkOrder,
  updateWorkOrder,
} from "@/domain/work-orders/service";
import type { WorkflowAction } from "@/domain/work-orders/state";

/** Due times are entered in the site's local time; convert to UTC on the server. */
async function normaliseInput(db: DbOrTx, ctx: AuthContext, fd: FormData) {
  const input = formToObject(fd);
  if (typeof input.checklist === "string") input.checklist = lines(input.checklist);
  if (typeof input.dueAt === "string" && input.dueAt && typeof input.siteId === "string" && input.siteId) {
    const [site] = await db.select({ tz: sites.timezone }).from(sites).where(and(eq(sites.id, input.siteId), eq(sites.tenantId, ctx.tenantId)));
    input.dueAt = zonedInputToUtc(input.dueAt, site?.tz ?? ctx.tenantTimezone)?.toISOString() ?? "";
  }
  return input;
}

export async function createWorkOrderAction(_p: ActionResult | null, fd: FormData) {
  return runAction(async (ctx, db) => createWorkOrder(db, ctx, await normaliseInput(db, ctx, fd)), {
    revalidate: ["/work-orders", "/dashboard"],
    redirectTo: (wo) => `/work-orders/${wo.id}?created=1`,
  });
}

export async function updateWorkOrderAction(_p: ActionResult | null, fd: FormData) {
  const id = String(fd.get("id"));
  return runAction(async (ctx, db) => updateWorkOrder(db, ctx, id, await normaliseInput(db, ctx, fd)), {
    revalidate: ["/work-orders"],
    redirectTo: () => `/work-orders/${id}`,
  });
}

export async function assignAction(_p: ActionResult | null, fd: FormData) {
  const id = String(fd.get("id"));
  return runAction((ctx, db) => assignWorkOrder(db, ctx, id, formToObject(fd)), {
    revalidate: [`/work-orders/${id}`, "/dashboard"],
    message: (wo) => `${formatWoNumber(wo.workOrderNumber)} assigned.`,
  });
}

export async function transitionAction(_p: ActionResult | null, fd: FormData) {
  const id = String(fd.get("id"));
  const action = String(fd.get("action")) as WorkflowAction;
  // Only same-app relative paths are accepted as a return target.
  const returnTo = String(fd.get("returnTo") ?? "");
  const base = /^\/[a-z-]+$/.test(returnTo) ? returnTo : `/work-orders/${id}`;
  return runAction((ctx, db) => transitionWorkOrder(db, ctx, id, { action, reason: fd.get("reason") ?? undefined }), {
    revalidate: ["/work-orders", "/dashboard", "/approvals"],
    // Redirect so the confirmation survives the refresh that removes the clicked button.
    redirectTo: () => `${base}?done=${encodeURIComponent(action)}`,
  });
}

export async function checklistToggleAction(_p: ActionResult | null, fd: FormData) {
  const id = String(fd.get("id"));
  return runAction((ctx, db) => setChecklistItem(db, ctx, id, String(fd.get("itemId")), { done: fd.get("done") === "true" }), {
    revalidate: [`/work-orders/${id}`],
  });
}

export async function addChecklistAction(_p: ActionResult | null, fd: FormData) {
  const id = String(fd.get("id"));
  return runAction((ctx, db) => addChecklistItem(db, ctx, id, { label: fd.get("label"), required: fd.get("required") === "on" }), {
    revalidate: [`/work-orders/${id}`],
  });
}

export async function commentAction(_p: ActionResult | null, fd: FormData) {
  const id = String(fd.get("id"));
  return runAction((ctx, db) => addComment(db, ctx, id, { body: fd.get("body"), internal: fd.get("internal") === "on" }), {
    revalidate: [`/work-orders/${id}`],
    message: "Comment added.",
  });
}
