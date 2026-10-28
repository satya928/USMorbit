# USM Orbit beta — feature checklist

Legend: ✅ complete · 🟡 partial (works, with stated limits) · ⏳ not implemented (labelled "Coming later" in the UI where relevant)

## Foundation
| Feature | Status | Notes |
| --- | --- | --- |
| Email/password sign-in, sign-out, protected routes | ✅ | DB-backed sessions; tokens stored only as SHA-256; scrypt password hashes |
| Rate limiting (sign-in, AI, uploads) | 🟡 | In-memory, per instance |
| Multi-tenant data model with tenant isolation | ✅ | Domain-level scoping + composite `(tenant_id, id)` FKs in the database |
| Roles: Tenant Admin, Facilities Manager, Supervisor, Technician, Contractor Manager, Client Approver, Auditor | ✅ | Server-side permission matrix (`src/lib/authz/permissions.ts`) |
| Platform Admin | 🟡 | Role exists with full tenant permissions; no cross-tenant platform console |
| Site-scoped access | ✅ | Per-membership site grants or "all sites" |
| Workspace switcher | ✅ | For users in several tenants |
| Forced password change for invited users; admin password reset | ✅ | |
| Sign in with Google (invited users only) | ✅ | OpenID Connect + PKCE; setup in `docs/GOOGLE_SIGN_IN.md` |
| Password-reset email, enterprise SAML SSO, SCIM | ⏳ | |
| Audit log | ✅ | Assignments, overrides, role/access changes, compliance, exports, password resets; work-order timeline is append-only |
| Seed data and reset command | ✅ | `npm run db:seed`, `npm run db:reset` (demo tenants only) |

## Modules
| Module | Status | Highlights |
| --- | --- | --- |
| Command Center | ✅ | 6 DB-backed KPIs, created-per-day, status and priority charts (with table views), quality, site performance, upcoming compliance, activity feed, quick actions; date range / site / status / priority filters |
| Work Orders | ✅ | Search, filters, sorting, pagination; create/edit; assignment to people and/or contractors; checklist; comments (internal notes for staff only); photo/PDF evidence; timeline; server-enforced status machine incl. rework and cancel with reason; SLA due from presets; optimistic-concurrency guard |
| Sites | ✅ | Create, edit, view, archive/restore (never hard-deleted); assets, work, compliance, inspections per site |
| Assets | ✅ | Register, history, rule-based health indicator with reasons, archive |
| People & Contractors | ✅ | People profiles, skills, credentials; contractors with service categories, regions, staff, compliance and performance (assigned/completed/overdue/rework) |
| Compliance | ✅ | Items for contractors, people, sites, assets, organisation; 30/60/90-day, expired and pending-review views; verification; private document upload; deduplicated in-app expiry alerts; credential rule on assignment with audited override |
| Inspections | ✅ | Template builder (pass/fail/N/A, scores, evidence flags); runs linked to sites/work orders; defects with severity; create linked work order from defect; result rules (failed / needs review / passed); sign-off name |
| Approvals | ✅ | Queues for client approval and inspection; approve, request rework, reject with reason; self-approval blocked by default |
| Reports | ✅ | 8 reports (register, SLA, overdue, breakdown, contractor performance, inspections, compliance register, approval/rework cycle); CSV export with filters and timestamp; export audited |
| AI Copilot | ✅ | Provider adapter (Anthropic SDK), approved read-only tools, permission-scoped retrieval, draft→review→create flow, labelled deterministic demo mode, metadata-only logging |
| Settings | ✅ | Workspace profile, users & roles (invite, site access, approve grant, disable, reset password), workflow rules, categories & required credentials, SLA presets, audit log, AI status, demo data |
| Notifications | 🟡 | In-app (assignment, ready, approval requested, rework, approved, compliance expiry); no email/push |
| Global search | ✅ | Work orders, sites, assets, people, contractors — within the user's scope |

## Quality
| Item | Status |
| --- | --- |
| Responsive layout (desktop sidebar, mobile drawer, mobile card lists) | ✅ |
| Loading, empty, error, permission-denied, not-found, validation and success states | ✅ |
| Unsaved-changes warning on long forms | ✅ |
| Keyboard focus styles, labelled form controls, ARIA on navigation | ✅ (manual check; no automated axe run yet) |
| Unit + integration tests (43) and Playwright E2E (4 flows) | ✅ |
| Lint, typecheck, production build | ✅ |

## Recommended next features (post-beta)
1. Email notifications and password-reset email (transactional email provider).
2. Preventive maintenance schedules generating work orders from asset intervals.
3. Inventory: parts, stock levels, consumption on work orders (spec P2).
4. S3-compatible object storage and Redis-backed rate limiting for multi-instance hosting.
5. Enterprise SAML SSO (Microsoft Entra ID, Okta) and SCIM provisioning — Google sign-in is already available.
6. Client portal with a simplified request form and branded notifications.
7. Offline-capable technician mobile experience (PWA) with photo capture queue.
8. Computer-vision assistance on inspection photos (evaluate on real data first).
9. Contractor invoicing linked to approved work and actual costs.
10. Configurable custom fields and forms per tenant.
