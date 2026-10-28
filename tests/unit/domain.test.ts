import { describe, expect, it } from "vitest";
import { canTransition, availableActions, isOverdue, statusAfterAssign } from "@/domain/work-orders/state";
import { computeComplianceStatus, daysUntil, isoDate } from "@/domain/compliance/status";
import { toCsv } from "@/domain/reports/service";
import { assetHealth } from "@/domain/assets/service";
import { computeRunResult, parseTemplateLines } from "@/domain/inspections/service";
import { classifyRequest } from "@/domain/ai/tools";
import { sniffContentType } from "@/domain/files/service";
import { permissionsFor } from "@/lib/authz/permissions";
import { hashPassword, verifyPassword } from "@/lib/auth/password";

describe("work-order state machine", () => {
  it("allows only defined transitions", () => {
    expect(canTransition("start", "assigned")).toBe(true);
    expect(canTransition("start", "rework_required")).toBe(true);
    expect(canTransition("approve", "in_progress")).toBe(false);
    expect(canTransition("close", "pending_approval")).toBe(false);
    expect(canTransition("close", "approved")).toBe(true);
    expect(canTransition("cancel", "closed")).toBe(false);
    expect(availableActions("closed")).toEqual([]);
  });
  it("assignment moves unassigned work to assigned and keeps in-flight status", () => {
    expect(statusAfterAssign("new")).toBe("assigned");
    expect(statusAfterAssign("in_progress")).toBe("in_progress");
  });
  it("overdue only applies to open work", () => {
    const past = new Date(Date.now() - 1000);
    expect(isOverdue({ status: "in_progress", dueAt: past })).toBe(true);
    expect(isOverdue({ status: "closed", dueAt: past })).toBe(false);
    expect(isOverdue({ status: "approved", dueAt: past })).toBe(false);
  });
});

describe("compliance status", () => {
  const now = new Date("2026-10-23T12:00:00Z");
  const base = { notApplicable: false, verificationStatus: "verified" as const };
  it("derives status with documented precedence", () => {
    expect(computeComplianceStatus({ ...base, expiryDate: "2026-10-22" }, now)).toBe("expired");
    expect(computeComplianceStatus({ ...base, expiryDate: "2026-10-23" }, now)).toBe("expiring");
    expect(computeComplianceStatus({ ...base, expiryDate: "2026-11-22" }, now)).toBe("expiring");
    expect(computeComplianceStatus({ ...base, expiryDate: "2026-11-23" }, now)).toBe("valid");
    expect(computeComplianceStatus({ ...base, expiryDate: null }, now)).toBe("valid");
    expect(computeComplianceStatus({ ...base, verificationStatus: "pending_review", expiryDate: "2027-01-01" }, now)).toBe("pending_review");
    expect(computeComplianceStatus({ ...base, verificationStatus: "pending_review", expiryDate: "2026-01-01" }, now)).toBe("expired");
    expect(computeComplianceStatus({ ...base, notApplicable: true, expiryDate: "2020-01-01" }, now)).toBe("not_applicable");
  });
  it("computes days until expiry on calendar dates", () => {
    expect(daysUntil("2026-10-25", now)).toBe(2);
    expect(isoDate(now, -1)).toBe("2026-10-22");
  });
});

describe("CSV export", () => {
  it("escapes values, includes metadata and blocks formula injection", () => {
    const csv = toCsv(
      { columns: [{ key: "a", label: "A" }, { key: "b", label: "B" }], rows: [{ a: 'say "hi", ok', b: "=HYPERLINK(1)" }, { a: null, b: -5 }] },
      { title: "Test", generatedAt: new Date("2026-01-01T00:00:00Z"), filters: { site: "All" } },
    );
    expect(csv).toContain("# Generated 2026-01-01T00:00:00.000Z");
    expect(csv).toContain("# Filters: site=All");
    expect(csv).toContain('"say ""hi"", ok"');
    expect(csv).toContain("'=HYPERLINK(1)");
    expect(csv).toContain(",-5");
  });
});

describe("rule-based helpers", () => {
  it("asset health is transparent", () => {
    const h = assetHealth({ condition: "fair", nextMaintenanceAt: "2000-01-01" }, 2, new Date("2026-01-01"));
    expect(h.score).toBe(75 - 15 - 16);
    expect(h.reasons).toHaveLength(3);
  });
  it("inspection result: fails on failed item, needs review when evidence missing", () => {
    const items = [
      { id: "a", answerType: "pass_fail" as const, maxScore: null, requiresEvidence: true },
      { id: "b", answerType: "score" as const, maxScore: 5, requiresEvidence: false },
    ];
    expect(computeRunResult({ items, answers: { a: { value: "pass", score: null }, b: { value: null, score: 4 } }, defects: [], evidenceCount: 1 }).status).toBe("passed");
    expect(computeRunResult({ items, answers: { a: { value: "pass", score: null }, b: { value: null, score: 4 } }, defects: [], evidenceCount: 0 }).status).toBe("needs_review");
    expect(computeRunResult({ items, answers: { a: { value: "fail", score: null }, b: { value: null, score: 5 } }, defects: [], evidenceCount: 1 }).status).toBe("failed");
    expect(computeRunResult({ items, answers: { a: { value: "pass", score: null } }, defects: [], evidenceCount: 1 }).missing).toHaveLength(1);
  });
  it("parses template builder lines", () => {
    expect(parseTemplateLines("Floors clean | evidence\nOverall | score:5")).toEqual([
      { prompt: "Floors clean", answerType: "pass_fail", maxScore: undefined, requiresEvidence: true },
      { prompt: "Overall", answerType: "score", maxScore: 5, requiresEvidence: false },
    ]);
  });
  it("classifies requests deterministically", () => {
    expect(classifyRequest("Water leaking from the ceiling")).toEqual({ code: "PLUMB", priority: "high" });
    expect(classifyRequest("Smoke coming from switchboard")).toMatchObject({ priority: "critical" });
    expect(classifyRequest("Air con too hot in room 4")).toMatchObject({ code: "HVAC" });
  });
  it("sniffs file types from magic bytes", () => {
    expect(sniffContentType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe("image/png");
    expect(sniffContentType(new TextEncoder().encode("%PDF-1.7"))).toBe("application/pdf");
    expect(sniffContentType(new TextEncoder().encode("MZ executable"))).toBeNull();
  });
});

describe("permissions", () => {
  it("technicians cannot approve; supervisors only when granted", () => {
    expect(permissionsFor("technician").has("wo.approve")).toBe(false);
    expect(permissionsFor("supervisor").has("wo.approve")).toBe(false);
    expect(permissionsFor("supervisor", { canApprove: true }).has("wo.approve")).toBe(true);
    expect(permissionsFor("technician", { canApprove: true }).has("wo.approve")).toBe(false);
    expect(permissionsFor("auditor").has("wo.edit")).toBe(false);
    expect(permissionsFor("client_approver").has("wo.view_internal")).toBe(false);
  });
  it("hashes and verifies passwords", async () => {
    const h = await hashPassword("correct horse 1");
    expect(await verifyPassword("correct horse 1", h)).toBe(true);
    expect(await verifyPassword("wrong", h)).toBe(false);
  });
});
