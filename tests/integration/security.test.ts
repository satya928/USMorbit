import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sites, workOrders } from "@/db/schema";
import { getWorkOrder, listWorkOrders, transitionWorkOrder, updateWorkOrder, assignWorkOrder, createWorkOrder } from "@/domain/work-orders/service";
import { getSite, listSites } from "@/domain/sites/service";
import { listCompliance } from "@/domain/compliance/service";
import { inviteMember } from "@/domain/settings/service";
import { askCopilot } from "@/domain/ai/copilot";
import { closeDb, ctxFor, db, expectCode, freshDemo } from "../helpers";

let northstarWoId: string;
let gfcWoId: string;

beforeAll(async () => {
  await freshDemo();
  const [wo] = await db().select().from(workOrders).where(eq(workOrders.title, "Fire indicator panel fault — zone 4"));
  northstarWoId = wo.id;
  const [gfc] = await db().select().from(workOrders).where(eq(workOrders.title, "Campus irrigation timer fault"));
  gfcWoId = gfc.id;
});
afterAll(() => closeDb());

describe("tenant isolation", () => {
  it("tenant B cannot read, list, edit or transition tenant A records by ID", async () => {
    const hb = await ctxFor("admin@harbourline.demo", "harbourline");
    await expectCode(getWorkOrder(db(), hb, northstarWoId), "NOT_FOUND");
    await expectCode(updateWorkOrder(db(), hb, northstarWoId, { title: "hijack", siteId: (await listSites(db(), hb))[0].id, priority: "low" }), "NOT_FOUND");
    await expectCode(transitionWorkOrder(db(), hb, northstarWoId, { action: "cancel", reason: "x" }), "NOT_FOUND");
    await expectCode(assignWorkOrder(db(), hb, northstarWoId, { contractorId: "00000000-0000-0000-0000-000000000000" }), "NOT_FOUND");
    const list = await listWorkOrders(db(), hb, { pageSize: 100 });
    expect(list.rows.every((r) => r.title.startsWith("Harbourline"))).toBe(true);
    expect((await listCompliance(db(), hb)).every((c) => c.name.startsWith("Harbourline"))).toBe(true);
  });

  it("tenant B cannot create work referencing tenant A's site", async () => {
    const hb = await ctxFor("admin@harbourline.demo", "harbourline");
    const [nsSite] = await db().select().from(sites).where(eq(sites.code, "NBP"));
    await expectCode(getSite(db(), hb, nsSite.id), "NOT_FOUND");
    await expectCode(createWorkOrder(db(), hb, { title: "Cross tenant", siteId: nsSite.id, priority: "low" }), "VALIDATION");
  });

  it("the database rejects cross-tenant references even if application checks were bypassed", async () => {
    const hb = await ctxFor("admin@harbourline.demo", "harbourline");
    const [nsSite] = await db().select().from(sites).where(eq(sites.code, "NBP"));
    await expect(
      db().insert(workOrders).values({ tenantId: hb.tenantId, workOrderNumber: 99999, title: "bypass", siteId: nsSite.id }),
    ).rejects.toThrow();
  });

  it("a user in two workspaces only sees the active workspace's data", async () => {
    const asAuditorInHb = await ctxFor("admin@northstar.demo", "harbourline");
    expect(asAuditorInHb.role).toBe("auditor");
    await expectCode(getWorkOrder(db(), asAuditorInHb, northstarWoId), "NOT_FOUND");
  });

  it("AI tools only return authorised tenant data", async () => {
    const hb = await ctxFor("admin@harbourline.demo", "harbourline");
    const answer = await askCopilot(db(), hb, "Summarize the open work across my sites.");
    expect(answer.mode).toBe("deterministic");
    expect(answer.text).toContain("Harbourline Tower");
    expect(answer.text).not.toContain("Northstar");
  });
});

describe("role and site scope", () => {
  it("site-scoped roles cannot see other sites' work", async () => {
    const sup = await ctxFor("supervisor@northstar.demo");
    await expectCode(getWorkOrder(db(), sup, gfcWoId), "NOT_FOUND");
    const list = await listWorkOrders(db(), sup, { pageSize: 100 });
    expect(list.rows.some((r) => r.siteName === "Greenfield Campus")).toBe(false);
    expect(list.total).toBeGreaterThan(0);
  });

  it("technicians only see their assigned or requested work", async () => {
    const tech = await ctxFor("tech@northstar.demo");
    const list = await listWorkOrders(db(), tech, { pageSize: 100 });
    expect(list.total).toBeGreaterThan(0);
    for (const r of list.rows) expect(r.assigneeName).toBe("Jordan Lee");
    await expectCode(getWorkOrder(db(), tech, northstarWoId), "NOT_FOUND");
  });

  it("contractor managers only see their contractor's work", async () => {
    const cm = await ctxFor("contractor@northstar.demo");
    const list = await listWorkOrders(db(), cm, { pageSize: 100 });
    expect(list.total).toBeGreaterThan(0);
    for (const r of list.rows) expect(r.contractorName).toBe("Coolflow Mechanical");
  });

  it("client approvers never receive internal notes", async () => {
    const client = await ctxFor("client@northstar.demo");
    const detail = await getWorkOrder(db(), client, northstarWoId);
    expect(detail.workOrder.internalNotes).toBeNull();
    const mgr = await ctxFor("manager@northstar.demo");
    expect((await getWorkOrder(db(), mgr, northstarWoId)).workOrder.internalNotes).toContain("detector");
  });

  it("technicians cannot approve, assign, or edit; auditors cannot write", async () => {
    const tech = await ctxFor("tech@northstar.demo");
    const [pending] = await db()
      .select()
      .from(workOrders)
      .where(and(eq(workOrders.status, "pending_approval"), eq(workOrders.title, "Deep clean of ground floor lobby")));
    await expectCode(transitionWorkOrder(db(), tech, pending.id, { action: "approve" }), "FORBIDDEN");
    await expectCode(assignWorkOrder(db(), tech, pending.id, { personId: tech.personId! }), "FORBIDDEN");
    const auditor = await ctxFor("auditor@northstar.demo");
    await expectCode(updateWorkOrder(db(), auditor, pending.id, { title: "x", siteId: pending.siteId }), "FORBIDDEN");
    await expectCode(createWorkOrder(db(), auditor, { title: "Auditor write", siteId: pending.siteId }), "FORBIDDEN");
  });

  it("crafted input cannot change tenant or escalate role", async () => {
    const tech = await ctxFor("tech@northstar.demo");
    const hb = await ctxFor("admin@harbourline.demo", "harbourline");
    const [nbp] = await db().select().from(sites).where(eq(sites.code, "NBP"));
    const wo = await createWorkOrder(db(), tech, { title: "Tech request", siteId: nbp.id, tenantId: hb.tenantId, internalNotes: "x", status: "closed" } as never);
    expect(wo.tenantId).toBe(tech.tenantId);
    expect(wo.status).toBe("new");
    expect(wo.internalNotes).toBeNull();
    await expectCode(inviteMember(db(), tech, { name: "Evil", email: "evil@x.demo", role: "tenant_admin" }), "FORBIDDEN");
  });

  it("technicians cannot act on work assigned to someone else", async () => {
    const tech2 = await ctxFor("tech2@northstar.demo");
    const [jobs] = await db().select().from(workOrders).where(eq(workOrders.title, "Campus irrigation timer fault"));
    // Sam is the assignee here; Jordan (tech) is not and does not have GFC access.
    const tech = await ctxFor("tech@northstar.demo");
    await expectCode(transitionWorkOrder(db(), tech, jobs.id, { action: "start" }), "NOT_FOUND");
    await transitionWorkOrder(db(), tech2, jobs.id, { action: "start" });
  });
});

describe("admin password reset", () => {
  it("issues a temporary password, revokes sessions, and cannot touch users in other workspaces", async () => {
    const { resetMemberPassword } = await import("@/domain/settings/service");
    const { verifyPassword } = await import("@/lib/auth/password");
    const { memberships, sessions, users } = await import("@/db/schema");
    const admin = await ctxFor("admin@northstar.demo");
    const tech = await ctxFor("tech@northstar.demo");
    await db().insert(sessions).values({ id: "test-session-hash", userId: tech.userId, tenantId: tech.tenantId, expiresAt: new Date(Date.now() + 3600_000) });
    const { tempPassword } = await resetMemberPassword(db(), admin, tech.membershipId);
    const [u] = await db().select().from(users).where(eq(users.id, tech.userId));
    expect(await verifyPassword(tempPassword, u.passwordHash)).toBe(true);
    expect(await verifyPassword("Orbit-Demo-2026", u.passwordHash)).toBe(false);
    expect(u.mustChangePassword).toBe(true);
    expect(await db().select().from(sessions).where(eq(sessions.userId, tech.userId))).toHaveLength(0);

    // Harbourline's admin cannot reset the Northstar admin, who also belongs to Harbourline.
    const hb = await ctxFor("admin@harbourline.demo", "harbourline");
    const [m] = await db().select().from(memberships).where(and(eq(memberships.userId, admin.userId), eq(memberships.tenantId, hb.tenantId)));
    await expectCode(resetMemberPassword(db(), hb, m.id), "FORBIDDEN");
    await expectCode(resetMemberPassword(db(), tech, admin.membershipId), "FORBIDDEN");
  });
});
