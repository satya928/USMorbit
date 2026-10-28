# USM Orbit — 6-minute demo script

Setup: a demo instance with `DEMO_MODE=true` and freshly seeded data (`npm run db:reset`). Password for all demo accounts: `Orbit-Demo-2026`. Use two browser profiles (or a private window) to switch roles quickly.

1. **Sign in as Facilities Manager** — `manager@northstar.demo`.
   *"Northstar runs three sites. This is the live Command Center — every number comes from the records."*
2. **Command Center.** Point out overdue work, SLA %, compliance expiring in 30 days, and site performance. Change the period to *Last 7 days* and the site to *Riverside Retail Centre* — all figures update.
3. **Open a site.** Sites → *Riverside Retail Centre*: assets, recent work, compliance (fire safety statement expiring), inspections.
4. **Create a high-priority work order for an asset.** From asset *RRC-HVAC-01 — Food court split system* → *Raise work order*. Title "Split system tripping breaker", category **Electrical**, priority **High**. Note the SLA due time applied automatically.
5. **Assign.** In *Assignment*, choose **Sam Ortiz** — USM Orbit flags the expired Electrical Licence and blocks assignment. Choose **Jordan Lee** instead (valid licence) → Assign.
6. **Switch to the technician** — `tech@northstar.demo` (show it on a phone-sized window). Open the job, *Start work*, tick the checklist, upload a photo, add a comment, *Mark ready for inspection*.
7. **Supervisor inspection** — `supervisor@northstar.demo` → Approvals → *Pass & send for approval*.
8. **Client rejects** — `client@northstar.demo` → Approvals → *Reject* with reason "Cover plate not refitted". Note that clients never see internal notes.
9. **Show rework in the timeline**, then as the technician *Start work* → *Mark ready*, as supervisor *Pass*, as client *Approve*, and as manager *Close work order*. The timeline shows every step, actor and reason.
10. **Reports** — Reports → *Approval & rework cycle* and *Work-order register*; filter to Riverside and *Export CSV* (filters and generation time are in the file header).
11. **AI Copilot** — ask "Which work orders are overdue and what are the likely blockers?" and "Draft a work order from this issue: water leaking above the food court entrance". Point out the *Demo mode* / *AI* label, the source links, and that the draft is only created after review.

Close: *"Request to sign-off, with evidence, compliance and an audit trail, in one place — and it's built multi-tenant from day one."*
