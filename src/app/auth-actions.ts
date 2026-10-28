"use server";

import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb } from "@/db";
import { sessions, users } from "@/db/schema";
import { hashPassword, validatePasswordStrength, verifyPassword } from "@/lib/auth/password";
import { createSession, destroySession, findUserByEmail, getContext, switchTenant } from "@/lib/auth/session";
import { AppError, type ActionResult } from "@/lib/errors";
import { rateLimit } from "@/lib/rate-limit";

const GENERIC = "Incorrect email or password.";

async function clientIp() {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "local";
}

export async function signInAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const parsed = z.object({ email: z.email(), password: z.string().min(1).max(200) }).safeParse({ email: fd.get("email"), password: fd.get("password") });
  if (!parsed.success) return { ok: false, error: "Enter your email and password." };
  const email = parsed.data.email.toLowerCase().trim();
  try {
    rateLimit(`signin:ip:${await clientIp()}`, 20, 15 * 60_000);
    rateLimit(`signin:email:${email}`, 8, 15 * 60_000);
  } catch (e) {
    return { ok: false, error: (e as AppError).message, code: "RATE_LIMITED" };
  }
  const user = await findUserByEmail(email);
  // Always run a hash comparison so timing does not reveal whether the account exists.
  const ok = await verifyPassword(parsed.data.password, user?.passwordHash ?? "scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAA");
  if (!user || !ok) return { ok: false, error: GENERIC };
  await createSession(user.id, null);
  await getDb().update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
  const next = String(fd.get("next") ?? "");
  redirect(user.mustChangePassword ? "/change-password" : next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard");
}

export async function signOutAction() {
  await destroySession();
  redirect("/sign-in");
}

export async function switchTenantAction(fd: FormData) {
  const id = String(fd.get("tenantId") ?? "");
  if (z.uuid().safeParse(id).success) await switchTenant(id);
  redirect("/dashboard");
}

export async function changePasswordAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const ctx = await getContext();
  if (!ctx) return { ok: false, error: "Your session has expired. Please sign in again." };
  const current = String(fd.get("current") ?? "");
  const next = String(fd.get("next") ?? "");
  if (next !== String(fd.get("confirm") ?? "")) return { ok: false, error: "Passwords do not match.", fieldErrors: { confirm: "Passwords do not match" } };
  const weak = validatePasswordStrength(next);
  if (weak) return { ok: false, error: weak, fieldErrors: { next: weak } };
  const [user] = await getDb().select().from(users).where(eq(users.id, ctx.userId));
  if (!(await verifyPassword(current, user.passwordHash))) return { ok: false, error: "Current password is incorrect.", fieldErrors: { current: "Incorrect" } };
  await getDb().update(users).set({ passwordHash: await hashPassword(next), mustChangePassword: false, updatedAt: new Date() }).where(eq(users.id, ctx.userId));
  // Invalidate every other session, then start a fresh one.
  await getDb().delete(sessions).where(eq(sessions.userId, ctx.userId));
  await createSession(ctx.userId, ctx.tenantId);
  redirect("/dashboard");
}
