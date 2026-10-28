import "dotenv/config";
import { randomBytes } from "node:crypto";
import { parseArgs } from "node:util";
import { eq } from "drizzle-orm";
import { closeDb, getDb } from "./index";
import { runMigrations } from "./migrate";
import * as s from "./schema";
import { hashPassword } from "@/lib/auth/password";

/**
 * Provision a real (non-demo) tenant with default categories, SLA presets and a first admin.
 *   npm run tenant:create -- --name "Acme Facilities" --slug acme --admin-email ops@acme.com --admin-name "Jo Smith" --timezone Australia/Sydney
 * Prints a one-time temporary password; the admin must change it at first sign-in.
 */
async function main() {
  const { values } = parseArgs({
    options: {
      name: { type: "string" },
      slug: { type: "string" },
      "admin-email": { type: "string" },
      "admin-name": { type: "string" },
      timezone: { type: "string", default: "UTC" },
      country: { type: "string" },
    },
  });
  const name = values.name?.trim();
  const email = values["admin-email"]?.trim().toLowerCase();
  const adminName = values["admin-name"]?.trim();
  if (!name || !email || !adminName) throw new Error('Usage: npm run tenant:create -- --name "Acme" --admin-email a@b.com --admin-name "Jo Smith" [--slug acme] [--timezone Australia/Sydney]');
  new Intl.DateTimeFormat("en", { timeZone: values.timezone }); // throws on an unknown zone
  const slug = (values.slug ?? name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  await runMigrations();
  const db = getDb();
  const result = await db.transaction(async (tx) => {
    const [tenant] = await tx.insert(s.tenants).values({ name, slug, timezone: values.timezone!, country: values.country, isDemo: false }).returning();
    let [user] = await tx.select().from(s.users).where(eq(s.users.email, email));
    let tempPassword: string | null = null;
    if (!user) {
      tempPassword = `Ks-${randomBytes(9).toString("base64url")}1`;
      [user] = await tx.insert(s.users).values({ email, name: adminName, passwordHash: await hashPassword(tempPassword), mustChangePassword: true }).returning();
    }
    await tx.insert(s.memberships).values({ tenantId: tenant.id, userId: user.id, role: "tenant_admin", allSites: true, canApprove: true });
    await tx.insert(s.workCategories).values(
      [
        ["HVAC", "HVAC", null],
        ["ELEC", "Electrical", "Electrical Licence"],
        ["PLUMB", "Plumbing", null],
        ["FIRE", "Fire & Safety", null],
        ["CLEAN", "Cleaning", null],
        ["GENERAL", "General maintenance", null],
      ].map(([code, n, cred]) => ({ tenantId: tenant.id, code: code!, name: n!, requiredCredential: cred })),
    );
    await tx.insert(s.slaPolicies).values([
      { tenantId: tenant.id, priority: "critical", responseHours: 1, resolutionHours: 4 },
      { tenantId: tenant.id, priority: "high", responseHours: 4, resolutionHours: 24 },
      { tenantId: tenant.id, priority: "medium", responseHours: 24, resolutionHours: 72 },
      { tenantId: tenant.id, priority: "low", responseHours: 48, resolutionHours: 168 },
    ]);
    await tx.insert(s.auditLogs).values({ tenantId: tenant.id, actorUserId: null, action: "tenant.created", entityType: "tenant", entityId: tenant.id, data: { via: "cli", admin: email } });
    return { tenant, tempPassword };
  });
  console.log(`Created tenant "${result.tenant.name}" (${result.tenant.slug}).`);
  console.log(result.tempPassword ? `Admin ${email} temporary password: ${result.tempPassword}  (shown once; must be changed at first sign-in)` : `Existing user ${email} added as Tenant Admin.`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
