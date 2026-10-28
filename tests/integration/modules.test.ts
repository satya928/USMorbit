import { rm } from "node:fs/promises";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { complianceItems, contractors, inspectionTemplates, sites, workOrders } from "@/db/schema";
import { complianceCounts, listCompliance, updateComplianceItem, getComplianceItem, verifyComplianceItem, syncComplianceAlerts } from "@/domain/compliance/service";
import { addDefect, createWorkOrderFromDefect, getRun, getTemplate, saveAnswers, startRun, submitRun } from "@/domain/inspections/service";
import { getAttachmentForDownload, uploadAttachment } from "@/domain/files/service";
import { runReport, toCsv } from "@/domain/reports/service";
import { askCopilot } from "@/domain/ai/copilot";
import { defaultPeriod, getDashboard } from "@/domain/metrics/service";
import { closeDb, ctxFor, db, expectCode, freshDemo } from "../helpers";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

beforeAll(freshDemo);
afterAll(async () => {
  await rm(process.env.STORAGE_DIR!, { recursive: true, force: true });
  await closeDb();
});

describe("compliance", () => {
  it("surfaces expiring and expired items in the right views", async () => {
    const mgr = await ctxFor("manager@northstar.demo");
    const expiring = await listCompliance(db(), mgr, { view: "expiring30" });
    const [bright] = await db().select().from(contractors).where(eq(contractors.name, "BrightSpark Electrical"));
    expect(expiring.some((i) => i.contractorId === bright.id && i.status === "expiring")).toBe(true);
    const expired = await listCompliance(db(), mgr, { view: "expired" });
    expect(expired.map((i) => i.relatedName)).toEqual(expect.arrayContaining(["ClearFlow Plumbing", "Sam Ortiz"]));
    expect(expired.every((i) => i.status === "expired")).toBe(true);
    const counts = await complianceCounts(db(), mgr);
    expect(counts.expiring30).toBe(expiring.length);
    const dash = await getDashboard(db(), mgr, defaultPeriod());
    expect(dash.kpi.expiringCompliance).toBe(counts.expiring30);
  });

  it("editing an expiry date updates status and requires re-verification", async () => {
    const mgr = await ctxFor("manager@northstar.demo");
    const [item] = await db().select().from(complianceItems).where(eq(complianceItems.referenceNumber, "PL-55-0477"));
    const before = await getComplianceItem(db(), mgr, item.id);
    expect(before.status).toBe("expired");
    const next = new Date(Date.now() + 365 * 86_400_000).toISOString().slice(0, 10);
    await updateComplianceItem(db(), mgr, item.id, { ...item, expiryDate: next, issuer: item.issuer, notes: item.notes });
    const after = await getComplianceItem(db(), mgr, item.id);
    expect(after.status).toBe("pending_review");
    await verifyComplianceItem(db(), mgr, item.id, true);
    expect((await getComplianceItem(db(), mgr, item.id)).status).toBe("valid");
  });

  it("raises deduplicated expiry alerts", async () => {
    const mgr = await ctxFor("manager@northstar.demo");
    await syncComplianceAlerts(db(), mgr.tenantId);
    const count = async () => (await db().execute(sql`select count(*)::int as n from notifications where type like 'compliance.%' and user_id = ${mgr.userId}`)).rows[0].n;
    const first = await count();
    expect(first).toBeGreaterThan(0);
    await syncComplianceAlerts(db(), mgr.tenantId);
    expect(await count()).toBe(first);
  });

  it("technicians cannot view compliance; contractor managers see only their own", async () => {
    await expectCode(listCompliance(db(), await ctxFor("tech@northstar.demo")), "FORBIDDEN");
    const cm = await ctxFor("contractor@northstar.demo");
    const rows = await listCompliance(db(), cm);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.relatedName === "Coolflow Mechanical")).toBe(true);
  });
});

describe("inspections", () => {
  it("persists answers, fails on a failed item, and creates a linked work order from a defect", async () => {
    const sup = await ctxFor("supervisor@northstar.demo");
    const [rrc] = await db().select().from(sites).where(eq(sites.code, "RRC"));
    const [tpl] = await db().select().from(inspectionTemplates).where(eq(inspectionTemplates.name, "Washroom & Amenities Clean Audit"));
    const { items } = await getTemplate(db(), sup, tpl.id);
    const run = await startRun(db(), sup, { templateId: tpl.id, siteId: rrc.id });
    await saveAnswers(db(), sup, run.id, {
      answers: items.map((it, i) => (it.answerType === "score" ? { templateItemId: it.id, score: 4 } : { templateItemId: it.id, value: i === 1 ? "fail" : "pass" })),
      notes: "Basin 2 mirror cracked",
    });
    const reloaded = await getRun(db(), sup, run.id);
    expect(Object.keys(reloaded.answers)).toHaveLength(items.length);
    expect(reloaded.run.notes).toBe("Basin 2 mirror cracked");

    const defect = await addDefect(db(), sup, run.id, { description: "Cracked mirror above basin 2", severity: "medium", locationText: "Level 1 washroom", templateItemId: items[1].id });
    const submitted = await submitRun(db(), sup, run.id, { signedOffByName: "Marcus Bell" });
    expect(submitted.status).toBe("failed");
    await expectCode(saveAnswers(db(), sup, run.id, { answers: [] }), "CONFLICT");

    const wo = await createWorkOrderFromDefect(db(), sup, defect.id);
    expect(wo.sourceInspectionId).toBe(run.id);
    expect(wo.siteId).toBe(rrc.id);
    expect(wo.locationText).toBe("Level 1 washroom");
    expect(wo.description).toContain("Washroom & Amenities Clean Audit");
    const after = await getRun(db(), sup, run.id);
    expect(after.defects[0].linkedWorkOrderId).toBe(wo.id);
    await expectCode(createWorkOrderFromDefect(db(), sup, defect.id), "CONFLICT");
  });

  it("refuses to submit incomplete inspections", async () => {
    const sup = await ctxFor("supervisor@northstar.demo");
    const [rrc] = await db().select().from(sites).where(eq(sites.code, "RRC"));
    const [tpl] = await db().select().from(inspectionTemplates).where(eq(inspectionTemplates.name, "HVAC Plant Room Check"));
    const run = await startRun(db(), sup, { templateId: tpl.id, siteId: rrc.id });
    await expectCode(submitRun(db(), sup, run.id, {}), "VALIDATION");
  });
});

describe("evidence files", () => {
  it("validates uploads and checks access on download", async () => {
    const tech = await ctxFor("tech@northstar.demo");
    const [wo] = await db().select().from(workOrders).where(eq(workOrders.title, "Car park P1 lighting outage — bays 40–58"));
    await expectCode(uploadAttachment(db(), tech, "work_order", wo.id, { name: "evil.png", type: "image/png", size: 12, bytes: new TextEncoder().encode("MZ not an image") }), "VALIDATION");
    const file = await uploadAttachment(db(), tech, "work_order", wo.id, { name: "after.png", type: "image/png", size: PNG.length, bytes: PNG });

    const ok = await getAttachmentForDownload(db(), tech, file.id);
    expect(ok.bytes.length).toBe(PNG.length);
    const client = await ctxFor("client@northstar.demo"); // RRC access
    expect((await getAttachmentForDownload(db(), client, file.id)).file.id).toBe(file.id);
    await expectCode(getAttachmentForDownload(db(), await ctxFor("admin@harbourline.demo", "harbourline"), file.id), "NOT_FOUND");
    await expectCode(getAttachmentForDownload(db(), await ctxFor("tech2@northstar.demo"), file.id), "NOT_FOUND");
    await expectCode(uploadAttachment(db(), await ctxFor("auditor@northstar.demo"), "work_order", wo.id, { name: "a.png", type: "image/png", size: PNG.length, bytes: PNG }), "FORBIDDEN");
  });
});

describe("reports", () => {
  it("applies site filters and records them in the export", async () => {
    const mgr = await ctxFor("manager@northstar.demo");
    const [rrc] = await db().select().from(sites).where(eq(sites.code, "RRC"));
    const { from, to } = defaultPeriod();
    const all = await runReport(db(), mgr, "work-orders", { from: new Date(from.getTime() - 90 * 86_400_000), to });
    const site = await runReport(db(), mgr, "work-orders", { from: new Date(from.getTime() - 90 * 86_400_000), to, siteId: rrc.id });
    expect(site.rows.length).toBeGreaterThan(0);
    expect(site.rows.length).toBeLessThan(all.rows.length);
    expect(site.rows.every((r) => r.site === "Riverside Retail Centre")).toBe(true);
    const csv = toCsv(site, { title: "Work-order register", generatedAt: new Date(), filters: { site: "Riverside Retail Centre" } });
    expect(csv.split("\r\n").filter((l) => l && !l.startsWith("#")).length).toBe(site.rows.length + 1);
    expect(csv).toContain("site=Riverside Retail Centre");
  });

  it("computes SLA from eligible completed work and handles empty periods", async () => {
    const mgr = await ctxFor("manager@northstar.demo");
    const sla = await runReport(db(), mgr, "sla", defaultPeriod());
    const overall = sla.rows[0];
    expect(Number(overall.eligible)).toBeGreaterThan(0);
    expect(Number(overall.met) + Number(overall.missed)).toBe(Number(overall.eligible));
    const empty = await runReport(db(), mgr, "sla", { from: new Date("2000-01-01"), to: new Date("2000-02-01") });
    expect(empty.rows[0]).toMatchObject({ eligible: 0, rate: null });
  });

  it("is not available to technicians", async () => {
    await expectCode(runReport(db(), await ctxFor("tech@northstar.demo"), "work-orders", defaultPeriod()), "FORBIDDEN");
  });
});

describe("AI copilot (deterministic demo mode)", () => {
  it("answers from authorised records and labels the mode", async () => {
    const mgr = await ctxFor("manager@northstar.demo");
    const overdue = await askCopilot(db(), mgr, "Which work orders are overdue and what are the likely blockers?");
    expect(overdue.mode).toBe("deterministic");
    expect(overdue.toolsUsed).toEqual(["list_overdue_work"]);
    expect(overdue.text).toMatch(/overdue/);
    const comp = await askCopilot(db(), mgr, "Show compliance items expiring in the next 30 days.");
    expect(comp.text).toContain("BrightSpark");
  });

  it("drafts work orders without creating them", async () => {
    const mgr = await ctxFor("manager@northstar.demo");
    const [{ n: before }] = (await db().execute(sql`select count(*)::int as n from work_orders`)).rows as { n: number }[];
    const a = await askCopilot(db(), mgr, "Draft a work order from this issue: Water leaking from the ceiling at Riverside Retail Centre food court.");
    expect(a.proposal).toMatchObject({ priority: "high", categoryName: "Plumbing", siteName: "Riverside Retail Centre" });
    const [{ n: after }] = (await db().execute(sql`select count(*)::int as n from work_orders`)).rows as { n: number }[];
    expect(after).toBe(before);
  });

  it("uses the configured provider through approved tools only", async () => {
    const mgr = await ctxFor("manager@northstar.demo");
    const calls: string[] = [];
    const fake = {
      name: "fake",
      model: "fake-model",
      async run(opts: { tools: { name: string }[]; execute: (n: string, i: unknown) => Promise<{ content: string }> }) {
        calls.push(...opts.tools.map((t) => t.name));
        const r = await opts.execute("summarize_open_work", {});
        const bad = await opts.execute("drop_tables", {}).catch(() => ({ content: "rejected" }));
        return { text: `LLM says: ${JSON.parse(r.content).summary.slice(0, 20)} / ${bad.content}` };
      },
    };
    const a = await askCopilot(db(), mgr, "Summarize open work", { provider: fake });
    expect(a.mode).toBe("llm");
    expect(a.text).toContain("LLM says:");
    expect(a.text).toContain("Tool failed to run.");
    expect(calls).not.toContain("drop_tables");
    const failing = { name: "fake", model: "m", run: async () => { throw Object.assign(new Error("boom"), { status: 529 }); } };
    const e = await askCopilot(db(), mgr, "anything", { provider: failing });
    expect(e.error).toBe(true);
    expect(e.text).toMatch(/unavailable/);
  });
});
