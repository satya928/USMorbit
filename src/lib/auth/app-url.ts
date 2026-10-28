/**
 * Public base URL of this deployment, used for OAuth redirect URIs.
 * APP_URL (server-only) wins; Render provides RENDER_EXTERNAL_URL; otherwise derive from the request.
 */
export function appBaseUrl(req: Request): string {
  const configured = process.env.APP_URL || process.env.RENDER_EXTERNAL_URL;
  if (configured) return configured.replace(/\/+$/, "");
  const h = req.headers;
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}`;
}

/** Only same-site relative paths are accepted as post-sign-in destinations. */
export function safeNextPath(next: string | null | undefined): string {
  return next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : "/dashboard";
}
