import { NextResponse, type NextRequest } from "next/server";

/**
 * Edge gate: redirect visitors without a session cookie to sign-in. This is a UX convenience only —
 * every page, server action and route handler re-validates the session and permissions on the server.
 */
export function middleware(req: NextRequest) {
  const hasSession = req.cookies.has("orbit_session");
  if (!hasSession) {
    if (req.nextUrl.pathname.startsWith("/api/")) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    const url = req.nextUrl.clone();
    url.pathname = "/sign-in";
    url.search = req.nextUrl.pathname === "/" ? "" : `?next=${encodeURIComponent(req.nextUrl.pathname + req.nextUrl.search)}`;
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!sign-in|_next/static|_next/image|favicon.ico|icon.svg|api/health|api/auth/google).*)"],
};
