# USM Orbit — Service & Maintenance Operations Platform (beta)

*One Platform. Every Service & Maintenance Operation.*

USM Orbit connects facilities service requests to sites, assets, people, contractors, compliance, inspections, client approvals and reporting. This beta implements the full operational lifecycle:

**Request → Triage → Assignment → Work in progress → Inspection / evidence → Client approval or rework → Closure → Reporting**

It is a working, database-backed application, not a mockup. Every screen reads from PostgreSQL, every action is authorised on the server, and every dashboard figure is calculated from records.

> Beta product specification: [`docs/USM_Orbit_Beta_Product_Specification.md`](docs/USM_Orbit_Beta_Product_Specification.md) · Project plan & status (PDF): [`docs/USM_Orbit_Project_Plan_and_Status.pdf`](docs/USM_Orbit_Project_Plan_and_Status.pdf)
> Tester guide: [`docs/TESTING_GUIDE.md`](docs/TESTING_GUIDE.md) · Feature checklist: [`docs/FEATURES.md`](docs/FEATURES.md) · Demo script: [`docs/DEMO_SCRIPT.md`](docs/DEMO_SCRIPT.md) · Deployment: [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) · Security notes: [`docs/SECURITY.md`](docs/SECURITY.md) · Google sign-in: [`docs/GOOGLE_SIGN_IN.md`](docs/GOOGLE_SIGN_IN.md)

---

## Put up a test server (free, about 15 minutes)

The repo includes a Render blueprint ([`render.yaml`](render.yaml)) that creates a free PostgreSQL database and the web app, runs migrations, and loads the fictional demo data on first start.

1. Create a free account at https://render.com and connect your GitHub account. Allow access to the `USMorbit` repository.
2. In Render: **New → Blueprint**, pick `satya928/USMorbit` (branch `main`).
3. When asked for values, you can leave `AI_API_KEY` empty (the Copilot then runs in labelled demo mode). Set `FEEDBACK_URL` to a Google Form link if you want a **Beta feedback** button in the app. Click **Apply**.
4. Wait for the first build (about 5–10 minutes), then open the `https://usm-orbit-beta-….onrender.com` link and sign in with a demo account (password `Orbit-Demo-2026`).
5. Share the link and [`docs/TESTING_GUIDE.md`](docs/TESTING_GUIDE.md) with your testers.

Free-tier caveats:
- The app sleeps after about 15 minutes idle, so the first visit takes about a minute.
- The free database expires after 30 days.
- Uploaded files are lost when the service restarts or redeploys.

Use a VPS ([`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md)) for anything longer-lived. The same `npm run start:hosted` start command works on other Node hosts, such as Railway or a VPS without Docker.

---

## Stack

| Layer | Choice | Why |
| --- | --- | --- |
| Web | Next.js 15 (App Router) + React 19 + TypeScript | One deployable unit: server components, server actions, route handlers |
| UI | Tailwind CSS 4, lucide icons, Recharts | Small, accessible component kit in `src/components` |
| Database | PostgreSQL 16 via Drizzle ORM | Typed queries and SQL migrations (`drizzle/`) |
| Auth | Built-in email/password with DB-backed sessions, plus optional **Sign in with Google** (OpenID Connect) | Self-hostable on a VPS, with no third-party auth dependency (see below) |
| Validation | Zod 4 | Shared by every domain service |
| Files | Private local storage directory + permission-checked download route | Works on a single VPS; swap for S3-compatible storage later |
| AI | `AIProvider` adapter on the official Anthropic SDK, server-side only | Deterministic, clearly labelled demo mode when no key is set |
| Tests | Vitest (unit + integration against real Postgres), Playwright (E2E) | |

**Why not Supabase?** The spec recommends Supabase Auth + RLS *or an equivalent*. The beta targets a self-hosted VPS, so it ships its own equivalent:

- scrypt password hashing;
- random session tokens, stored only as SHA-256 hashes;
- a central role → permission matrix;
- tenant, site and record-level scoping inside every domain service;
- database-level tenant integrity: every child record references its parent through a composite `(tenant_id, id)` foreign key, so a cross-tenant reference cannot be stored even if application code were bypassed.

### Architecture (modular monolith)

```
src/
  db/            schema.ts (all tables), migrate.ts, seed.ts (demo data)
  lib/
    auth/        password hashing, sessions, AuthContext (tenant/role/site scope)
    authz/       role → permission matrix (single source of truth)
    actions.ts   server-action wrapper (session → domain call → safe result)
  domain/        business logic — framework-free and unit/integration tested
    work-orders/ state machine + service (create/assign/transition/checklist/comments)
    sites/ assets/ people/ compliance/ inspections/ files/ metrics/ reports/ settings/
    ai/          provider adapter, approved read-only tools, copilot orchestrator
  app/           Next.js routes: (app)/* pages, server actions, api/files, api/reports
  components/    UI kit, forms (useActionState), charts, navigation
tests/           unit/, integration/ (real Postgres), e2e/ (Playwright)
```

Pages and server actions never query tables directly for business rules. They call `src/domain/*` with an `AuthContext` built on the server from the session cookie. Domain services enforce permissions, scope and workflow rules, so a crafted request cannot bypass them.

---

## Local setup

Prerequisites: Node.js 22+, PostgreSQL 16+.

```bash
npm install
cp .env.example .env            # adjust DATABASE_URL if needed

# create a database (example for a local Postgres)
createuser -P orbit             # password: orbit
createdb -O orbit orbit_dev

npm run db:migrate              # apply migrations in ./drizzle
npm run db:seed                 # load the fictional Northstar demo tenant
npm run dev                     # http://localhost:3000
```

### Demo accounts (fictional data)

All demo accounts use the password **`Orbit-Demo-2026`**. They are shown on the sign-in page when `DEMO_MODE=true`.

| Role | Email |
| --- | --- |
| Tenant Admin | `admin@northstar.demo` (also an auditor in the second workspace, which demonstrates the workspace switcher) |
| Facilities Manager | `manager@northstar.demo` |
| Supervisor (Business Park + Retail Centre) | `supervisor@northstar.demo` |
| Technician | `tech@northstar.demo` |
| Technician with an **expired** Electrical Licence | `tech2@northstar.demo` |
| Contractor Manager (Coolflow Mechanical) | `contractor@northstar.demo` |
| Client Approver (Retail Centre + Business Park) | `client@northstar.demo` |
| Read-only Auditor | `auditor@northstar.demo` |
| Second tenant (Harbourline) admin, used for isolation tests | `admin@harbourline.demo` |

Shared demo credentials are for private demo instances only. On a real deployment, set `DEMO_MODE=false`, don't seed demo data, and create users from **Settings → Users & roles**. New users receive a one-time temporary password and must change it at first sign-in.

### Reset / reseed demo data

```bash
npm run db:reset
```

This deletes **only** tenants flagged `is_demo = true` and users with `.demo` email addresses, then reseeds. It refuses to run when `NODE_ENV=production` unless `ALLOW_DEMO_SEED=true` is set (for a dedicated demo server).

---

## Environment variables

See [`.env.example`](.env.example). All of them are server-side except `NEXT_PUBLIC_APP_URL`.

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | yes | PostgreSQL connection string |
| `NEXT_PUBLIC_APP_URL` | recommended | Public base URL |
| `STORAGE_DIR` | yes | Private directory for uploaded files (must not be web-served) |
| `AI_PROVIDER` | no | `anthropic` (the only adapter in this beta) |
| `AI_API_KEY` | no | Enables AI answers. Empty → labelled deterministic demo mode |
| `AI_MODEL` | no | Defaults to `claude-opus-5-5` |
| `DEMO_MODE` | no | `true` shows demo accounts on the sign-in page |
| `COOKIE_SECURE` | no | Override for local HTTP testing of a production build. Never disable in production |
| `ALLOW_DEMO_SEED` | no | Permit demo seeding when `NODE_ENV=production` |
| `DATABASE_POOL_MAX` | no | Connection pool size (default 10) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | no | Enable **Continue with Google** sign-in ([setup guide](docs/GOOGLE_SIGN_IN.md)) |
| `GOOGLE_ALLOWED_DOMAINS` | no | Restrict Google sign-in to these email domains |
| `APP_URL` | no | Public base URL for the Google callback (auto-detected on Render) |
| `FEEDBACK_URL` | no | Shows a **Beta feedback** link in the header (for example, a Google Form) |
| `SEED_DEMO_DATA` | no | `true` makes `npm run start:hosted` load demo data if it is missing (test instances only) |

---

## Scripts & tests

```bash
npm run lint         # ESLint (next/core-web-vitals + typescript)
npm run typecheck    # tsc --noEmit
npm test             # Vitest: unit + integration (uses database orbit_test)
npm run test:e2e     # Playwright: starts its own dev server on :3100 against orbit_e2e
npm run build        # production build (standalone output)
npm run check        # lint + typecheck + test + build
npm run tenant:create -- --name "Acme" --admin-email ops@acme.example --admin-name "Jo Smith"   # provision a real tenant
```

Test databases: integration tests use `TEST_DATABASE_URL` (default `postgres://orbit:orbit@localhost:5432/orbit_test`). E2E tests use `E2E_DATABASE_URL` (default `.../orbit_e2e`). Both are migrated and reseeded automatically, so create them once:

```bash
createdb -O orbit orbit_test && createdb -O orbit orbit_e2e
```

For Playwright, either run `npx playwright install chromium` or point `PLAYWRIGHT_CHROMIUM_PATH` at an existing Chromium binary.

What the tests cover:

- **Tenant isolation:** tenant B can't read, list, edit, transition or assign tenant A's records by ID. Cross-tenant references are rejected by the API and by the database itself. AI tools only see the caller's tenant.
- **Role and site scope:**
  - site-scoped supervisors can't see other sites;
  - technicians see only their own work;
  - contractor managers see only their company's work;
  - client approvers never receive internal notes;
  - technicians can't approve or assign, and auditors can't write;
  - crafted inputs (a `tenantId`, `status` or internal notes in the body) are ignored.
- **Work-order lifecycle, end to end:** create → assign → start → checklist (blocks "ready" until required items are done) → inspection pass → client reject with reason → rework → approve → close. Invalid transitions are rejected; dashboard counts follow; the timeline and approval records are complete; self-approval is blocked; concurrent transitions are detected.
- **Compliance:** 30-day and expired views, an expiry edit triggers re-verification, alerts are deduplicated, the credential rule blocks assignment, and authorised overrides are audited.
- **Inspections:** answers persist, a failed item fails the run, a defect creates a linked work order, submitted runs are locked, and incomplete runs can't be submitted.
- **Files:** magic-byte validation, plus download access checks across tenants, sites and roles.
- **Reports:** site filter, CSV metadata and injection guard, SLA maths and empty periods.
- **AI:** demo mode labelling, drafts never create records, provider errors fail safely, and only approved tools are callable.
- **E2E (browser):** the full lifecycle across four roles including rework, the credential override UI, page and API access control, CSV export, and Copilot draft → prefilled form.

---

## KPI definitions (used identically on every screen)

Implemented once in `src/domain/metrics/service.ts`:

- **Open work orders:** status not in approved / closed / cancelled.
- **Overdue:** open and `due_at < now`.
- **Critical / high:** open with priority high or critical.
- **Awaiting approval:** status `pending_approval`.
- **SLA compliance (period):** among approved or closed work orders that have a due time and were *completed* (marked ready for inspection) in the period, the share completed on or before due. Cancelled work is excluded. Shows "—" when nothing is eligible.
- **Expiring compliance:** live items expiring within the next 30 days, today inclusive.
- **Rework rate (period):** returns (inspection failures, client rejections, rework requests) ÷ submissions for inspection, both counted from the event log in the period.
- **First-time completion (period):** among work approved in the period, the share never returned for rework.

Compliance status precedence: not applicable → expired → pending review → expiring (≤30 days) → valid. Changing an expiry date resets the item to *pending review*.

---

## AI Copilot

- Runs server-side through `AIProvider` (`src/domain/ai/provider.ts`). The default model is `claude-opus-5-5`, with server-side refusal fallback enabled.
- The model can only call approved, **read-only** tools (`src/domain/ai/tools.ts`) that use the same scoped domain services as the UI. Permissions are enforced before retrieval, and the model never generates SQL.
- `draft_work_order` returns a **proposal only**. The user opens it in the normal create form, reviews it, and submits it with their own permissions.
- Without `AI_API_KEY`, questions are routed by keyword to the same tools and answered from real records. The answer is labelled "Demo mode — deterministic lookup, not AI".
- Only metadata is logged (`ai_interaction_logs`: feature, mode, model, latency, success, tools used), never prompt or answer text.

---

## Deployment

The recommended beta target is a single VPS with Docker Compose: PostgreSQL + the app + Caddy for automatic HTTPS. Step-by-step instructions, plus backup and restore, are in [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

```bash
cp .env.production.example .env   # set DOMAIN, POSTGRES_PASSWORD, optional AI_API_KEY
docker compose --profile tools run --rm migrate
docker compose up -d
```

## Known limitations

- **Single-instance assumptions:** the rate limiter is in-memory and files live on local disk. Use Redis and S3-compatible storage before scaling out horizontally.
- **No email:** notifications are in-app only. There is no email delivery, password-reset email, enterprise SAML SSO or SCIM yet. Sign in with Google is available ([setup guide](docs/GOOGLE_SIGN_IN.md)). Administrators reset a password from **Settings → Users & roles**, which issues a one-time temporary password.
- **No offline mode:** the UI is responsive and mobile-friendly but not an installable offline app.
- **Simple scheduling:** there is no inventory, preventive-maintenance scheduling, IoT/BMS integration or marketplace (these are spec non-goals for the beta).
- **Asset health:** a transparent rule-based indicator, not a prediction.
- **Single-language:** English only. Dates and times are localised per site time zone.
- **Not certified:** see [`docs/SECURITY.md`](docs/SECURITY.md). Do not claim SOC 2, ISO 27001 or GDPR compliance on the strength of this beta.
