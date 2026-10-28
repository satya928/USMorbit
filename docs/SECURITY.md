# Security notes (beta)

## Controls in place
- **Authentication:** scrypt password hashes; 256-bit random session tokens stored as SHA-256 hashes; `HttpOnly`, `SameSite=Lax`, `Secure` (production) cookies; 7-day expiry; sessions revoked on password change and admin reset; constant-work sign-in to avoid account enumeration by timing; generic error messages; rate limits per IP and per email.
- **Sign in with Google (optional):** OpenID Connect authorization-code flow with PKCE (S256), state bound to the browser by an HttpOnly cookie, and nonce; server-to-server code exchange; issuer/audience/expiry/nonce/verified-email checks. Only pre-invited users with an active membership can sign in; no automatic account creation; identity linking is audited.
- **Authorization:** central role → permission matrix enforced in domain services, not the UI. Every query is tenant-scoped; site, own-assignment and own-contractor scopes are applied per role. Out-of-scope records return *not found*, indistinguishable from missing ones.
- **Tenant integrity in the database:** composite `(tenant_id, id)` foreign keys prevent cross-tenant references even if application checks were bypassed (covered by a test).
- **Workflow integrity:** status transitions validated server-side; optimistic concurrency guard; reasons required for rejections, rework and cancellations; self-approval denied by default; append-only work-order event log.
- **Input handling:** Zod validation on every write; React output encoding; CSV formula-injection guard; LIKE-pattern escaping.
- **Files:** type allow-list verified by magic bytes, 10 MB limit, random storage keys outside the web root, `0600` permissions, download only via a route that re-checks access to the parent record; restrictive CSP and `nosniff` on file responses.
- **CSRF:** mutations use Next.js server actions (POST with origin checks); `SameSite=Lax` cookies; GET routes are read-only (CSV export is audited).
- **Headers:** `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`; HSTS at the proxy.
- **Secrets:** server-only environment variables; no secrets in client bundles; AI key never displayed.
- **AI:** server-side only; approved read-only tools; permissions enforced before retrieval; no model-generated SQL; no direct mutations; prompt-injection guidance in the system prompt; metadata-only logging.
- **Privacy by design:** no government IDs, bank details or HR data fields; demo data is fictional; demo data must not be used to train external models.

## Known gaps / limitations
- In-memory rate limiting (per instance). No CAPTCHA or account lockout notifications.
- No MFA, enterprise SAML SSO, SCIM or password-reset email yet (Google sign-in is available and inherits the user's Google security, including Google 2-Step Verification).
- No automated dependency scanning in CI yet (`npm audit` reports advisories in transitive dev dependencies; review before production).
- No malware scanning of uploaded files.
- Audit logs are append-only by convention (the app never updates them) but are not cryptographically sealed.
- No data-residency controls; one database per deployment.

## Certifications
This beta has **not** been assessed against SOC 2, ISO 27001, GDPR, or any other framework. Do not claim compliance with any standard on the basis of this software.

## Reporting a vulnerability
Contact the project owner privately; do not open a public issue.
