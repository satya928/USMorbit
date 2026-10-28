import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/db";
import { appBaseUrl, safeNextPath } from "@/lib/auth/app-url";
import { exchangeCode, GoogleAuthError, googleConfig, resolveGoogleUser, safeEqual, validateIdToken } from "@/lib/auth/google";
import { createSession } from "@/lib/auth/session";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
const OAUTH_COOKIE = "usm_google_oauth";

/** Step 2: Google redirects back here with a one-time code. */
export async function GET(req: NextRequest) {
  const base = appBaseUrl(req);
  const fail = (code: string) => {
    const res = NextResponse.redirect(new URL(`/sign-in?error=${code}`, base));
    res.cookies.delete({ name: OAUTH_COOKIE, path: "/api/auth/google" });
    return res;
  };

  const cfg = googleConfig();
  if (!cfg) return fail("google_disabled");
  try {
    rateLimit(`google:${req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local"}`, 30, 15 * 60_000);
  } catch {
    return fail("google_failed");
  }

  const params = req.nextUrl.searchParams;
  if (params.get("error")) return fail("google_cancelled");
  const code = params.get("code");
  const state = params.get("state");
  let saved: { s: string; n: string; v: string; next: string } | null = null;
  try {
    const raw = req.cookies.get(OAUTH_COOKIE)?.value;
    saved = raw ? JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) : null;
  } catch {
    saved = null;
  }
  if (!code || !state || !saved?.s || !safeEqual(state, saved.s)) return fail("google_state");

  try {
    const idToken = await exchangeCode(cfg, code, saved.v, `${base}/api/auth/google/callback`);
    const claims = validateIdToken(idToken, cfg, saved.n);
    const userId = await resolveGoogleUser(getDb(), claims);
    await createSession(userId, null);
  } catch (e) {
    if (e instanceof GoogleAuthError) return fail(e.code);
    console.error("[orbit] google sign-in error", e instanceof Error ? e.message : "unknown");
    return fail("google_failed");
  }
  const res = NextResponse.redirect(new URL(safeNextPath(saved.next), base));
  res.cookies.delete({ name: OAUTH_COOKIE, path: "/api/auth/google" });
  return res;
}
