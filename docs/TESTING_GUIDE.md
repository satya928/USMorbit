# USM Orbit beta — tester guide

Thank you for testing USM Orbit, an AI facilities operations platform. This beta contains **fictional demo data only** — do not enter real customer or personal information.

## 1. Getting in
- Open the test link you were given (if the page takes ~1 minute to load the first time, the free test server is waking up — this is expected).
- Sign in with one of the accounts below. **Password for every account: `Orbit-Demo-2026`**

| Try it as… | Email | What this person can do |
| --- | --- | --- |
| Facilities Manager | `manager@northstar.demo` | Everything operational: create/assign work, approve, close, reports, AI Copilot |
| Technician | `tech@northstar.demo` | Only their own jobs: start work, checklist, photos, comments, submit |
| Technician (expired licence) | `tech2@northstar.demo` | As above — cannot be assigned electrical work |
| Supervisor | `supervisor@northstar.demo` | Inspect completed work, pass or return for rework (2 of 3 sites) |
| Client Approver | `client@northstar.demo` | Approve / reject / request rework on their sites; raise requests |
| Contractor Manager | `contractor@northstar.demo` | Only Coolflow Mechanical's jobs, staff and compliance |
| Tenant Admin | `admin@northstar.demo` | Settings: users, roles, site access, categories, SLA, audit log |
| Auditor | `auditor@northstar.demo` | Read-only everything, audit log, report exports |
| Another company | `admin@harbourline.demo` | A separate customer — should never see Northstar data |

If the sign-in page shows **Continue with Google**, testers who were invited with their own Google email can use that instead of a password.

Tip: use a normal window for one role and a private/incognito window for another, so you can watch work move between people.

## 2. Test scenarios (please tick what you tried)

**A. The core job lifecycle (15 min)**
- [ ] As **manager**: Work Orders → *New work order* at *Riverside Retail Centre*, category **Plumbing**, priority **High**. Check the SLA due time is filled in automatically.
- [ ] Assign it to **Jordan Lee**.
- [ ] As **tech**: open the job, *Start work*, tick the checklist, upload a photo (from your phone if possible), add a comment, *Mark ready for inspection*. Try *Mark ready* before finishing the checklist — it should refuse.
- [ ] As **supervisor**: Approvals → *Pass & send for approval*.
- [ ] As **client**: Approvals → *Reject* with a reason. Confirm the job shows *Rework required* and the reason appears in the timeline.
- [ ] Repeat tech → supervisor → client (*Approve*) → manager (*Close work order*). Check the timeline tells the whole story.

**B. Compliance & safety rules (5 min)**
- [ ] As **manager**: create an **Electrical** work order and try to assign **Sam Ortiz** — it should warn that his licence has expired and require an override reason.
- [ ] Compliance → *Expiring ≤30d* and *Expired*: do the lists make sense? Edit an expiry date and check the status changes.

**C. Inspections (5 min)**
- [ ] As **supervisor**: Inspections → *Start inspection* (Washroom audit, Riverside). Mark one item **Fail**, record a defect, submit. Then click *Create work order* on the defect.

**D. Dashboard, reports, AI (5 min)**
- [ ] As **manager**: Command Center — change the period and site filters; do the numbers change sensibly?
- [ ] Reports → pick a report, filter by site, *Export CSV*, open it in Excel/Google Sheets.
- [ ] AI Copilot: try the suggested questions, then type your own (e.g. "What's overdue at Riverside?"). Try "Draft a work order from this issue: …" and *Review & create*.

**E. Permissions (5 min)**
- [ ] As **tech**: you should not see Settings, Reports or Compliance, and only your own jobs.
- [ ] As **client**: internal notes (yellow boxes) must never appear.
- [ ] As **admin@harbourline.demo**: you must see only Harbourline data — no Northstar sites, jobs or people.

**F. On your phone**
- [ ] Sign in as **tech** on a phone. Is it easy to find a job, tick items and take a photo?

## 3. Reporting problems and ideas
Use the **Beta feedback** button in the app header (if shown), or create an issue in the GitHub repository using the *Bug report* template. Please include:
1. Which account you were signed in as
2. The page address (URL) and what you clicked
3. What you expected vs what happened (a screenshot helps a lot)
4. Phone or computer, and which browser

## 4. Known limits of this test version
- Demo data only; the test server may be reset to the starting data at any time.
- On the free test server, uploaded photos may disappear after a restart.
- The free server sleeps when idle — the first visit can take about a minute.
- AI answers say **"Demo mode — deterministic lookup, not AI"** unless an AI key has been configured on the server.
- Not yet included: GPS check-in/out and timesheets, projects/scope of work, inventory, training academy, safety (toolbox talks, incidents), invoicing, email notifications, native mobile apps.
