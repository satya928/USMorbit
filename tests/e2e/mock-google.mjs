// Minimal mock of Google's OAuth endpoints for E2E tests (never used in production builds).
// GET /auth  -> redirects back with a code; POST /token -> returns an ID token after verifying PKCE.
// GET /set?email=...&sub=...&verified=true -> choose which Google account "signs in" next.
import { createHash } from "node:crypto";
import http from "node:http";

const PORT = Number(process.env.MOCK_GOOGLE_PORT ?? 4555);
const CLIENT_ID = process.env.MOCK_GOOGLE_CLIENT_ID ?? "e2e-client";
let account = { email: "tech@northstar.demo", sub: "g-e2e-tech", verified: true };
const codes = new Map();
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    if (url.pathname === "/health") return res.end("ok");
    if (url.pathname === "/set") {
      account = { email: url.searchParams.get("email"), sub: url.searchParams.get("sub"), verified: url.searchParams.get("verified") !== "false" };
      return res.end("ok");
    }
    if (url.pathname === "/auth") {
      const p = url.searchParams;
      if (p.get("client_id") !== CLIENT_ID || p.get("code_challenge_method") !== "S256") return res.writeHead(400).end("bad request");
      const code = Math.random().toString(36).slice(2);
      codes.set(code, { nonce: p.get("nonce"), challenge: p.get("code_challenge"), redirect: p.get("redirect_uri"), account });
      const back = new URL(p.get("redirect_uri"));
      back.searchParams.set("code", code);
      back.searchParams.set("state", p.get("state"));
      return res.writeHead(302, { Location: back.toString() }).end();
    }
    if (url.pathname === "/token" && req.method === "POST") {
      let body = "";
      for await (const chunk of req) body += chunk;
      const p = new URLSearchParams(body);
      const entry = codes.get(p.get("code"));
      codes.delete(p.get("code"));
      const challenge = createHash("sha256").update(p.get("code_verifier") ?? "").digest("base64url");
      if (!entry || challenge !== entry.challenge || p.get("redirect_uri") !== entry.redirect || p.get("client_id") !== CLIENT_ID) {
        return res.writeHead(400, { "Content-Type": "application/json" }).end(JSON.stringify({ error: "invalid_grant" }));
      }
      const now = Math.floor(Date.now() / 1000);
      const claims = { iss: "https://accounts.google.com", aud: CLIENT_ID, sub: entry.account.sub, email: entry.account.email, email_verified: entry.account.verified, name: "E2E User", nonce: entry.nonce, iat: now, exp: now + 3600 };
      return res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ id_token: `${b64({ alg: "RS256" })}.${b64(claims)}.sig`, access_token: "x" }));
    }
    res.writeHead(404).end();
  })
  .listen(PORT);
