import "dotenv/config";
import { eq, inArray, like } from "drizzle-orm";
import { closeDb, getDb, type DbOrTx } from "./index";
import { runMigrations } from "./migrate";
import * as s from "./schema";
import { hashPassword } from "@/lib/auth/password";
import { isoDate } from "@/domain/compliance/status";

/**
 * Demo seed: fictional "Northstar Facilities Group" tenant plus a second tenant used to prove
 * tenant isolation. All names, emails and companies are fictional (".demo" domains).
 *
 *   npm run db:seed    # seed if the demo tenant does not exist
 *   npm run db:reset   # delete ONLY demo tenants (is_demo = true) and demo users, then reseed
 */
export { DEMO_ACCOUNTS, DEMO_PASSWORD } from "./seed-accounts";
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from "./seed-accounts";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export async function resetDemoData(db: DbOrTx) {
  const demoTenants = await db.select({ id: s.tenants.id }).from(s.tenants).where(eq(s.tenants.isDemo, true));
  const ids = demoTenants.map((t) => t.id);
  if (ids.length) {
    // Delete child → parent explicitly; a single cascading tenant delete can trip composite FK checks.
    const ordered = [
      s.aiInteractionLogs, s.auditLogs, s.notifications, s.approvalDecisions, s.inspectionDefects, s.inspectionAnswers,
      s.inspectionRuns, s.inspectionTemplateItems, s.inspectionTemplates, s.complianceItems, s.fileAttachments,
      s.workOrderEvents, s.workOrderComments, s.workOrderChecklistItems, s.workOrderAssignments, s.workOrders,
      s.siteAccess, s.contractorServiceCategories, s.slaPolicies, s.memberships, s.people, s.assets, s.sites,
      s.workCategories, s.contractors,
    ];
    for (const table of ordered) await db.delete(table).where(inArray(table.tenantId, ids));
    await db.delete(s.tenants).where(inArray(s.tenants.id, ids));
  }
  await db.delete(s.users).where(like(s.users.email, "%.demo"));
}

export async function seedDemo(db: DbOrTx, now = new Date()) {
  const at = (offsetMs: number) => new Date(now.getTime() + offsetMs);
  const passwordHash = await hashPassword(DEMO_PASSWORD);

  // --- Tenants -------------------------------------------------------------
  const [ns] = await db
    .insert(s.tenants)
    .values({
      name: "Northstar Facilities Group",
      slug: "northstar",
      country: "Australia",
      timezone: "Australia/Sydney",
      isDemo: true,
      settings: {
        enforceCredentials: true,
        allowSelfApproval: false,
        defaultChecklist: ["Confirm site access and complete safety check", "Complete the work and test", "Leave the area clean and safe"],
      },
    })
    .returning();
  const [hb] = await db
    .insert(s.tenants)
    .values({ name: "Harbourline Property Services", slug: "harbourline", country: "New Zealand", timezone: "Pacific/Auckland", isDemo: true })
    .returning();
  const T = ns.id;

  // --- Users ---------------------------------------------------------------
  const userRows = await db
    .insert(s.users)
    .values(DEMO_ACCOUNTS.map((a) => ({ email: a.email, name: a.name, passwordHash })))
    .returning();
  const U = Object.fromEntries(userRows.map((u) => [u.email.split("@")[0] + (u.email.includes("harbourline") ? "_hb" : ""), u])) as Record<string, typeof s.users.$inferSelect>;

  // --- Sites ---------------------------------------------------------------
  const siteRows = await db
    .insert(s.sites)
    .values([
      { tenantId: T, code: "NBP", name: "Northstar Business Park", siteType: "Office", address: "100 Example Parade", city: "Sydney", region: "NSW", country: "Australia", timezone: "Australia/Sydney", contactName: "Front desk", contactEmail: "frontdesk@northstar.demo" },
      { tenantId: T, code: "RRC", name: "Riverside Retail Centre", siteType: "Retail", address: "12 Fictional Quay", city: "Melbourne", region: "VIC", country: "Australia", timezone: "Australia/Melbourne", contactName: "Centre management", contactEmail: "centre@riverside.demo" },
      { tenantId: T, code: "GFC", name: "Greenfield Campus", siteType: "Campus", address: "1 Sample Avenue", city: "Brisbane", region: "QLD", country: "Australia", timezone: "Australia/Brisbane", contactName: "Campus services", contactEmail: "services@greenfield.demo" },
    ])
    .returning();
  const [NBP, RRC, GFC] = siteRows;
  const [hbSite] = await db
    .insert(s.sites)
    .values({ tenantId: hb.id, code: "HQ", name: "Harbourline Tower", siteType: "Office", city: "Auckland", country: "New Zealand", timezone: "Pacific/Auckland" })
    .returning();

  // --- Categories & SLA ----------------------------------------------------
  const cats = await db
    .insert(s.workCategories)
    .values([
      { tenantId: T, code: "HVAC", name: "HVAC" },
      { tenantId: T, code: "ELEC", name: "Electrical", requiredCredential: "Electrical Licence" },
      { tenantId: T, code: "PLUMB", name: "Plumbing" },
      { tenantId: T, code: "FIRE", name: "Fire & Safety" },
      { tenantId: T, code: "CLEAN", name: "Cleaning" },
      { tenantId: T, code: "GEN", name: "Generators" },
      { tenantId: T, code: "GENERAL", name: "General maintenance" },
    ])
    .returning();
  const C = Object.fromEntries(cats.map((c) => [c.code, c]));
  await db.insert(s.workCategories).values({ tenantId: hb.id, code: "GENERAL", name: "General maintenance" });

  const sla = [
    { priority: "critical" as const, responseHours: 1, resolutionHours: 4 },
    { priority: "high" as const, responseHours: 4, resolutionHours: 24 },
    { priority: "medium" as const, responseHours: 24, resolutionHours: 72 },
    { priority: "low" as const, responseHours: 48, resolutionHours: 168 },
  ];
  await db.insert(s.slaPolicies).values([...sla.map((p) => ({ ...p, tenantId: T })), ...sla.map((p) => ({ ...p, tenantId: hb.id }))]);
  const slaHours = Object.fromEntries(sla.map((p) => [p.priority, p.resolutionHours]));

  // --- Contractors ---------------------------------------------------------
  const contractorRows = await db
    .insert(s.contractors)
    .values([
      { tenantId: T, name: "Coolflow Mechanical", contactName: "Dana Fox", contactEmail: "dana@coolflow.demo", contactPhone: "+61 2 5550 0101", serviceRegions: ["NSW", "VIC"] },
      { tenantId: T, name: "BrightSpark Electrical", contactName: "Amira Haddad", contactEmail: "office@brightspark.demo", contactPhone: "+61 3 5550 0202", serviceRegions: ["VIC", "QLD"] },
      { tenantId: T, name: "ClearFlow Plumbing", contactName: "Tom Nguyen", contactEmail: "jobs@clearflow.demo", contactPhone: "+61 7 5550 0303", serviceRegions: ["QLD", "NSW"] },
    ])
    .returning();
  const [coolflow, brightspark, clearflow] = contractorRows;
  await db.insert(s.contractorServiceCategories).values([
    { tenantId: T, contractorId: coolflow.id, categoryId: C.HVAC.id },
    { tenantId: T, contractorId: brightspark.id, categoryId: C.ELEC.id },
    { tenantId: T, contractorId: brightspark.id, categoryId: C.GEN.id },
    { tenantId: T, contractorId: clearflow.id, categoryId: C.PLUMB.id },
  ]);

  // --- Memberships & site access -------------------------------------------
  const mem = await db
    .insert(s.memberships)
    .values([
      { tenantId: T, userId: U.admin.id, role: "tenant_admin", allSites: true, canApprove: true },
      { tenantId: T, userId: U.manager.id, role: "facilities_manager", allSites: true },
      { tenantId: T, userId: U.supervisor.id, role: "supervisor" },
      { tenantId: T, userId: U.tech.id, role: "technician" },
      { tenantId: T, userId: U.tech2.id, role: "technician" },
      { tenantId: T, userId: U.contractor.id, role: "contractor_manager", allSites: true, contractorId: coolflow.id },
      { tenantId: T, userId: U.client.id, role: "client_approver" },
      { tenantId: T, userId: U.auditor.id, role: "auditor", allSites: true },
      { tenantId: hb.id, userId: U.admin_hb.id, role: "tenant_admin", allSites: true },
      // The Northstar admin also belongs to the second workspace to demonstrate the workspace switcher.
      { tenantId: hb.id, userId: U.admin.id, role: "auditor", allSites: true },
    ])
    .returning();
  const M = (userId: string) => mem.find((m) => m.userId === userId && m.tenantId === T)!;
  await db.insert(s.siteAccess).values([
    { tenantId: T, membershipId: M(U.supervisor.id).id, siteId: NBP.id },
    { tenantId: T, membershipId: M(U.supervisor.id).id, siteId: RRC.id },
    { tenantId: T, membershipId: M(U.tech.id).id, siteId: NBP.id },
    { tenantId: T, membershipId: M(U.tech.id).id, siteId: RRC.id },
    { tenantId: T, membershipId: M(U.tech2.id).id, siteId: GFC.id },
    { tenantId: T, membershipId: M(U.tech2.id).id, siteId: NBP.id },
    { tenantId: T, membershipId: M(U.client.id).id, siteId: RRC.id },
    { tenantId: T, membershipId: M(U.client.id).id, siteId: NBP.id },
  ]);

  // --- People --------------------------------------------------------------
  const peopleRows = await db
    .insert(s.people)
    .values([
      { tenantId: T, userId: U.tech.id, name: "Jordan Lee", email: "tech@northstar.demo", personType: "technician", homeSiteId: NBP.id, skills: ["Electrical", "HVAC", "General"] },
      { tenantId: T, userId: U.tech2.id, name: "Sam Ortiz", email: "tech2@northstar.demo", personType: "technician", homeSiteId: GFC.id, skills: ["Electrical", "Plumbing"] },
      { tenantId: T, userId: U.supervisor.id, name: "Marcus Bell", email: "supervisor@northstar.demo", personType: "supervisor", homeSiteId: NBP.id, skills: ["Inspections", "Cleaning"] },
      { tenantId: T, userId: U.manager.id, name: "Priya Raman", email: "manager@northstar.demo", personType: "employee", skills: ["Facilities management"] },
      { tenantId: T, userId: U.contractor.id, name: "Dana Fox", email: "dana@coolflow.demo", personType: "contractor_contact", contractorId: coolflow.id, skills: ["HVAC"] },
      { tenantId: T, name: "Leo Park", email: "leo@coolflow.demo", personType: "technician", contractorId: coolflow.id, skills: ["HVAC", "Refrigeration"] },
      { tenantId: T, name: "Amira Haddad", email: "amira@brightspark.demo", personType: "technician", contractorId: brightspark.id, skills: ["Electrical", "Generators"] },
      { tenantId: T, name: "Tom Nguyen", email: "tom@clearflow.demo", personType: "technician", contractorId: clearflow.id, skills: ["Plumbing"] },
      { tenantId: T, userId: U.client.id, name: "Olivia Chen", email: "client@northstar.demo", personType: "client_contact", homeSiteId: RRC.id },
      { tenantId: T, name: "Grace Kim", email: "grace@northstar.demo", personType: "employee", homeSiteId: RRC.id, skills: ["Cleaning", "Waste management"] },
      { tenantId: T, name: "Ben Carter", personType: "employee", homeSiteId: GFC.id, skills: ["Cleaning"], active: false },
    ])
    .returning();
  const P = Object.fromEntries(peopleRows.map((p) => [p.name.split(" ")[0].toLowerCase(), p]));
  await db.insert(s.people).values({ tenantId: hb.id, userId: U.admin_hb.id, name: "Hana Walsh", personType: "employee" });
  await db.update(s.sites).set({ managerPersonId: P.priya.id }).where(eq(s.sites.id, NBP.id));
  await db.update(s.sites).set({ managerPersonId: P.marcus.id }).where(eq(s.sites.id, RRC.id));

  // --- Assets --------------------------------------------------------------
  const d = (days: number) => isoDate(now, days);
  const assetRows = await db
    .insert(s.assets)
    .values([
      { tenantId: T, siteId: NBP.id, code: "NBP-HVAC-01", name: "Rooftop chiller 1", category: "HVAC", assetType: "Chiller", locationText: "Roof plant room", manufacturer: "Polar Systems", model: "PX-400", serialNumber: "PS-88213", installDate: d(-2900), warrantyExpiry: d(-1100), criticality: "critical", condition: "fair", lastServiceAt: d(-80), nextMaintenanceAt: d(-6) },
      { tenantId: T, siteId: NBP.id, code: "NBP-AHU-02", name: "Air handling unit L2", category: "HVAC", assetType: "AHU", locationText: "Level 2 plant room", manufacturer: "Polar Systems", model: "AH-220", installDate: d(-1500), criticality: "high", condition: "good", lastServiceAt: d(-30), nextMaintenanceAt: d(60) },
      { tenantId: T, siteId: NBP.id, code: "NBP-GEN-01", name: "Standby generator", category: "Generator", assetType: "Diesel generator", locationText: "Basement B1", manufacturer: "Volt Dynamics", model: "VD-500", serialNumber: "VD5-0042", installDate: d(-2200), warrantyExpiry: d(120), criticality: "critical", condition: "good", lastServiceAt: d(-20), nextMaintenanceAt: d(70) },
      { tenantId: T, siteId: NBP.id, code: "NBP-FIRE-01", name: "Fire indicator panel", category: "Fire & Safety", assetType: "FIP", locationText: "Ground floor lobby", criticality: "critical", condition: "good", lastServiceAt: d(-25), nextMaintenanceAt: d(5) },
      { tenantId: T, siteId: RRC.id, code: "RRC-HVAC-01", name: "Food court split system", category: "HVAC", assetType: "Split system", locationText: "Food court, east wall", manufacturer: "Breeze Co", model: "BZ-12", installDate: d(-1800), criticality: "medium", condition: "poor", lastServiceAt: d(-120), nextMaintenanceAt: d(-30) },
      { tenantId: T, siteId: RRC.id, code: "RRC-LGT-01", name: "Car park lighting circuit", category: "Lighting", assetType: "LED circuit", locationText: "Car park level P1", criticality: "high", condition: "fair", lastServiceAt: d(-60), nextMaintenanceAt: d(30) },
      { tenantId: T, siteId: RRC.id, code: "RRC-PLB-01", name: "Amenities hot water unit", category: "Plumbing", assetType: "Hot water system", locationText: "Level 1 amenities", manufacturer: "Thermaflow", model: "TF-250", warrantyExpiry: d(400), criticality: "medium", condition: "good", lastServiceAt: d(-45), nextMaintenanceAt: d(45) },
      { tenantId: T, siteId: GFC.id, code: "GFC-HVAC-01", name: "Library chiller", category: "HVAC", assetType: "Chiller", locationText: "Library plant room", manufacturer: "Polar Systems", model: "PX-300", criticality: "high", condition: "good", lastServiceAt: d(-15), nextMaintenanceAt: d(75) },
      { tenantId: T, siteId: GFC.id, code: "GFC-ELEC-01", name: "Main switchboard", category: "Electrical", assetType: "Switchboard", locationText: "Building A substation", criticality: "critical", condition: "fair", lastServiceAt: d(-200), nextMaintenanceAt: d(-10) },
      { tenantId: T, siteId: GFC.id, code: "GFC-FIRE-02", name: "Sprinkler pump set", category: "Fire & Safety", assetType: "Pump", locationText: "Pump room, Building B", criticality: "critical", condition: "good", lastServiceAt: d(-40), nextMaintenanceAt: d(50) },
      { tenantId: T, siteId: GFC.id, code: "GFC-CLN-01", name: "Ride-on floor scrubber", category: "Cleaning Equipment", assetType: "Scrubber", locationText: "Cleaner's store", criticality: "low", condition: "good" },
    ])
    .returning();
  const A = Object.fromEntries(assetRows.map((a) => [a.code, a]));

  // --- Work orders with full histories -------------------------------------
  type Step = "triage" | "assign" | "start" | "ready" | "pass" | "fail" | "approve" | "reject" | "rework" | "close" | "cancel";
  type Spec = {
    title: string;
    description?: string;
    site: typeof NBP;
    asset?: string;
    cat: string;
    priority: "low" | "medium" | "high" | "critical";
    createdDaysAgo: number;
    person?: typeof peopleRows[number];
    contractor?: typeof coolflow;
    steps: Step[];
    /** hours taken from creation to "ready" (drives SLA met/missed) */
    workHours?: number;
    location?: string;
    requester?: typeof U.admin;
    internal?: string;
    checklist?: string[];
  };
  const STEP_STATUS: Record<Step, s.WorkOrderStatus | null> = {
    triage: "triaged",
    assign: "assigned",
    start: "in_progress",
    ready: "ready_for_inspection",
    pass: "pending_approval",
    fail: "rework_required",
    approve: "approved",
    reject: "rework_required",
    rework: "rework_required",
    close: "closed",
    cancel: "cancelled",
  };
  const STEP_EVENT: Record<Step, string> = {
    triage: "status.triage",
    assign: "assigned",
    start: "status.start",
    ready: "status.mark_ready",
    pass: "status.pass_inspection",
    fail: "status.fail_inspection",
    approve: "status.approve",
    reject: "status.reject",
    rework: "status.request_rework",
    close: "status.close",
    cancel: "status.cancel",
  };

  const specs: Spec[] = [
    { title: "Chiller 1 high discharge pressure alarm", description: "BMS alarm on rooftop chiller 1; tenants on L5–L7 report warm conditions.", site: NBP, asset: "NBP-HVAC-01", cat: "HVAC", priority: "critical", createdDaysAgo: 0.2, steps: [] },
    { title: "Replace flickering lights in L3 corridor", site: NBP, cat: "ELEC", priority: "medium", createdDaysAgo: 1, steps: ["triage"], location: "Level 3 east corridor" },
    { title: "Generator monthly load test", site: NBP, asset: "NBP-GEN-01", cat: "GEN", priority: "medium", createdDaysAgo: 2, contractor: brightspark, person: P.amira, steps: ["assign"] },
    { title: "Food court split system not cooling", description: "Food court tenants report the east split system blowing warm air.", site: RRC, asset: "RRC-HVAC-01", cat: "HVAC", priority: "high", createdDaysAgo: 3, contractor: coolflow, person: P.leo, steps: ["assign", "start"], location: "Food court, east wall" },
    { title: "Car park P1 lighting outage — bays 40–58", site: RRC, asset: "RRC-LGT-01", cat: "ELEC", priority: "high", createdDaysAgo: 2.5, person: P.jordan, steps: ["assign", "start"], location: "Car park P1" },
    { title: "Blocked drain in Level 1 amenities", site: RRC, asset: "RRC-PLB-01", cat: "PLUMB", priority: "high", createdDaysAgo: 1.5, person: P.jordan, steps: ["assign", "start", "ready"], workHours: 20, location: "Level 1 amenities", checklist: ["Clear blockage", "Flush and test drainage", "Sanitise area"] },
    { title: "Deep clean of ground floor lobby", site: NBP, cat: "CLEAN", priority: "medium", createdDaysAgo: 3, person: P.jordan, steps: ["assign", "start", "ready", "pass"], workHours: 30, location: "Ground floor lobby" },
    { title: "Repair leaking tap in parents' room", site: RRC, cat: "PLUMB", priority: "medium", createdDaysAgo: 5, person: P.jordan, steps: ["assign", "start", "ready", "pass"], workHours: 50, location: "Parents' room, Level 1" },
    { title: "Fire indicator panel fault — zone 4", site: NBP, asset: "NBP-FIRE-01", cat: "FIRE", priority: "critical", createdDaysAgo: 6, contractor: brightspark, person: P.amira, steps: ["assign", "start", "ready", "pass", "reject", "start"], workHours: 3, location: "Ground floor lobby", internal: "Client queried the replacement detector model; confirm compliant part before resubmitting." },
    { title: "Graffiti removal — loading dock", site: RRC, cat: "CLEAN", priority: "low", createdDaysAgo: 9, person: P.jordan, steps: ["assign", "start", "ready", "fail"], workHours: 40, location: "Loading dock B" },
    { title: "AHU L2 filter replacement", site: NBP, asset: "NBP-AHU-02", cat: "HVAC", priority: "medium", createdDaysAgo: 12, contractor: coolflow, person: P.leo, steps: ["assign", "start", "ready", "pass", "approve"], workHours: 30 },
    { title: "Switchboard thermal scan follow-up", site: GFC, asset: "GFC-ELEC-01", cat: "ELEC", priority: "high", createdDaysAgo: 14, contractor: brightspark, person: P.amira, steps: ["assign", "start", "ready", "pass", "approve", "close"], workHours: 30 },
    { title: "Library chiller quarterly service", site: GFC, asset: "GFC-HVAC-01", cat: "HVAC", priority: "medium", createdDaysAgo: 16, contractor: coolflow, person: P.leo, steps: ["assign", "start", "ready", "pass", "approve", "close"], workHours: 48 },
    { title: "Hot water unit pressure valve replacement", site: RRC, asset: "RRC-PLB-01", cat: "PLUMB", priority: "medium", createdDaysAgo: 18, contractor: clearflow, person: P.tom, steps: ["assign", "start", "ready", "pass", "approve", "close"], workHours: 90 },
    { title: "Sprinkler pump annual test", site: GFC, asset: "GFC-FIRE-02", cat: "FIRE", priority: "high", createdDaysAgo: 21, contractor: brightspark, person: P.amira, steps: ["assign", "start", "ready", "pass", "approve", "close"], workHours: 18 },
    { title: "Lecture theatre spill clean-up", site: GFC, cat: "CLEAN", priority: "low", createdDaysAgo: 24, person: P.sam, steps: ["assign", "start", "ready", "pass", "approve", "close"], workHours: 30 },
    { title: "Replace damaged ceiling tiles — L4 meeting rooms", site: NBP, cat: "GENERAL", priority: "low", createdDaysAgo: 27, person: P.jordan, steps: ["assign", "start", "ready", "fail", "start", "ready", "pass", "approve", "close"], workHours: 200 },
    { title: "Escalator handrail inspection", site: RRC, cat: "GENERAL", priority: "medium", createdDaysAgo: 30, person: P.jordan, steps: ["assign", "start", "ready", "pass", "rework", "start", "ready", "pass", "approve", "close"], workHours: 60 },
    { title: "Rooftop chiller condenser coil clean", site: NBP, asset: "NBP-HVAC-01", cat: "HVAC", priority: "high", createdDaysAgo: 35, contractor: coolflow, person: P.leo, steps: ["assign", "start", "ready", "pass", "approve", "close"], workHours: 30 },
    { title: "Duplicate request — lobby lights", site: NBP, cat: "ELEC", priority: "low", createdDaysAgo: 8, steps: ["cancel"] },
    { title: "Waste bin replacement — food court", site: RRC, cat: "CLEAN", priority: "low", createdDaysAgo: 40, person: P.jordan, steps: ["assign", "start", "ready", "pass", "approve", "close"], workHours: 100 },
    { title: "Campus irrigation timer fault", site: GFC, cat: "PLUMB", priority: "medium", createdDaysAgo: 6, person: P.sam, steps: ["assign"], location: "Main quad" },
  ];

  const ACTOR: Record<Step, string> = {
    triage: U.manager.id,
    assign: U.manager.id,
    start: U.tech.id,
    ready: U.tech.id,
    pass: U.supervisor.id,
    fail: U.supervisor.id,
    approve: U.client.id,
    reject: U.client.id,
    rework: U.client.id,
    close: U.manager.id,
    cancel: U.manager.id,
  };
  const REASONS: Partial<Record<Step, string>> = {
    fail: "Finish is incomplete — residue still visible on the surface. Please redo.",
    reject: "Replacement detector is not the model specified in the site fire plan.",
    rework: "Handrail tension still out of tolerance on the north escalator.",
    cancel: "Duplicate of an existing request.",
  };

  let seq = 1000;
  const woIds: Record<string, string> = {};
  for (const spec of specs) {
    seq++;
    const created = at(-spec.createdDaysAgo * DAY);
    const due = new Date(created.getTime() + slaHours[spec.priority] * HOUR);
    const steps = spec.steps;
    // Spread steps between creation and "ready" time, then post-ready steps a few hours apart.
    const readyAt = new Date(created.getTime() + (spec.workHours ?? 24) * HOUR);
    const maxTime = Math.min(now.getTime() - 5 * 60_000, readyAt.getTime() + steps.length * 6 * HOUR);
    const times: Date[] = [];
    let t = created.getTime();
    const firstReady = steps.indexOf("ready");
    steps.forEach((step, i) => {
      if (step === "ready" && i === firstReady) t = Math.max(readyAt.getTime(), t + HOUR);
      else t = t + Math.max(10 * 60_000, (step === "assign" || step === "triage" ? 0.5 : 4) * HOUR);
      times.push(new Date(Math.min(t, maxTime - (steps.length - i) * 60_000)));
    });

    let status: s.WorkOrderStatus = "new";
    const patch: Partial<typeof s.workOrders.$inferInsert> = {};
    let rework = 0;
    steps.forEach((step, i) => {
      status = STEP_STATUS[step] ?? status;
      if (step === "start" && !patch.startedAt) patch.startedAt = times[i];
      if (step === "ready") patch.completedAt = times[i];
      if (step === "pass") patch.submittedForApprovalAt = times[i];
      if (step === "approve") patch.approvedAt = times[i];
      if (step === "close") patch.closedAt = times[i];
      if (step === "cancel") patch.cancelledAt = times[i];
      if (STEP_STATUS[step] === "rework_required") rework++;
    });
    const assigned = steps.includes("assign");
    const [wo] = await db
      .insert(s.workOrders)
      .values({
        tenantId: T,
        workOrderNumber: seq,
        title: spec.title,
        description: spec.description ?? null,
        siteId: spec.site.id,
        assetId: spec.asset ? A[spec.asset].id : null,
        categoryId: C[spec.cat].id,
        locationText: spec.location ?? (spec.asset ? A[spec.asset].locationText : null),
        priority: spec.priority,
        status,
        requesterUserId: (spec.requester ?? U.manager).id,
        assigneePersonId: assigned ? (spec.person?.id ?? null) : null,
        contractorId: assigned ? (spec.contractor?.id ?? spec.person?.contractorId ?? null) : null,
        dueAt: due,
        reworkCount: rework,
        internalNotes: spec.internal ?? null,
        clientVisibleSummary: steps.includes("pass") ? "Work completed and checked by the site supervisor." : null,
        estimatedCost: ["critical", "high"].includes(spec.priority) ? "850.00" : "240.00",
        actualCost: steps.includes("close") ? (["critical", "high"].includes(spec.priority) ? "910.00" : "220.00") : null,
        createdAt: created,
        updatedAt: times.at(-1) ?? created,
        ...patch,
      })
      .returning();
    woIds[spec.title] = wo.id;

    const checklist = spec.checklist ?? ns.settings.defaultChecklist;
    const passedReady = firstReady >= 0;
    const lastStatus = status as s.WorkOrderStatus;
    await db.insert(s.workOrderChecklistItems).values(
      checklist.map((label, i) => {
        const done = passedReady && lastStatus !== "in_progress" ? true : lastStatus === "in_progress" && i === 0;
        return {
          tenantId: T,
          workOrderId: wo.id,
          label,
          position: i,
          done,
          completedByUserId: done ? U.tech.id : null,
          completedAt: done ? (patch.completedAt ?? patch.startedAt ?? created) : null,
          createdAt: created,
        };
      }),
    );

    const events: (typeof s.workOrderEvents.$inferInsert)[] = [
      { tenantId: T, workOrderId: wo.id, actorUserId: (spec.requester ?? U.manager).id, type: "created", toStatus: "new", data: { title: wo.title, priority: wo.priority }, createdAt: created },
    ];
    let prev: s.WorkOrderStatus = "new";
    steps.forEach((step, i) => {
      const to = STEP_STATUS[step]!;
      const actor = step === "start" || step === "ready" ? (spec.person?.userId ?? U.contractor.id) : ACTOR[step];
      events.push({
        tenantId: T,
        workOrderId: wo.id,
        actorUserId: actor,
        type: STEP_EVENT[step],
        fromStatus: prev,
        toStatus: to,
        data: step === "assign" ? { personName: spec.person?.name ?? null, contractorId: spec.contractor?.id ?? null } : REASONS[step] ? { reason: REASONS[step] } : {},
        createdAt: times[i],
      });
      prev = to;
    });
    await db.insert(s.workOrderEvents).values(events);

    if (assigned) {
      await db.insert(s.workOrderAssignments).values({
        tenantId: T,
        workOrderId: wo.id,
        personId: spec.person?.id ?? null,
        contractorId: spec.contractor?.id ?? spec.person?.contractorId ?? null,
        assignedByUserId: U.manager.id,
        assignedAt: times[steps.indexOf("assign")],
      });
    }
    const decisions = steps
      .map((step, i) => ({ step, i }))
      .filter(({ step }) => step === "approve" || step === "reject" || step === "rework")
      .map(({ step, i }) => ({
        tenantId: T,
        workOrderId: wo.id,
        approverUserId: U.client.id,
        decision: (step === "approve" ? "approved" : step === "reject" ? "rejected" : "rework_requested") as "approved" | "rejected" | "rework_requested",
        reason: step === "approve" ? "Work verified against photos and checklist." : REASONS[step]!,
        createdAt: times[i],
      }));
    if (decisions.length) await db.insert(s.approvalDecisions).values(decisions);
    if (passedReady) {
      await db.insert(s.workOrderComments).values({
        tenantId: T,
        workOrderId: wo.id,
        authorUserId: spec.person?.userId ?? U.supervisor.id,
        body: "Work completed. Area left clean and safe; photos to follow.",
        createdAt: patch.completedAt ?? created,
      });
    }
  }
  await db.update(s.tenants).set({ workOrderSeq: seq }).where(eq(s.tenants.id, T));
  await db.insert(s.workOrders).values({ tenantId: hb.id, workOrderNumber: 5001, title: "Harbourline lobby door closer adjustment", siteId: hbSite.id, priority: "low", dueAt: at(5 * DAY) });
  await db.update(s.tenants).set({ workOrderSeq: 5001 }).where(eq(s.tenants.id, hb.id));

  // --- Compliance ----------------------------------------------------------
  const verified = { verificationStatus: "verified" as const, verifiedByUserId: U.admin.id, verifiedAt: at(-10 * DAY) };
  await db.insert(s.complianceItems).values([
    { tenantId: T, name: "Public Liability Insurance", itemType: "insurance", subjectType: "contractor", contractorId: coolflow.id, issuer: "Example Mutual Insurance", referenceNumber: "PL-2026-1182", issueDate: d(-165), expiryDate: d(200), ...verified },
    { tenantId: T, name: "Public Liability Insurance", itemType: "insurance", subjectType: "contractor", contractorId: brightspark.id, issuer: "Sample Underwriters", referenceNumber: "PL-55-0091", issueDate: d(-347), expiryDate: d(18), ...verified },
    { tenantId: T, name: "Public Liability Insurance", itemType: "insurance", subjectType: "contractor", contractorId: clearflow.id, issuer: "Sample Underwriters", referenceNumber: "PL-55-0477", issueDate: d(-370), expiryDate: d(-5), ...verified, notes: "Renewal requested from contractor." },
    { tenantId: T, name: "Electrical Licence", itemType: "licence", subjectType: "person", personId: P.jordan.id, issuer: "Electrical Licensing Authority (fictional)", referenceNumber: "EL-DEMO-1001", issueDate: d(-300), expiryDate: d(430), ...verified },
    { tenantId: T, name: "Electrical Licence", itemType: "licence", subjectType: "person", personId: P.sam.id, issuer: "Electrical Licensing Authority (fictional)", referenceNumber: "EL-DEMO-1002", issueDate: d(-1115), expiryDate: d(-20), ...verified },
    { tenantId: T, name: "Electrical Licence", itemType: "licence", subjectType: "person", personId: P.amira.id, issuer: "Electrical Licensing Authority (fictional)", referenceNumber: "EL-DEMO-1003", issueDate: d(-200), expiryDate: d(530), ...verified },
    { tenantId: T, name: "Refrigerant Handling Licence", itemType: "licence", subjectType: "person", personId: P.leo.id, issuer: "Refrigerant Board (fictional)", expiryDate: d(45), ...verified },
    { tenantId: T, name: "Annual Fire Safety Statement", itemType: "certification", subjectType: "site", siteId: RRC.id, issuer: "Fire Services Certifier (fictional)", issueDate: d(-340), expiryDate: d(25), ...verified },
    { tenantId: T, name: "Emergency Evacuation Procedure", itemType: "site_procedure", subjectType: "site", siteId: NBP.id, issueDate: d(-20), expiryDate: d(345) },
    { tenantId: T, name: "SWMS — Working at Heights", itemType: "safety_document", subjectType: "organization", issueDate: d(-90), ...verified },
    { tenantId: T, name: "Generator Emissions Permit", itemType: "permit", subjectType: "asset", assetId: A["NBP-GEN-01"].id, issuer: "Environment Agency (fictional)", expiryDate: d(75), ...verified },
  ]);
  await db.insert(s.complianceItems).values({ tenantId: hb.id, name: "Harbourline Building Warrant", itemType: "certification", subjectType: "organization", expiryDate: d(10) });

  // --- Inspections ---------------------------------------------------------
  const [cleanTpl, hvacTpl] = await db
    .insert(s.inspectionTemplates)
    .values([
      { tenantId: T, name: "Washroom & Amenities Clean Audit", category: "Cleaning", serviceType: "Commercial cleaning" },
      { tenantId: T, name: "HVAC Plant Room Check", category: "Maintenance", serviceType: "HVAC" },
    ])
    .returning();
  const cleanItems = await db
    .insert(s.inspectionTemplateItems)
    .values([
      { tenantId: T, templateId: cleanTpl.id, position: 0, prompt: "Floors clean, dry and free of debris", answerType: "pass_fail", requiresEvidence: true },
      { tenantId: T, templateId: cleanTpl.id, position: 1, prompt: "Basins, taps and mirrors clean", answerType: "pass_fail" },
      { tenantId: T, templateId: cleanTpl.id, position: 2, prompt: "Consumables (soap, paper) fully stocked", answerType: "pass_fail" },
      { tenantId: T, templateId: cleanTpl.id, position: 3, prompt: "No leaks or plumbing faults visible", answerType: "pass_fail" },
      { tenantId: T, templateId: cleanTpl.id, position: 4, prompt: "Overall presentation", answerType: "score", maxScore: 5 },
    ])
    .returning();
  const hvacItems = await db
    .insert(s.inspectionTemplateItems)
    .values([
      { tenantId: T, templateId: hvacTpl.id, position: 0, prompt: "Plant room access clear and signage in place", answerType: "pass_fail" },
      { tenantId: T, templateId: hvacTpl.id, position: 1, prompt: "No abnormal noise or vibration", answerType: "pass_fail" },
      { tenantId: T, templateId: hvacTpl.id, position: 2, prompt: "Filters within service interval", answerType: "pass_fail" },
      { tenantId: T, templateId: hvacTpl.id, position: 3, prompt: "Condensate drains clear", answerType: "pass_fail" },
      { tenantId: T, templateId: hvacTpl.id, position: 4, prompt: "General condition", answerType: "score", maxScore: 5 },
    ])
    .returning();

  type RunSpec = { tpl: typeof cleanTpl; items: typeof cleanItems; site: typeof NBP; daysAgo: number; values: ("pass" | "fail" | "na")[]; score: number; status: s.InspectionStatus; wo?: string };
  const runs: RunSpec[] = [
    { tpl: cleanTpl, items: cleanItems, site: NBP, daysAgo: 20, values: ["pass", "pass", "pass", "pass"], score: 5, status: "passed" },
    { tpl: cleanTpl, items: cleanItems, site: RRC, daysAgo: 4, values: ["fail", "pass", "pass", "fail"], score: 2, status: "failed" },
    { tpl: hvacTpl, items: hvacItems, site: NBP, daysAgo: 12, values: ["pass", "pass", "pass", "pass"], score: 4, status: "passed", wo: "AHU L2 filter replacement" },
    { tpl: hvacTpl, items: hvacItems, site: GFC, daysAgo: 15, values: ["pass", "pass", "pass", "pass"], score: 5, status: "passed", wo: "Library chiller quarterly service" },
    { tpl: cleanTpl, items: cleanItems, site: GFC, daysAgo: 8, values: ["pass", "pass", "fail", "pass"], score: 3, status: "failed" },
    { tpl: hvacTpl, items: hvacItems, site: RRC, daysAgo: 0.5, values: ["pass", "pass"], score: 0, status: "in_progress" },
  ];
  for (const r of runs) {
    const startedAt = at(-r.daysAgo * DAY);
    const done = r.status !== "in_progress";
    const passCount = r.values.filter((v) => v === "pass").length;
    const score = done ? Math.round(((passCount + r.score) / (r.values.length + 5)) * 1000) / 10 : null;
    const [run] = await db
      .insert(s.inspectionRuns)
      .values({
        tenantId: T,
        templateId: r.tpl.id,
        siteId: r.site.id,
        workOrderId: r.wo ? woIds[r.wo] : null,
        inspectorUserId: U.supervisor.id,
        status: r.status,
        score: score?.toString() ?? null,
        startedAt,
        submittedAt: done ? new Date(startedAt.getTime() + HOUR) : null,
        signedOffByName: done ? "Marcus Bell" : null,
        createdAt: startedAt,
      })
      .returning();
    await db.insert(s.inspectionAnswers).values([
      ...r.values.map((value, i) => ({ tenantId: T, runId: run.id, templateItemId: r.items[i].id, value })),
      ...(done ? [{ tenantId: T, runId: run.id, templateItemId: r.items[4].id, score: r.score }] : []),
    ]);
    if (r.status === "failed" && r.site.id === RRC.id) {
      await db.insert(s.inspectionDefects).values([
        { tenantId: T, runId: run.id, templateItemId: r.items[0].id, description: "Wet floor near basins with no warning sign — slip hazard", severity: "high", locationText: "Level 1 amenities, female washroom", createdByUserId: U.supervisor.id, createdAt: startedAt },
        { tenantId: T, runId: run.id, templateItemId: r.items[3].id, description: "Drain blocked under basin 3", severity: "medium", locationText: "Level 1 amenities", linkedWorkOrderId: woIds["Blocked drain in Level 1 amenities"], createdByUserId: U.supervisor.id, createdAt: startedAt },
      ]);
    }
    if (r.status === "failed" && r.site.id === GFC.id) {
      await db.insert(s.inspectionDefects).values({ tenantId: T, runId: run.id, templateItemId: r.items[2].id, description: "Paper towel dispensers empty in Building A washrooms", severity: "low", locationText: "Building A, ground floor", createdByUserId: U.supervisor.id, createdAt: startedAt });
    }
  }

  // --- Notifications & audit -----------------------------------------------
  await db.insert(s.notifications).values([
    { tenantId: T, userId: U.client.id, type: "approval.requested", title: "WO-1007 awaiting your approval", body: "Deep clean of ground floor lobby", link: `/work-orders/${woIds["Deep clean of ground floor lobby"]}`, createdAt: at(-HOUR) },
    { tenantId: T, userId: U.client.id, type: "approval.requested", title: "WO-1008 awaiting your approval", body: "Repair leaking tap in parents' room", link: `/work-orders/${woIds["Repair leaking tap in parents' room"]}`, createdAt: at(-2 * HOUR) },
    { tenantId: T, userId: U.tech.id, type: "work_order.assigned", title: "WO-1005 assigned to you", body: "Car park P1 lighting outage — bays 40–58", link: `/work-orders/${woIds["Car park P1 lighting outage — bays 40–58"]}`, createdAt: at(-2 * DAY) },
    { tenantId: T, userId: U.manager.id, type: "work_order.created", title: "WO-1001 created", body: "Chiller 1 high discharge pressure alarm (critical)", link: `/work-orders/${woIds["Chiller 1 high discharge pressure alarm"]}`, createdAt: at(-0.2 * DAY) },
  ]);
  await db.insert(s.auditLogs).values({ tenantId: T, actorUserId: U.admin.id, action: "tenant.seeded", entityType: "tenant", entityId: T, data: { note: "Demo data loaded" } });

  return { northstarId: T, harbourlineId: hb.id };
}

async function main() {
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_DEMO_SEED !== "true") {
    throw new Error("Refusing to seed demo data in production. Set ALLOW_DEMO_SEED=true on a dedicated demo instance.");
  }
  await runMigrations();
  const db = getDb();
  const reset = process.argv.includes("--reset");
  const [existing] = await db.select({ id: s.tenants.id }).from(s.tenants).where(eq(s.tenants.slug, "northstar"));
  if (existing && !reset) {
    console.log("Demo tenant already exists. Run `npm run db:reset` to delete demo tenants and reseed.");
    return;
  }
  await db.transaction(async (tx) => {
    if (reset) await resetDemoData(tx);
    await seedDemo(tx);
  });
  console.log(`Demo data seeded. Sign in with any demo account, password: ${DEMO_PASSWORD}`);
  for (const a of DEMO_ACCOUNTS) console.log(`  ${a.label.padEnd(30)} ${a.email}`);
}

if (process.argv[1]?.endsWith("seed.ts")) {
  main()
    .catch((err) => {
      console.error(err);
      process.exitCode = 1;
    })
    .finally(() => closeDb());
}
