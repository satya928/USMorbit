# USM Orbit --- Service & Maintenance Operations Platform

## Beta Product Specification

**Version:** 1.1\
**Prepared:** 2026-10-23 (updated 2026-10-29)\
**Based on:** USM Orbit Business Plan (19 October 2026)\
**Purpose:** Define a demonstrable, usable beta of USM Orbit with real
authentication, a persistent database, and end-to-end service and
maintenance workflows.

------------------------------------------------------------------------

# Part A --- Product Build Brief

The beta is a production-minded web application named **USM Orbit ---
Service & Maintenance Operations Platform**, delivered by a team covering
product engineering, full-stack architecture, UX design, database
engineering and application security.

It is not a static mockup: it implements working end-to-end flows
backed by a real database and authentication. Its foundation is the
capabilities and workflow concepts of the USM Orbit business plan: employee and contractor profiles, projects/work
orders, delegation, sign-in/out where appropriate, work-in-progress
tracking, quality audits, client sign-off, compliance documents,
inventory-ready architecture, training/knowledge, and reporting.

## 1. Product objective

USM Orbit connects facilities service requests to sites, assets, employees,
contractors, compliance requirements, inspections, approvals, and
operational reporting. The beta must demonstrate the core lifecycle:

**Request → Triage → Assignment → Work in Progress → Inspection/Evidence
→ Client Approval or Rework → Closure → Reporting**

The product is intended to grow toward a global, AI-enabled Facilities
Operations Platform. For the beta, focus on a narrow but complete
multi-site service operations workflow rather than trying to clone an
entire enterprise IWMS, ERP, CMMS, or building-control system.

## 2. Non-negotiable delivery requirements

1.  Create a responsive web application for desktop and mobile.
2.  Use a real database with migrations/schema setup and persistent
    records.
3.  Implement authentication, sign-out, protected routes, and role-based
    access control.
4.  Include seeded demonstration data and a documented way to
    reset/reseed it.
5.  Build functional forms, validation, loading states, empty states,
    errors, and success feedback.
6.  Connect all dashboard metrics to real database queries. Do not
    hard-code KPI values.
7.  Ensure the core work-order lifecycle is fully usable from creation
    to closure.
8.  Include a demo mode or seeded demo tenant that does not expose real
    customer data.
9.  Implement server-side authorization. Hiding a button in the UI is
    not security.
10. Do not pretend AI is active if no model/API key is configured. Show
    a clear configuration state and provide deterministic demo fallback
    behavior.
11. Never expose secrets, service-role keys, or model API keys in
    client-side code.
12. Provide a README with local setup, environment variables, database
    setup/migrations, seed instructions, tests, deployment steps, and
    known limitations.
13. Add automated tests for permissions and the main end-to-end
    workflow.
14. Make reasonable implementation choices based on the repository's
    existing stack. Inspect the repository before replacing frameworks
    or deleting existing work. If the repository is empty, use the
    recommended stack below.
15. Work in small milestones and run lint, type checks, tests, and
    production build before declaring completion. Fix errors rather than
    merely listing them.

## 3. Recommended stack if the repository is empty

Prefer a simple, maintainable TypeScript stack: - **Frontend:** Next.js
(App Router) + TypeScript - **UI:** Tailwind CSS + an accessible
component library such as shadcn/ui - **Database:** PostgreSQL -
**Authentication:** Supabase Auth with PostgreSQL and Row Level
Security, or an equivalent secure authentication solution - **Database
access:** Supabase client/server helpers or a typed ORM where
appropriate - **File storage:** private object storage for compliance
documents and inspection photos - **Charts:** Recharts or equivalent -
**Validation:** Zod or equivalent schema validation - **Testing:**
unit/integration tests plus Playwright or equivalent E2E tests -
**Deployment:** Vercel or another supported web host, with managed
PostgreSQL/auth/storage - **AI:** provider adapter interface with a
server-side model API integration, configured only through environment
variables

Do not add unnecessary microservices for the beta. A modular monolith is
preferred. Keep domain logic separated by module so it can scale later.

If the delivery team prefers a different stack or managed database/auth
service, it may adapt while preserving these requirements, and must
explain the choice in the README.

## 4. Brand and UX direction

Brand: **USM Orbit** (Universal Service & Maintenance Orbit)\
Descriptor: **Service & Maintenance Operations Platform**\
Tagline: **One Platform. Every Service & Maintenance Operation.**

Visual style: - Professional B2B SaaS, modern, calm, credible, and
operationally focused. - Navy/blue foundation with teal accent, neutral
surfaces, clear status colors. - Desktop sidebar navigation and
responsive mobile navigation. - Consistent typography, spacing,
accessible contrast, keyboard focus, labels, and error messages. - Use
charts only when they answer a real operational question. - Use icons
consistently; avoid decorative clutter. - Include a branded sign-in
page, workspace switcher/tenant context, profile menu, notification
area, breadcrumbs, and global search if feasible. - Do not use fake
logos of competitors or imply partnerships. - Use realistic demo content
with clearly fictional company/site/person names.

## 5. Navigation and screens

Create these primary sections:

1.  **Command Center**
2.  **Work Orders**
3.  **Sites**
4.  **Assets**
5.  **People & Contractors**
6.  **Compliance**
7.  **Inspections**
8.  **Approvals**
9.  **Reports**
10. **AI Copilot**
11. **Settings** (admin only)

Every navigation item must open a working screen. If a capability is
intentionally out of scope, label it "Coming later" rather than
presenting a broken or fake screen.

### 5.1 Command Center

Show database-backed KPI cards: - Open work orders - Overdue work
orders - Critical/high-priority work orders - Jobs awaiting approval -
SLA compliance rate for the selected period - Compliance items expiring
in the next 30 days

Include: - Work-order status distribution chart - Work orders by
priority - Recent activity feed - Upcoming compliance expirations - Site
performance table - Quick actions: Create request, Create work order,
Add site, Start inspection

Filters: date range, site, status, priority. Filters must affect the
data.

### 5.2 Work Orders

List/table with: - Work order ID - Title / issue - Site and location -
Asset (optional) - Category - Priority - Status - Assignee - Contractor
(optional) - SLA due time - Created date - Approval status

Required features: - Search, filters, sorting, pagination -
Create/edit/view work order - Assign/reassign staff or contractor - Add
comments and activity history - Add checklist items and completion
results - Upload/view photo evidence - Record work started and completed
times - Mark ready for inspection - Submit for client approval -
Approve, reject with reason, return for rework, or close - Show a
chronological timeline - Prevent invalid status transitions - Keep audit
history for important changes

Suggested status model:
`new → triaged → assigned → in_progress → ready_for_inspection → pending_approval → approved → closed`
Additional allowed transition:
`ready_for_inspection/pending_approval → rework_required → in_progress`
Also support `cancelled` with permission and reason. Implement
transition rules in server-side domain logic.

### 5.3 Sites

Site list and detail: - Site name/code - Site type - Address and
country/region - Time zone - Site manager/contact - Status - Associated
work orders - Assets - Compliance items - Recent inspections

Support create, edit, view, archive (do not hard-delete records
referenced by history).

### 5.4 Assets

Asset register: - Asset code - Name/type/category - Site and exact
location - Manufacturer/model/serial number (optional) - Install date
(optional) - Warranty expiry (optional) - Criticality - Current
condition/status - Last service / next maintenance (optional) -
Work-order history

For beta, asset health score may be a transparent rule-based indicator,
not a predictive AI claim. Do not invent sensor integrations.

### 5.5 People & Contractors

People records: - Name - Email - Role/type (employee, technician,
supervisor, contractor contact, client contact) - Skills/certifications
(structured or linked records) - Phone (optional) - Active/inactive -
Home/assigned site (optional)

Contractor records: - Company name - Contact - Service categories -
Service regions - Status - Compliance documents - Assigned work orders -
Basic performance measures: assigned, completed, overdue,
rejected/rework

Do not expose sensitive personal information unnecessarily. Do not store
government IDs, bank details, or unrelated HR information in this beta.

### 5.6 Compliance

Track compliance items such as insurance certificates, licences,
certifications, safety documents, and site procedures.

Fields: - Item name/type - Applies to: site, asset, person, contractor,
or organization - Related entity - Issuer (optional) - Reference number
(optional; avoid highly sensitive identifiers) - Issue date (optional) -
Expiry date (optional) - Status: valid, expiring, expired,
pending_review, not_applicable - Private file/document link - Notes -
Verified by and verification timestamp

Requirements: - Expiring in 30/60/90 days views - Expired items surfaced
on dashboard - Alerts/in-app notifications - Manual verification
status - Do not automatically claim regulatory compliance. Make the
platform a tracking and evidence tool. - Prevent assignment when a
required credential is expired only where a clear configurable rule
exists; show the reason and allow authorized override with an audit
event.

### 5.7 Inspections

Create reusable inspection templates and inspection runs.

Template fields: - Name - Category - Site/service type (optional) -
Checklist questions/items - Required evidence flags - Pass/fail/NA or
score-based answer types

Inspection run: - Site, work order, inspector, date/time - Answers and
notes - Defects with severity - Photos/files - Overall result: pass,
fail, needs_review - Signature/approval record where configured

If an inspection identifies a defect, allow creating a linked work order
with the location, description, severity, evidence, and source
inspection prefilled.

### 5.8 Client Sign-off & Approvals

Provide a dedicated queue for jobs awaiting approval.

Approver can: - Review work summary - View checklist and evidence -
Approve - Reject and provide reason - Request rework - Add comments

Every decision must record actor, timestamp, decision, reason, and
linked work order. A rejection should return the work order to
rework-required/in-progress, not silently close it.

### 5.9 Reports

Provide date/site filters and export to CSV for: - Work-order register -
SLA performance - Overdue work - Work orders by
site/category/priority/status - Contractor performance - Inspection
results/defects - Compliance expiry register - Approval/rework cycle

Report values must be computed from database records. Include a report
generation timestamp and active filters in exports. Avoid claiming
certified financial or regulatory reporting.

### 5.10 AI Copilot

Create an AI panel with suggested prompts: - "Summarize the open work
across my sites." - "Which work orders are overdue and what are the
likely blockers?" - "Show compliance items expiring in the next 30
days." - "Summarize this site's recent inspection failures." - "Draft a
work order from this issue: \[text\]." - "Summarize contractor
performance this month."

Architecture: - AI calls must run server-side. - Use an `AIProvider`
adapter with a configured model provider. - Retrieve only
tenant-authorized data. Enforce permissions before retrieval, not only
in the prompt. - For operational questions, use approved database
query/service functions rather than unrestricted model-generated SQL. -
Return concise answers with the data period, site scope, and
links/references to underlying records where possible. - Do not allow
the model to perform destructive or financial actions directly. - For
create/update actions, show a proposed action preview and require
explicit user confirmation. - Record AI usage metadata (tenant, user,
feature, latency, success/failure; avoid logging unnecessary sensitive
prompt content). - If no AI key is configured, show "AI provider not
configured" and offer working deterministic demo actions based on actual
database records. Do not label deterministic output as an LLM
response. - Include an explicit disclaimer that AI suggestions can be
wrong and should be checked for safety-critical decisions.

### 5.11 Settings

Admin-only: - Tenant/company profile - Users and role assignments -
Basic workflow configuration - Work-order categories and priorities -
SLA presets - Notification preferences - Audit log viewer - AI
configuration status (never show secrets) - Demo data/reset instructions
where appropriate

## 6. Roles and permissions

Implement server-side authorization for these roles:

-   **Platform Admin:** platform-level support/admin tools only where
    explicitly needed.
-   **Tenant Admin:** manage tenant settings, users, sites, people,
    contractors, compliance and reports.
-   **Facilities Manager:** manage work orders, assets, inspections,
    assignments, approvals and reports across authorized sites.
-   **Supervisor:** manage work execution, inspections and assignments
    for authorized sites; approve only if granted.
-   **Technician / Cleaner:** view assigned work, update permitted
    status, complete checklist, upload evidence, add comments and submit
    for inspection.
-   **Contractor Manager:** view/assign contractor jobs and contractor
    compliance within assigned scope.
-   **Client Approver:** view relevant jobs, evidence and approve/reject
    only for their authorized sites.
-   **Read-only Auditor:** view permitted records and audit history; no
    edits.

Permission rules: - Every record belongs to a tenant. - Site-scoped
roles can only access authorized sites. - Tenant A must never read or
mutate Tenant B records. - Client approvers cannot see unrelated tenants
or internal-only notes. - Technicians cannot approve their own work
unless an explicit policy allows it; default is deny. - File download
must verify tenant and record access server-side. - Audit sensitive
changes and permission changes. - Seed a few role-specific demo accounts
and document them clearly. Use safe demo-only credentials; force
password changes or disable public use of shared demo credentials in
production.

## 7. Database schema

Use UUID primary keys, timestamps, tenant ownership, foreign keys,
indexes, and soft deletion/archive where appropriate. Use database
migrations. At minimum implement these entities:

-   `tenants`
-   `profiles` / `users` (linked to auth provider)
-   `memberships` (tenant, user, role, status)
-   `site_access` (membership/user to site scopes)
-   `sites`
-   `assets`
-   `people` (optional if identity profile and operational worker
    profile differ)
-   `contractors`
-   `contractor_service_categories`
-   `work_orders`
-   `work_order_assignments`
-   `work_order_checklist_items`
-   `work_order_comments`
-   `work_order_events` (append-only audit/timeline)
-   `file_attachments`
-   `compliance_items`
-   `inspection_templates`
-   `inspection_template_items`
-   `inspection_runs`
-   `inspection_answers`
-   `inspection_defects`
-   `approval_decisions`
-   `notifications`
-   `work_categories`
-   `sla_policies`
-   `ai_interaction_logs` (metadata only where possible)

Important data rules: - Use a single canonical tenant ID on tenant-owned
records; validate relationships to prevent cross-tenant references. -
Enforce referential integrity. - Index common filters: tenant, site,
status, priority, due date, created date, assignee. - Store files in
private storage; store metadata and object key in database. - Keep
`work_order_events` append-only from the app's normal workflow. - Prefer
explicit status enums or validated constrained strings. - Store
timestamps in UTC; display in the site's timezone. - Use `created_at`,
`updated_at`, and actor IDs where applicable. - Add Row Level Security
policies if using Supabase/Postgres RLS. Test policies using at least
two tenants and multiple roles.

### Suggested work-order fields

`id, tenant_id, work_order_number, title, description, category_id, site_id, asset_id, location_text, priority, status, requester_user_id, assignee_user_id, contractor_id, due_at, started_at, completed_at, submitted_for_approval_at, closed_at, estimated_cost, actual_cost, client_visible_summary, internal_notes, created_at, updated_at, archived_at`

Avoid exposing `internal_notes` to client approvers or contractors
unless authorized.

## 8. Key acceptance criteria

### Work order lifecycle

-   A permitted user can create a work order and see it in the list
    after refresh.
-   A manager can assign it to a permitted user/contractor.
-   An assignee can start work and update permitted fields.
-   The assignee can complete required checklist items and upload
    evidence.
-   The assignee can submit it for inspection/approval.
-   An authorized approver can approve or reject with a reason.
-   Rejection routes the work to rework and is visible in history.
-   An approved work order can be closed by an authorized role.
-   Invalid transitions are rejected by the server with a useful error.
-   Dashboard counts update from persisted data after each transition.

### Tenant and permissions

-   Tenant A cannot access Tenant B records by guessing IDs or calling
    APIs directly.
-   A technician cannot change tenant ID, override role, or approve
    unauthorized work via crafted requests.
-   Private files cannot be downloaded without access to the related
    record.
-   All unauthorized actions return an appropriate 401/403 response
    without leaking sensitive data.

### Compliance

-   An item expiring within 30 days appears in the appropriate view.
-   Expired items are clearly flagged.
-   An expiry date edit updates the status/view correctly.
-   Any assignment block or override is recorded with a reason and
    actor.

### Inspection and evidence

-   Inspection responses persist after refresh.
-   A failed item can create a linked work order.
-   Evidence metadata is saved and file access is permission-checked.

### Reporting

-   CSV export matches the selected date/site/status filters.
-   KPI calculations use documented formulas and handle empty datasets.
-   Time zones are applied consistently.

### AI

-   AI queries use only authorized tenant data.
-   No API key means a clear non-AI fallback, not a broken screen.
-   Any proposed mutation requires user confirmation.
-   Model errors/timeouts produce safe, useful error states.

## 9. Suggested KPI definitions

-   **Open work orders:** work orders not in approved/closed/cancelled
    terminal states, based on agreed status semantics.
-   **Overdue work orders:** active work orders with `due_at < now`.
-   **Awaiting approval:** status `pending_approval`.
-   **SLA compliance:** percentage of eligible closed work orders
    completed by their due time for the selected period. State how
    cancelled and paused jobs are treated.
-   **Expiring compliance:** valid/expiring compliance records with
    expiry date in the next 30 days.
-   **Rework rate:** work orders returned for rework divided by work
    orders submitted for approval in the selected period.
-   **First-time completion:** jobs not reopened/returned for rework
    after first submission, with the calculation documented.

Do not silently change KPI formulas between screens.

## 10. Demo seed data

Seed one fictional tenant, **Northstar Facilities Group**, with: - 3
sites: Northstar Business Park, Riverside Retail Centre, and Greenfield
Campus. - 8--12 assets across HVAC, lighting, plumbing, fire/safety
equipment and generators. - 8--12 fictional workers/contractors. -
15--25 work orders across multiple statuses, priorities and due dates. -
5--8 compliance items, including valid, expiring and expired examples. -
2 inspection templates and 4--6 inspection runs, including a failed
inspection with a defect. - At least 2 pending client approvals. -
Enough historical activity to make charts meaningful.

Seed data must be obviously fictional and safe to show publicly. Do not
use real customer or personal data. Include a script/command to reseed a
development/demo database without deleting production data.

## 11. Security, privacy and operational requirements

-   HTTPS in deployment.
-   Secure, provider-managed password storage; never store raw
    passwords.
-   Environment secrets only on server.
-   CSRF protection where relevant; safe cookie/session settings.
-   Input validation and output encoding.
-   Rate limiting for auth and AI endpoints.
-   File type and size limits; validate uploads.
-   Private bucket/object permissions.
-   Audit events for assignments, status changes, approvals, compliance
    overrides, role changes and exports where appropriate.
-   Data export and deletion policy documented.
-   Backups and restore procedure documented for deployed database.
-   Avoid collecting unnecessary personal data.
-   Never use demo data as training data for an external model without
    explicit authorization.
-   Add dependency scanning/linting where available.
-   Document security limitations; do not claim SOC 2, ISO 27001, GDPR
    compliance or other certifications without evidence.

## 12. Implementation plan and working method

Work in these milestones:

**Milestone 0 --- Repository inspection** - Inspect existing files,
framework, environment, available integrations and build scripts. -
Report the current state briefly. - Do not delete existing work without
a reason.

**Milestone 1 --- Foundation** - Set up app shell, design system, auth,
tenant membership, database schema/migrations, RLS/authorization and
seed data. - Verify login, protected routes and tenant isolation.

**Milestone 2 --- Core operations** - Implement sites, assets,
people/contractors and work-order lifecycle. - Add timeline/activity,
comments, checklist and attachments. - Test the end-to-end lifecycle.

**Milestone 3 --- Quality and compliance** - Implement inspections,
defects, client approval/rework, compliance tracking and expiry views.

**Milestone 4 --- Command center and reports** - Implement real database
KPIs, charts, filters and CSV exports.

**Milestone 5 --- AI Copilot** - Add provider adapter, safe
database-backed tools, action previews, confirmation and fallback
behavior.

**Milestone 6 --- Hardening** - Add tests, error states, accessibility
checks, audit review, responsive QA, production build and deployment
documentation.

At the end of each milestone: 1. Summarize what was built. 2. List
files/modules changed. 3. Run relevant tests and report actual results.
4. List remaining defects and next milestone. 5. Do not claim a test
passed unless it was run.

## 13. Required deliverables

-   Working source code in the repository.
-   Database migrations/schema.
-   Seed script and demo data.
-   Authentication and role permissions.
-   Responsive UI for every required module.
-   `.env.example` with variable names and descriptions, but no secrets.
-   README with setup, local run, database/auth/storage configuration,
    seeding, testing, deployment and known limitations.
-   Automated tests for critical permissions and work-order lifecycle.
-   A feature checklist identifying complete, partial and not
    implemented items.
-   A short demo script for presenting USM Orbit to a prospective customer.
-   A list of recommended next features after beta.

## 14. Definition of done

The beta is ready to share with invited testers only when: - A user can
sign in securely. - Records persist across refreshes and sessions. - A
work order can be created, assigned, worked, inspected,
approved/rejected and closed. - Tenant and role boundaries have been
tested. - Dashboard and reports reflect actual database data. - Evidence
and compliance files are access-controlled. - The app handles errors and
empty states gracefully. - Build and critical tests pass. - Deployment
instructions are complete. - The app clearly labels demo data and any
unconfigured AI features.

Start by inspecting the existing repository and reporting the stack and
current state. Then implement Milestone 1 and continue through the
milestones. Prioritize a complete, reliable workflow over visual polish
or an excessive feature count.

------------------------------------------------------------------------

# Part B --- Product Requirements Specification (PRD)

## 1. Product summary

USM Orbit is a multi-tenant SaaS platform for coordinating facilities
service delivery across multiple sites. The beta focuses on operational
execution: requests, work orders, assignments, inspections, evidence,
compliance, approvals and reports.

## 2. Target users

  -----------------------------------------------------------------------
  User                    Need                    Beta value
  ----------------------- ----------------------- -----------------------
  Facilities manager      Visibility across sites Live dashboard, work
                          and service performance queue, SLA and
                                                  compliance

  Supervisor              Assign and monitor work Assignment, status
                                                  tracking, inspection
                                                  and rework

  Technician / cleaner    Clear instructions and  Mobile-friendly work
                          simple completion       details, checklists and
                                                  evidence

  Contractor manager      Coordinate external     Contractor records,
                          service providers       assigned work and
                                                  compliance

  Client approver         Validate work and       Approval queue with
                          evidence                approve/reject/rework

  Tenant admin            Control access and      Users, roles, sites and
                          configuration           settings

  Auditor                 Read-only evidence and  Audit trail, reports
                          history                 and compliance register
  -----------------------------------------------------------------------

## 3. Beta non-goals

Not included in the first beta: - Full IWMS/lease/space planning -
Payroll or HR management - Full ERP/procurement accounting - Building
management system control - Full BIM/CAD authoring - Real-time IoT
ingestion - Marketplace payments - Autonomous safety-critical actions -
Predictive maintenance claims without adequate historical/sensor data -
Regulatory certification claims

## 4. Core user journey

1.  Requester or manager creates a work order.
2.  Manager triages priority, site, due time and category.
3.  Manager assigns an eligible technician or contractor.
4.  Assignee starts work, follows checklist and adds comments/evidence.
5.  Assignee marks work ready for inspection.
6.  Supervisor inspects work and records defects or pass result.
7.  Client approver reviews the summary and evidence.
8.  Approver approves or rejects with reason.
9.  Rejected work returns to rework; accepted work can be closed.
10. Dashboard, asset history and reports update from the saved records.

## 5. Feature priority

  -----------------------------------------------------------------------
  ID                Feature           Priority          Reason
  ----------------- ----------------- ----------------- -----------------
  F-001             Authentication    P0                Required for a
                    and tenant                          shareable
                    isolation                           real-data beta

  F-002             Roles and         P0                Protects customer
                    site-scoped                         and operational
                    permissions                         data

  F-003             Work-order        P0                Core product
                    lifecycle                           value

  F-004             Sites and asset   P0                Context for every
                    register                            job

  F-005             People and        P0                Enables
                    contractor                          assignment
                    records                             

  F-006             Comments, events  P0                Operational
                    and evidence                        traceability

  F-007             Inspection and    P0                Quality control
                    defect workflow                     

  F-008             Client            P0                Core USM Orbit
                    approval/rework                     differentiating
                                                        workflow

  F-009             Compliance expiry P0                Useful
                    tracking                            operational risk
                                                        control

  F-010             Database-backed   P0                Demonstrable
                    dashboard                           management value

  F-011             CSV reports       P1                Useful for pilot
                                                        feedback

  F-012             AI request        P1                Low-risk initial
                    classification                      AI use

  F-013             AI operational    P1                Demonstrates
                    summaries                           intelligence

  F-014             Asset maintenance P1                Natural next
                    scheduling                          expansion

  F-015             Inventory and     P2                Expand after
                    procurement                         workflow
                                                        validation

  F-016             Computer vision   P2                Requires
                    inspection                          real-world
                                                        evaluation

  F-017             IoT/BMS           P2                Depends on
                    integration                         customer systems

  F-018             Vendor            P3                Network effects
                    marketplace                         require scale
  -----------------------------------------------------------------------

## 6. Main entities and relationships

-   Tenant has many memberships, sites, assets, people, contractors,
    work orders and compliance records.
-   Site has many assets, work orders, inspection runs and site-scoped
    access grants.
-   Asset belongs to a tenant and optionally a site; work orders can
    reference an asset.
-   Work order belongs to a site and may reference an asset, requester,
    assignee and contractor.
-   Work order has assignments, checklist items, comments, attachments
    and an append-only event history.
-   Inspection run may reference a site and work order; it has answers
    and defects.
-   Approval decision belongs to a work order and records approver,
    decision, reason and timestamp.
-   Compliance item belongs to a tenant and optionally references a
    site, asset, person or contractor.
-   Membership maps an authenticated user to a tenant and role; site
    access limits scope.
-   AI interaction log stores minimal operational metadata and links to
    the requesting user/tenant.

## 7. Status model

### Work orders

`new`, `triaged`, `assigned`, `in_progress`, `ready_for_inspection`,
`pending_approval`, `rework_required`, `approved`, `closed`,
`cancelled`.

### Inspection

`draft`, `in_progress`, `submitted`, `passed`, `failed`, `needs_review`.

### Compliance

`valid`, `expiring`, `expired`, `pending_review`, `not_applicable`.

### Approval decision

`approved`, `rejected`, `rework_requested`.

Status changes must be validated on the server and recorded in the event
history.

## 8. Notifications

For beta, in-app notifications are sufficient: - Work order
assigned/reassigned - Work order approaching or past due - Work
submitted for inspection/approval - Approval/rejection/rework
requested - Compliance item nearing expiry or expired - Assignment
blocked by a configured required credential

Email notifications can be added if transactional email is configured
and tested.

## 9. UX states

Every list/detail/form must support: - Loading - Empty state with useful
next action - Validation error - Permission denied - Network/server
error with retry - Save success - Unsaved changes where relevant - Not
found / archived record - AI unavailable or unconfigured

------------------------------------------------------------------------

# Part C --- Technical and QA Checklist

## Before development

-   [ ] Inspect the existing repo and preserve working code.
-   [ ] Confirm hosting, database, auth and file storage choices.
-   [ ] Create `.env.example`.
-   [ ] Define migration and seed workflow.
-   [ ] Define tenant and role access rules.

## Before inviting testers

-   [ ] Authentication and sign-out tested.
-   [ ] Password reset / account recovery tested if enabled.
-   [ ] Tenant isolation tested with two tenants.
-   [ ] Role permissions tested through UI and direct API calls.
-   [ ] Work-order lifecycle tested end to end.
-   [ ] Approval and rework paths tested.
-   [ ] Upload and private download permissions tested.
-   [ ] Dashboard counts match database records.
-   [ ] CSV export matches selected filters.
-   [ ] Mobile and desktop layout checked.
-   [ ] Keyboard focus and form labels checked.
-   [ ] No secrets committed to source control.
-   [ ] AI fallback works when no key is configured.
-   [ ] Database backup/restore procedure documented.
-   [ ] Demo dataset contains no real personal/customer information.
-   [ ] Build and critical tests pass.

## Demo script (5--7 minutes)

1.  Sign in as Facilities Manager.
2.  Show the command center and overdue work.
3.  Open a site and view its assets.
4.  Create a high-priority work order for an asset.
5.  Assign a technician or contractor.
6.  Sign in as the assignee and start work.
7.  Complete a checklist and upload evidence.
8.  Submit for inspection/approval.
9.  Sign in as approver and reject with a rework reason.
10. Show the rework event in the timeline, resolve it, approve and
    close.
11. Open reports and export work-order data.
12. Ask the AI Copilot to summarize open work; show the configured AI or
    clearly labeled demo fallback.

## Suggested environment variables

Names depend on the chosen stack; include only those actually used: -
`NEXT_PUBLIC_APP_URL` - `NEXT_PUBLIC_SUPABASE_URL` -
`NEXT_PUBLIC_SUPABASE_ANON_KEY` - `SUPABASE_SERVICE_ROLE_KEY` (server
only; never expose in client) - `DATABASE_URL` (if direct database
connection is used) - `AI_PROVIDER` - `AI_API_KEY` (server only) -
`AI_MODEL` - `STORAGE_BUCKET` - `EMAIL_PROVIDER_API_KEY` (only if email
is implemented)

Never commit real values. Use a secret manager in deployment.

------------------------------------------------------------------------

# Part D --- Product decisions to keep explicit

1.  **Beta is not yet a certified enterprise platform.** Describe it as
    a pilot/beta and document limitations.
2.  **AI is advisory first.** Any write action requires user review and
    confirmation.
3.  **No fake integration claims.** Use mock adapters only when clearly
    labelled as demo; never imply a live ERP/BMS integration.
4.  **No fake data metrics.** Dashboard values must be calculated from
    seeded or customer-entered database records.
5.  **No cross-tenant access.** Tenant isolation is a release blocker.
6.  **No broad feature creep.** Prioritize the request-to-sign-off
    workflow.
7.  **Build for extensibility, not premature complexity.** A modular
    monolith is acceptable for beta.
8.  **Keep the USM Orbit core central.** Keep workforce, contractor, work
    tracking, quality audit, compliance, stock-readiness and client
    sign-off central.

------------------------------------------------------------------------

# Part E --- Delivery Status

The beta described in this specification has been delivered in the
repository **github.com/satya928/USMorbit** (branch `main`):

-   All eleven navigation sections (Part A §5) are implemented with
    database-backed data, server-side authorization and tenant isolation.
-   The full work-order lifecycle, including inspection, client
    approval and rework, is covered by automated end-to-end tests.
-   Additions beyond this specification: Sign in with Google for invited
    users, an in-app beta feedback link, a tenant provisioning tool and a
    one-click test-hosting blueprint.
-   Feature-by-feature status: `docs/FEATURES.md`. Setup, tests and
    deployment: `README.md` and `docs/DEPLOYMENT.md`. Plan and roadmap:
    `docs/USM_Orbit_Project_Plan_and_Status.pdf`.

The next build phases follow the USM Orbit business plan roadmap: site
attendance and projects (Phase 1 completion), the compliance library and
safety (Phase 2), inventory (Phase 3), Orbit Academy (Phase 4) and
intelligent operations (Phase 5).

------------------------------------------------------------------------

## End of specification
