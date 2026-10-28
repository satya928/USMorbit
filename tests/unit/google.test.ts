import { describe, expect, it } from "vitest";
import { createAuthRequest, GoogleAuthError, validateIdToken, type GoogleConfig } from "@/lib/auth/google";
import { safeNextPath } from "@/lib/auth/app-url";

const cfg: GoogleConfig = { clientId: "client-123.apps.googleusercontent.com", clientSecret: "secret", allowedDomains: [] };
const now = Date.UTC(2026, 9, 28, 12);
const token = (claims: Record<string, unknown>) =>
  ["e30", Buffer.from(JSON.stringify(claims)).toString("base64url"), "sig"].join(".");
const good = { iss: "https://accounts.google.com", aud: cfg.clientId, exp: now / 1000 + 600, nonce: "n-1", sub: "1001", email: "Jordan@Example.com", email_verified: true, name: "Jordan" };
const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return (e as GoogleAuthError).code;
  }
  return "ok";
};

describe("Google ID token validation", () => {
  it("accepts a valid token and normalises the email", () => {
    expect(validateIdToken(token(good), cfg, "n-1", now)).toEqual({ sub: "1001", email: "jordan@example.com", name: "Jordan" });
  });
  it("rejects wrong issuer, audience, expired tokens and nonce mismatch", () => {
    expect(code(() => validateIdToken(token({ ...good, iss: "https://evil.example" }), cfg, "n-1", now))).toBe("google_failed");
    expect(code(() => validateIdToken(token({ ...good, aud: "other-client" }), cfg, "n-1", now))).toBe("google_failed");
    expect(code(() => validateIdToken(token({ ...good, exp: now / 1000 - 3600 }), cfg, "n-1", now))).toBe("google_failed");
    expect(code(() => validateIdToken(token(good), cfg, "n-2", now))).toBe("google_failed");
    expect(code(() => validateIdToken("not-a-jwt", cfg, "n-1", now))).toBe("google_failed");
  });
  it("requires a verified email and enforces allowed domains", () => {
    expect(code(() => validateIdToken(token({ ...good, email_verified: false }), cfg, "n-1", now))).toBe("google_unverified");
    const restricted = { ...cfg, allowedDomains: ["northstar.example"] };
    expect(code(() => validateIdToken(token(good), restricted, "n-1", now))).toBe("google_domain");
    expect(code(() => validateIdToken(token({ ...good, email: "a@northstar.example" }), restricted, "n-1", now))).toBe("ok");
  });
});

describe("Google auth request", () => {
  it("uses PKCE S256, state and nonce, with fresh values each time", () => {
    const a = createAuthRequest(cfg, "https://app.example/api/auth/google/callback");
    const b = createAuthRequest(cfg, "https://app.example/api/auth/google/callback");
    const u = new URL(a.url);
    expect(u.origin + u.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(u.searchParams.get("code_challenge_method")).toBe("S256");
    expect(u.searchParams.get("state")).toBe(a.state);
    expect(u.searchParams.get("nonce")).toBe(a.nonce);
    expect(u.searchParams.get("scope")).toBe("openid email profile");
    expect(u.searchParams.get("redirect_uri")).toBe("https://app.example/api/auth/google/callback");
    expect(a.state).not.toBe(b.state);
    expect(a.verifier).not.toBe(b.verifier);
  });
  it("only allows same-site redirect paths after sign-in", () => {
    expect(safeNextPath("/work-orders?x=1")).toBe("/work-orders?x=1");
    expect(safeNextPath("//evil.example")).toBe("/dashboard");
    expect(safeNextPath("https://evil.example")).toBe("/dashboard");
    expect(safeNextPath("/\\evil.example")).toBe("/dashboard");
    expect(safeNextPath(null)).toBe("/dashboard");
  });
});
