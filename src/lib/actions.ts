import "server-only";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import type { AuthContext } from "@/lib/auth/context";
import { getContext } from "@/lib/auth/session";
import { toActionError, type ActionResult } from "@/lib/errors";

/**
 * Wrap a server action: resolve the session server-side (never trust client-supplied identity),
 * run the domain call, convert errors to safe results, revalidate and optionally redirect.
 */
export async function runAction<T>(
  fn: (ctx: AuthContext, db: ReturnType<typeof getDb>) => Promise<T>,
  opts: { revalidate?: string[]; redirectTo?: (result: T) => string; message?: string | ((r: T) => string) } = {},
): Promise<ActionResult> {
  const ctx = await getContext();
  if (!ctx) return { ok: false, error: "Your session has expired. Please sign in again.", code: "UNAUTHENTICATED" };
  let result: T;
  try {
    result = await fn(ctx, getDb());
  } catch (err) {
    return toActionError(err);
  }
  for (const p of opts.revalidate ?? []) revalidatePath(p, "layout");
  if (opts.redirectTo) redirect(opts.redirectTo(result));
  return { ok: true, message: typeof opts.message === "function" ? opts.message(result) : opts.message, data: undefined };
}

/** FormData → plain object. Repeated keys become arrays; listed keys are always arrays. */
export function formToObject(fd: FormData, arrayKeys: string[] = []): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of new Set(fd.keys())) {
    if (key.startsWith("$ACTION")) continue;
    const all = fd.getAll(key).filter((v) => typeof v === "string") as string[];
    out[key] = arrayKeys.includes(key) || all.length > 1 ? all : all[0];
  }
  for (const k of arrayKeys) out[k] ??= [];
  return out;
}

export const lines = (v: unknown) =>
  String(v ?? "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
