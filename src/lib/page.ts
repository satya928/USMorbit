import "server-only";
import { notFound, redirect } from "next/navigation";
import { can, type AuthContext } from "@/lib/auth/context";
import type { Permission } from "@/lib/authz/permissions";
import { AppError } from "@/lib/errors";

/** Map domain errors to the right page: 404 for missing/out-of-scope records, a 403 page otherwise. */
export async function load<T>(p: Promise<T>): Promise<T> {
  try {
    return await p;
  } catch (e) {
    if (e instanceof AppError && e.code === "NOT_FOUND") notFound();
    if (e instanceof AppError && e.code === "FORBIDDEN") redirect("/forbidden");
    throw e;
  }
}

export function requirePagePerm(ctx: AuthContext, ...perms: Permission[]) {
  if (!perms.some((p) => can(ctx, p))) redirect("/forbidden");
}

export type SearchParams = Promise<Record<string, string | string[] | undefined>>;
export const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;

export function qs(base: Record<string, string | undefined>, patch: Record<string, string | number | undefined> = {}) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...base, ...patch })) if (v !== undefined && v !== "") p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : "";
}
