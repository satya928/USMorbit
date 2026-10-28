import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auditLogs, people, sites, workCategories, workOrders } from "@/db/schema";
import {
  addComment,
  assignWorkOrder,
  createWorkOrder,
  getWorkOrder,
  setChecklistItem,
  transitionWorkOrder,
} from "@/domain/work-orders/service";
import { getDashboard, defaultPeriod } from "@/domain/metrics/service";
import { closeDb, ctxFor, db, expectCode, freshDemo } from "../helpers";

beforeAll(freshDemo);
afterAll(() => closeDb());

async function ids() {
  const [rrc] = await db().select().from(sites).where(eq(sites.code, "RRC"));
  const [plumb] = await db().select().from(workCategories).where(eq(workCategories.code, "PLUMB"));
  const [elec] = await db().select().from(workCategories).where(eq(workCategories.code, "ELEC"));
  const [jordan] = await db().select().from(people).where(eq(people.name, "Jordan Lee"));
  const [sam] = await db().select().from(people).where(eq(people.name, "Sam Ortiz"));
  const [priya] = await db().select().from(people).where(eq(people.name, "Priya Raman"));
  return { rrc, plumb, elec, jordan, sam, priya };
}

describe("work-order lifecycle end to end", () => {
  it("create → assign → start → checklist → inspect → reject → rework → approve → close", async () => {
    const { rrc, plumb, jordan } = await ids();
    const manager = await ctxFor("manager@northstar.demo");
    const tech = await ctxFor("tech@northstar.demo");
    const supervisor = await ctxFor("supervisor@northstar.demo");
    const client = await ctxFor("client@northstar.demo");
    const before = await getDashboard(db(), manager, defaultPeriod());

    const wo = await createWorkOrder(db(), manager, {
      title: "Leaking pipe in loading dock",
      siteId: rrc.id,
      categoryId: plumb.id,
      priority: "high",
      checklist: ["Isolate water", "Replace pipe section"],
    });
    expect(wo.status).toBe("new");
    expect(wo.dueAt).not.toBeNull(); // SLA preset applied
    const afterCreate = await getDashboard(db(), manager, defaultPeriod());
    expect(afterCreate.kpi.open).toBe(before.kpi.open + 1);

    await expectCode(transitionWorkOrder(db(), tech, wo.id, { action: "start" }), "NOT_FOUND"); // not yet assigned to tech
    await expectCode(transitionWorkOrder(db(), manager, wo.id, { action: "approve" }), "INVALID_TRANSITION");

    const assigned = await assignWorkOrder(db(), manager, wo.id, { personId: jordan.id });
    expect(assigned.status).toBe("assigned");

    await transitionWorkOrder(db(), tech, wo.id, { action: "start" });
    let detail = await getWorkOrder(db(), tech, wo.id);
    expect(detail.workOrder.status).toBe("in_progress");
    expect(detail.workOrder.startedAt).not.toBeNull();

    await expectCode(transitionWorkOrder(db(), tech, wo.id, { action: "mark_ready" }), "INVALID_TRANSITION"); // checklist incomplete
    for (const item of detail.checklist) await setChecklistItem(db(), tech, wo.id, item.id, { done: true });
    await addComment(db(), tech, wo.id, { body: "Pipe replaced and tested." });
    await expectCode(addComment(db(), tech, wo.id, { body: "secret", internal: true }), "FORBIDDEN");
    await transitionWorkOrder(db(), tech, wo.id, { action: "mark_ready" });

    await expectCode(transitionWorkOrder(db(), tech, wo.id, { action: "pass_inspection" }), "FORBIDDEN");
    await transitionWorkOrder(db(), supervisor, wo.id, { action: "pass_inspection" });
    expect((await getDashboard(db(), manager, defaultPeriod())).kpi.awaitingApproval).toBe(before.kpi.awaitingApproval + 1);

    await expectCode(transitionWorkOrder(db(), client, wo.id, { action: "reject" }), "VALIDATION"); // reason required
    await transitionWorkOrder(db(), client, wo.id, { action: "reject", reason: "Insulation not reinstated." });
    detail = await getWorkOrder(db(), manager, wo.id);
    expect(detail.workOrder.status).toBe("rework_required");
    expect(detail.workOrder.reworkCount).toBe(1);
    expect(detail.approvals[0]).toMatchObject({ decision: "rejected", reason: "Insulation not reinstated." });
    expect(detail.events.some((e) => e.type === "status.reject" && (e.data as { reason?: string }).reason === "Insulation not reinstated.")).toBe(true);

    await transitionWorkOrder(db(), tech, wo.id, { action: "start" });
    await transitionWorkOrder(db(), tech, wo.id, { action: "mark_ready" });
    await transitionWorkOrder(db(), supervisor, wo.id, { action: "pass_inspection" });
    await transitionWorkOrder(db(), client, wo.id, { action: "approve" });
    await expectCode(transitionWorkOrder(db(), client, wo.id, { action: "close" }), "FORBIDDEN");
    const closed = await transitionWorkOrder(db(), manager, wo.id, { action: "close" });
    expect(closed.status).toBe("closed");
    expect(closed.closedAt).not.toBeNull();
    await expectCode(transitionWorkOrder(db(), manager, wo.id, { action: "cancel", reason: "x" }), "INVALID_TRANSITION");

    const final = await getWorkOrder(db(), manager, wo.id);
    const types = final.events.map((e) => e.type);
    expect(types).toEqual(expect.arrayContaining(["created", "assigned", "status.start", "status.mark_ready", "status.pass_inspection", "status.reject", "status.approve", "status.close"]));
    expect(final.approvals.map((a) => a.decision).sort()).toEqual(["approved", "rejected"]);
    expect((await getDashboard(db(), manager, defaultPeriod())).kpi.open).toBe(before.kpi.open);
  });

  it("prevents self-approval by default", async () => {
    const { rrc, priya } = await ids();
    const manager = await ctxFor("manager@northstar.demo");
    const wo = await createWorkOrder(db(), manager, { title: "Self approval test", siteId: rrc.id, checklist: ["Do it"] });
    await assignWorkOrder(db(), manager, wo.id, { personId: priya.id });
    await transitionWorkOrder(db(), manager, wo.id, { action: "start" });
    const d = await getWorkOrder(db(), manager, wo.id);
    await setChecklistItem(db(), manager, wo.id, d.checklist[0].id, { done: true });
    await transitionWorkOrder(db(), manager, wo.id, { action: "mark_ready" });
    await transitionWorkOrder(db(), manager, wo.id, { action: "pass_inspection" });
    await expectCode(transitionWorkOrder(db(), manager, wo.id, { action: "approve" }), "FORBIDDEN");
    expect((await getWorkOrder(db(), manager, wo.id)).permissions.selfApprovalBlocked).toBe(true);
  });

  it("blocks assignment without a required credential and audits authorised overrides", async () => {
    const { rrc, elec, sam, jordan } = await ids();
    const manager = await ctxFor("manager@northstar.demo");
    const supervisor = await ctxFor("supervisor@northstar.demo");
    const wo = await createWorkOrder(db(), manager, { title: "Replace RCD", siteId: rrc.id, categoryId: elec.id });
    const err = await expectCode(assignWorkOrder(db(), manager, wo.id, { personId: sam.id }), "CONFLICT");
    expect(err.message).toContain("Electrical Licence");
    expect(err.message).toContain("expired");
    await expectCode(assignWorkOrder(db(), supervisor, wo.id, { personId: sam.id, overrideReason: "urgent" }), "FORBIDDEN");
    await assignWorkOrder(db(), manager, wo.id, { personId: sam.id, overrideReason: "Licence renewal confirmed by phone; certificate pending." });
    const logs = await db().select().from(auditLogs).where(eq(auditLogs.action, "compliance.assignment_override"));
    expect(logs.some((l) => l.entityId === wo.id && l.actorUserId === manager.userId)).toBe(true);
    const detail = await getWorkOrder(db(), manager, wo.id);
    expect(detail.events.some((e) => (e.data as { credentialOverride?: string }).credentialOverride)).toBe(true);
    await assignWorkOrder(db(), manager, wo.id, { personId: jordan.id }); // valid licence → no override needed
  });

  it("detects concurrent transitions", async () => {
    const manager = await ctxFor("manager@northstar.demo");
    const [wo] = await db().select().from(workOrders).where(eq(workOrders.title, "Replace flickering lights in L3 corridor"));
    const results = await Promise.allSettled([
      transitionWorkOrder(db(), manager, wo.id, { action: "cancel", reason: "a" }),
      transitionWorkOrder(db(), manager, wo.id, { action: "cancel", reason: "b" }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  });
});
