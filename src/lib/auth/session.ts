import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getDb } from "@/db";
import { memberships, sessions, tenants, users } from "@/db/schema";
import { loadContext, type AuthContext } from "./context";

export const SESSION_COOKIE = "orbit_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export async function createSession(userId: string, tenantId: string | null) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await getDb().insert(sessions).values({ id: hashToken(token), userId, tenantId, expiresAt });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    // Secure by default in production; COOKIE_SECURE=false only for local HTTP testing of a production build.
    secure: process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === "true" : process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await getDb().delete(sessions).where(eq(sessions.id, hashToken(token)));
  jar.delete(SESSION_COOKIE);
}

const getSessionRow = cache(async () => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const [row] = await getDb()
    .select({ id: sessions.id, userId: sessions.userId, tenantId: sessions.tenantId })
    .from(sessions)
    .where(and(eq(sessions.id, hashToken(token)), gt(sessions.expiresAt, new Date())))
    .limit(1);
  return row ?? null;
});

/** Resolve the current user's tenant context, or null when signed out / without an active membership. */
export const getContext = cache(async (): Promise<AuthContext | null> => {
  const s = await getSessionRow();
  if (!s) return null;
  const db = getDb();
  let tenantId = s.tenantId;
  if (!tenantId) {
    const [m] = await db
      .select({ tenantId: memberships.tenantId })
      .from(memberships)
      .where(and(eq(memberships.userId, s.userId), eq(memberships.status, "active")))
      .limit(1);
    if (!m) return null;
    tenantId = m.tenantId;
  }
  return loadContext(db, s.userId, tenantId);
});

/** For server components/pages: redirect to sign-in when there is no valid session. */
export async function requireContext(): Promise<AuthContext> {
  const ctx = await getContext();
  if (!ctx) redirect("/sign-in");
  return ctx;
}

export async function switchTenant(tenantId: string): Promise<boolean> {
  const s = await getSessionRow();
  if (!s) return false;
  const ctx = await loadContext(getDb(), s.userId, tenantId);
  if (!ctx) return false;
  await getDb().update(sessions).set({ tenantId }).where(eq(sessions.id, s.id));
  return true;
}

export async function listUserTenants(userId: string) {
  return getDb()
    .select({ id: tenants.id, name: tenants.name, role: memberships.role })
    .from(memberships)
    .innerJoin(tenants, eq(tenants.id, memberships.tenantId))
    .where(and(eq(memberships.userId, userId), eq(memberships.status, "active")));
}

export async function findUserByEmail(email: string) {
  const [u] = await getDb().select().from(users).where(eq(users.email, email.toLowerCase().trim())).limit(1);
  return u ?? null;
}
