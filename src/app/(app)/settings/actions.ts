"use server";

import { formToObject, runAction } from "@/lib/actions";
import type { ActionResult } from "@/lib/errors";
import {
  createCategory,
  inviteMember,
  resetMemberPassword,
  setMemberStatus,
  updateCategory,
  updateMember,
  updateTenantProfile,
  updateWorkflowSettings,
  upsertSlaPolicy,
} from "@/domain/settings/service";

const R = ["/settings"];

export async function profileAction(_p: ActionResult | null, fd: FormData) {
  return runAction((ctx, db) => updateTenantProfile(db, ctx, formToObject(fd)), { revalidate: R, message: "Workspace updated." });
}
export async function workflowAction(_p: ActionResult | null, fd: FormData) {
  return runAction((ctx, db) => updateWorkflowSettings(db, ctx, { enforceCredentials: fd.get("enforceCredentials") === "on", allowSelfApproval: fd.get("allowSelfApproval") === "on", defaultChecklist: fd.get("defaultChecklist") }), {
    revalidate: R,
    message: "Workflow settings saved.",
  });
}
export async function inviteAction(_p: ActionResult | null, fd: FormData) {
  return runAction((ctx, db) => inviteMember(db, ctx, formToObject(fd, ["siteIds"])), {
    revalidate: R,
    message: (r) =>
      r.tempPassword
        ? `User added. Temporary password: ${r.tempPassword} — share it securely; they must change it at first sign-in. It will not be shown again.`
        : "Existing user added to this workspace. They can sign in with their current password.",
  });
}
export async function memberAction(_p: ActionResult | null, fd: FormData) {
  return runAction((ctx, db) => updateMember(db, ctx, String(fd.get("membershipId")), formToObject(fd, ["siteIds"])), { revalidate: R, message: "Access updated." });
}
export async function memberStatusAction(_p: ActionResult | null, fd: FormData) {
  return runAction((ctx, db) => setMemberStatus(db, ctx, String(fd.get("membershipId")), fd.get("active") === "true"), { revalidate: R, message: "Status updated." });
}
export async function categoryAction(_p: ActionResult | null, fd: FormData) {
  const id = fd.get("id");
  return runAction(async (ctx, db) => { if (id) await updateCategory(db, ctx, String(id), formToObject(fd)); else await createCategory(db, ctx, formToObject(fd)); }, { revalidate: R, message: "Category saved." });
}
export async function slaAction(_p: ActionResult | null, fd: FormData) {
  return runAction((ctx, db) => upsertSlaPolicy(db, ctx, formToObject(fd)), { revalidate: R, message: "SLA preset saved." });
}
export async function resetPasswordAction(_p: ActionResult | null, fd: FormData) {
  return runAction((ctx, db) => resetMemberPassword(db, ctx, String(fd.get("membershipId"))), {
    revalidate: R,
    message: (r) => `Temporary password: ${r.tempPassword} — share it securely. The user must change it at next sign-in; existing sessions were signed out.`,
  });
}
