import { NextResponse, type NextRequest } from "next/server";
import { appBaseUrl, safeNextPath } from "@/lib/auth/app-url";
import { createAuthRequest, googleConfig } from "@/lib/auth/google";

export const dynamic = "force-dynamic";
const OAUTH_COOKIE = "usm_google_oauth";

/** Step 1: send the browser to Google with state, nonce and a PKCE challenge. */
export async function GET(req: NextRequest) {
  const base = appBaseUrl(req);
  const cfg = googleConfig();
  if (!cfg) return NextResponse.redirect(new URL("/sign-in?error=google_disabled", base));

  const auth = createAuthRequest(cfg, `${base}/api/auth/google/callback`);
  const res = NextResponse.redirect(auth.url);
  // Short-lived, HttpOnly cookie binding this browser to the request (checked on callback).
  res.cookies.set(OAUTH_COOKIE, Buffer.from(JSON.stringify({ s: auth.state, n: auth.nonce, v: auth.verifier, next: safeNextPath(req.nextUrl.searchParams.get("next")) })).toString("base64url"), {
    httpOnly: true,
    secure: process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === "true" : process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/auth/google",
    maxAge: 600,
  });
  return res;
}
