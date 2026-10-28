import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auditLogs, memberships, userIdentities, users } from "@/db/schema";
import { resolveGoogleUser } from "@/lib/auth/google";
import { closeDb, db, freshDemo } from "../helpers";

beforeAll(freshDemo);
afterAll(() => closeDb());

const userByEmail = async (email: string) => (await db().select().from(users).where(eq(users.email, email)))[0];
const code = async (p: Promise<unknown>) => p.then(() => "ok", (e) => (e as { code?: string }).code);

describe("Google sign-in account matching", () => {
  it("links an invited user by verified email on first sign-in, then by Google ID", async () => {
    const tech = await userByEmail("tech@northstar.demo");
    expect(await resolveGoogleUser(db(), { sub: "g-tech-1", email: "tech@northstar.demo", name: "Jordan" })).toBe(tech.id);
    const links = await db().select().from(userIdentities).where(eq(userIdentities.userId, tech.id));
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({ provider: "google", subject: "g-tech-1" });
    const audit = await db().select().from(auditLogs).where(and(eq(auditLogs.action, "auth.google_linked"), eq(auditLogs.entityId, tech.id)));
    expect(audit.length).toBeGreaterThan(0);

    // Later sign-ins match on the stable Google ID even if the Google email changes.
    expect(await resolveGoogleUser(db(), { sub: "g-tech-1", email: "jordan.new@example.com", name: "Jordan" })).toBe(tech.id);
    expect(await db().select().from(userIdentities).where(eq(userIdentities.userId, tech.id))).toHaveLength(1);
  });

  it("never creates accounts for unknown emails", async () => {
    expect(await code(resolveGoogleUser(db(), { sub: "g-stranger", email: "stranger@gmail.example", name: "Stranger" }))).toBe("no_account");
    expect(await userByEmail("stranger@gmail.example")).toBeUndefined();
    expect(await db().select().from(userIdentities).where(eq(userIdentities.subject, "g-stranger"))).toHaveLength(0);
  });

  it("refuses users whose workspace access is disabled", async () => {
    const auditor = await userByEmail("auditor@northstar.demo");
    await db().update(memberships).set({ status: "disabled" }).where(eq(memberships.userId, auditor.id));
    expect(await code(resolveGoogleUser(db(), { sub: "g-auditor", email: "auditor@northstar.demo", name: "Ken" }))).toBe("no_access");
    expect(await db().select().from(userIdentities).where(eq(userIdentities.subject, "g-auditor"))).toHaveLength(0);
  });
});
