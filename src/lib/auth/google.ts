import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { DbOrTx } from "@/db";
import { auditLogs, memberships, userIdentities, users } from "@/db/schema";

/**
 * "Sign in with Google" using OpenID Connect (authorization code flow + PKCE, state and nonce).
 *
 * Google proves who the person is; USM Orbit still decides whether they may enter. A Google
 * sign-in succeeds only for an existing user (invited by a workspace admin) with an active
 * membership — matched by the Google account ID once linked, or by verified email the first time.
 */

export type GoogleConfig = { clientId: string; clientSecret: string; allowedDomains: string[] };

export function googleConfig(): GoogleConfig | null {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;
  const allowedDomains = (process.env.GOOGLE_ALLOWED_DOMAINS ?? "")
    .split(",")
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);
  return { clientId, clientSecret, allowedDomains };
}

/** Endpoint overrides exist only for local testing against a mock provider; ignored in production. */
function endpoint(kind: "auth" | "token") {
  const base = process.env.NODE_ENV !== "production" ? process.env.GOOGLE_OAUTH_TEST_BASE : undefined;
  if (base) return `${base}/${kind}`;
  return kind === "auth" ? "https://accounts.google.com/o/oauth2/v2/auth" : "https://oauth2.googleapis.com/token";
}

const b64url = (buf: Buffer) => buf.toString("base64url");

export function createAuthRequest(cfg: GoogleConfig, redirectUri: string) {
  const state = b64url(randomBytes(24));
  const nonce = b64url(randomBytes(24));
  const verifier = b64url(randomBytes(48));
  const challenge = b64url(createHash("sha256").update(verifier).digest());
  const url = new URL(endpoint("auth"));
  url.search = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state,
    nonce,
    code_challenge: challenge,
    code_challenge_method: "S256",
    prompt: "select_account",
    ...(cfg.allowedDomains.length === 1 ? { hd: cfg.allowedDomains[0] } : {}),
  }).toString();
  return { url: url.toString(), state, nonce, verifier };
}

export function safeEqual(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export class GoogleAuthError extends Error {
  constructor(public code: "google_failed" | "google_unverified" | "google_domain" | "no_account" | "no_access") {
    super(code);
  }
}

/** Server-to-server code exchange over TLS; returns the raw ID token. */
export async function exchangeCode(cfg: GoogleConfig, code: string, verifier: string, redirectUri: string): Promise<string> {
  const res = await fetch(endpoint("token"), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
      code_verifier: verifier,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new GoogleAuthError("google_failed");
  const body = (await res.json()) as { id_token?: unknown };
  if (typeof body.id_token !== "string") throw new GoogleAuthError("google_failed");
  return body.id_token;
}

export type GoogleClaims = { sub: string; email: string; name: string };

/**
 * Validate ID-token claims. The token comes straight from Google's token endpoint over TLS, which
 * OpenID Connect Core §3.1.3.7 allows in place of signature verification; issuer, audience,
 * expiry, nonce and verified email are still checked.
 */
export function validateIdToken(idToken: string, cfg: GoogleConfig, expectedNonce: string, now = Date.now()): GoogleClaims {
  const parts = idToken.split(".");
  if (parts.length !== 3) throw new GoogleAuthError("google_failed");
  let c: Record<string, unknown>;
  try {
    c = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  } catch {
    throw new GoogleAuthError("google_failed");
  }
  const aud = Array.isArray(c.aud) ? c.aud : [c.aud];
  if (c.iss !== "https://accounts.google.com" && c.iss !== "accounts.google.com") throw new GoogleAuthError("google_failed");
  if (!aud.includes(cfg.clientId)) throw new GoogleAuthError("google_failed");
  if (typeof c.exp !== "number" || c.exp * 1000 < now - 60_000) throw new GoogleAuthError("google_failed");
  if (typeof c.nonce !== "string" || !safeEqual(c.nonce, expectedNonce)) throw new GoogleAuthError("google_failed");
  if (typeof c.sub !== "string" || typeof c.email !== "string") throw new GoogleAuthError("google_failed");
  if (c.email_verified !== true && c.email_verified !== "true") throw new GoogleAuthError("google_unverified");
  const email = c.email.toLowerCase().trim();
  if (cfg.allowedDomains.length && !cfg.allowedDomains.includes(email.split("@")[1] ?? "")) throw new GoogleAuthError("google_domain");
  return { sub: c.sub, email, name: typeof c.name === "string" ? c.name : email };
}

/** Find the USM Orbit user for a Google identity, linking it on first use. Never creates users. */
export async function resolveGoogleUser(db: DbOrTx, claims: GoogleClaims): Promise<string> {
  return db.transaction(async (tx) => {
    const [linked] = await tx
      .select({ userId: userIdentities.userId, id: userIdentities.id })
      .from(userIdentities)
      .where(and(eq(userIdentities.provider, "google"), eq(userIdentities.subject, claims.sub)));

    let userId = linked?.userId;
    if (!userId) {
      const [user] = await tx.select({ id: users.id }).from(users).where(eq(users.email, claims.email));
      if (!user) throw new GoogleAuthError("no_account");
      userId = user.id;
    }

    const active = await tx
      .select({ tenantId: memberships.tenantId })
      .from(memberships)
      .where(and(eq(memberships.userId, userId), eq(memberships.status, "active")));
    if (!active.length) throw new GoogleAuthError("no_access");

    if (linked) {
      await tx.update(userIdentities).set({ lastUsedAt: new Date(), email: claims.email }).where(eq(userIdentities.id, linked.id));
    } else {
      await tx.insert(userIdentities).values({ userId, provider: "google", subject: claims.sub, email: claims.email, lastUsedAt: new Date() });
      // Linking a new sign-in method is security-relevant: record it in every workspace the user belongs to.
      await tx.insert(auditLogs).values(
        active.map((m) => ({ tenantId: m.tenantId, actorUserId: userId, action: "auth.google_linked", entityType: "user", entityId: userId, data: { email: claims.email } })),
      );
    }
    await tx.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, userId));
    return userId;
  });
}

export const GOOGLE_ERROR_MESSAGES: Record<string, string> = {
  google_cancelled: "Google sign-in was cancelled.",
  google_state: "Your sign-in attempt expired. Please try again.",
  google_failed: "Google sign-in failed. Please try again.",
  google_unverified: "Your Google email address is not verified.",
  google_domain: "Accounts from this Google domain are not allowed to sign in.",
  google_disabled: "Google sign-in is not enabled on this server.",
  no_account: "There is no USM Orbit account for that Google email. Ask your workspace administrator to invite you.",
  no_access: "Your account does not have access to an active workspace. Contact your administrator.",
};
