import { and, eq } from "drizzle-orm";
import { closeDb, getDb } from "@/db";
import { runMigrations } from "@/db/migrate";
import { memberships, tenants, users } from "@/db/schema";
import { resetDemoData, seedDemo } from "@/db/seed";
import { loadContext, type AuthContext } from "@/lib/auth/context";

export const db = () => getDb();

export async function freshDemo() {
  await runMigrations();
  await getDb().transaction(async (tx) => {
    await resetDemoData(tx);
    await seedDemo(tx);
  });
}

export async function ctxFor(email: string, tenantSlug = "northstar"): Promise<AuthContext> {
  const [u] = await getDb().select().from(users).where(eq(users.email, email));
  const [t] = await getDb().select().from(tenants).where(eq(tenants.slug, tenantSlug));
  const [m] = await getDb().select().from(memberships).where(and(eq(memberships.userId, u.id), eq(memberships.tenantId, t.id)));
  if (!m) throw new Error(`${email} has no membership in ${tenantSlug}`);
  const ctx = await loadContext(getDb(), u.id, t.id);
  if (!ctx) throw new Error("no context");
  return ctx;
}

export async function expectCode(p: Promise<unknown>, code: string) {
  try {
    await p;
  } catch (e) {
    const actual = (e as { code?: string }).code;
    if (actual !== code) throw new Error(`Expected ${code} but got ${actual}: ${(e as Error).message}`);
    return e as Error;
  }
  throw new Error(`Expected ${code} but the call succeeded`);
}

export { closeDb };
