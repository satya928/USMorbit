import { expect, test, type Page } from "@playwright/test";

const PASSWORD = "Orbit-Demo-2026";
const PNG = Buffer.from("89504e470d0a1a0a0000000d4948445200000001000000010806000000" + "1f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082", "hex");

async function signIn(page: Page, email: string) {
  await page.context().clearCookies();
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/dashboard");
}

async function act(page: Page, name: string, reason?: string) {
  await page.getByRole("button", { name, exact: true }).click();
  if (reason) {
    await page.getByLabel(/reason/i).fill(reason);
    await page.getByRole("button", { name, exact: true }).click();
  }
  await expect(page.getByText(/— done\./)).toBeVisible();
}

test("full work-order lifecycle across roles, with rework", async ({ page }) => {
  const title = `E2E leaking pipe ${Date.now()}`;

  // Facilities manager creates and assigns.
  await signIn(page, "manager@northstar.demo");
  const openBefore = Number(await page.getByRole("link", { name: /Open work orders/ }).locator("div.text-3xl").innerText());
  await page.goto("/work-orders/new");
  await page.getByLabel("Title").fill(title);
  await page.getByLabel("Site").selectOption({ label: "Riverside Retail Centre" });
  await page.getByLabel("Category").selectOption({ label: "Plumbing" });
  await page.getByLabel("Priority").selectOption("high");
  await page.getByLabel("Checklist").fill("Isolate water supply\nReplace pipe section");
  await page.getByRole("button", { name: "Create work order" }).click();
  await expect(page.getByText(/Work order WO-\d+ created/)).toBeVisible();
  const woUrl = page.url().split("?")[0];
  await page.reload();
  await expect(page.getByRole("heading", { name: title })).toBeVisible();

  await page.getByLabel("Person").selectOption({ label: "Jordan Lee" });
  await page.getByRole("button", { name: "Assign" }).click();
  await expect(page.getByText(/assigned\./)).toBeVisible();
  await page.goto("/dashboard");
  await expect(page.getByRole("link", { name: /Open work orders/ }).locator("div.text-3xl")).toHaveText(String(openBefore + 1));

  // Technician starts, completes the checklist, uploads evidence and submits.
  await signIn(page, "tech@northstar.demo");
  await page.goto(woUrl);
  await act(page, "Start work");
  await page.getByRole("checkbox", { name: /Isolate water supply/ }).check();
  await expect(page.getByText("Checklist (1/2)")).toBeVisible();
  await page.getByRole("checkbox", { name: /Replace pipe section/ }).check();
  await expect(page.getByText("Checklist (2/2)")).toBeVisible();
  await page.getByLabel("Upload evidence").setInputFiles({ name: "after.png", mimeType: "image/png", buffer: PNG });
  await page.getByRole("button", { name: "Upload", exact: true }).click();
  await expect(page.getByText("Evidence (1)")).toBeVisible();
  await page.getByLabel("Add a comment").fill("Pipe replaced, tested for 10 minutes.");
  await page.getByRole("button", { name: "Post" }).click();
  await expect(page.getByText("Pipe replaced, tested for 10 minutes.")).toBeVisible();
  await act(page, "Mark ready for inspection");
  await expect(page.getByRole("button", { name: "Approve" })).toHaveCount(0);

  // Supervisor passes inspection.
  await signIn(page, "supervisor@northstar.demo");
  await page.goto(woUrl);
  await act(page, "Pass inspection & submit for approval");

  // Client rejects with a reason → rework.
  await signIn(page, "client@northstar.demo");
  await page.goto("/approvals");
  await expect(page.getByText(title)).toBeVisible();
  await page.goto(woUrl);
  await expect(page.getByText("Internal notes")).toHaveCount(0);
  await act(page, "Reject", "Insulation was not reinstated around the new section.");
  await expect(page.getByText("Rework required").first()).toBeVisible();
  await expect(page.getByText("Reason: Insulation was not reinstated around the new section.")).toBeVisible();

  // Technician reworks and resubmits; supervisor passes; client approves; manager closes.
  await signIn(page, "tech@northstar.demo");
  await page.goto(woUrl);
  await act(page, "Start work");
  await act(page, "Mark ready for inspection");
  await signIn(page, "supervisor@northstar.demo");
  await page.goto(woUrl);
  await act(page, "Pass inspection & submit for approval");
  await signIn(page, "client@northstar.demo");
  await page.goto(woUrl);
  await act(page, "Approve");
  await signIn(page, "manager@northstar.demo");
  await page.goto(woUrl);
  await act(page, "Close work order");
  await expect(page.getByText("Closed").first()).toBeVisible();
  await expect(page.getByText("This work order is complete.")).toBeVisible();
  await page.reload();
  for (const t of ["Created the work order", "Assigned to Jordan Lee", "Reject", "Approve", "Close work order"]) {
    await expect(page.getByText(t, { exact: false }).first()).toBeVisible();
  }
  await page.goto("/dashboard");
  await expect(page.getByRole("link", { name: /Open work orders/ }).locator("div.text-3xl")).toHaveText(String(openBefore));
});

test("credential rule blocks assignment and requires an override reason", async ({ page }) => {
  await signIn(page, "manager@northstar.demo");
  await page.goto("/work-orders/new");
  await page.getByLabel("Title").fill(`E2E replace RCD ${Date.now()}`);
  await page.getByLabel("Site").selectOption({ label: "Northstar Business Park" });
  await page.getByLabel("Category").selectOption({ label: "Electrical (requires Electrical Licence)" });
  await page.getByRole("button", { name: "Create work order" }).click();
  await expect(page.getByText(/created/)).toBeVisible();
  await page.getByLabel("Person").selectOption({ label: "Sam Ortiz ⚠ credential issue" });
  await expect(page.getByText(/credential is expired/)).toBeVisible();
  await page.getByLabel("Override reason").fill("Renewal confirmed with the licensing authority today.");
  await page.getByRole("button", { name: "Assign" }).click();
  await expect(page.getByText(/assigned\./)).toBeVisible();
  await expect(page.getByText(/Credential override: Renewal confirmed/)).toBeVisible();
});

test("access control on pages and API endpoints", async ({ page, request }) => {
  expect((await request.get("/api/reports/work-orders")).status()).toBe(401);
  expect((await request.get("/api/files/00000000-0000-0000-0000-000000000000")).status()).toBe(401);

  await signIn(page, "tech@northstar.demo");
  await page.goto("/settings");
  await expect(page.getByText("You don't have access to this page")).toBeVisible();
  expect((await page.request.get("/api/reports/work-orders")).status()).toBe(403);

  await signIn(page, "admin@harbourline.demo");
  await page.goto("/work-orders");
  await expect(page.getByRole("link", { name: "Harbourline lobby door closer adjustment" })).toBeVisible();
  await expect(page.getByText("Fire indicator panel")).toHaveCount(0);
});

test("reports export CSV with filters, and the copilot answers in labelled demo mode", async ({ page }) => {
  await signIn(page, "manager@northstar.demo");
  await page.goto("/reports?report=work-orders&from=2020-01-01");
  await page.getByLabel("Site").selectOption({ label: "Riverside Retail Centre" });
  await page.getByRole("button", { name: "Run report" }).click();
  await page.waitForURL(/site=/);
  const href = await page.getByRole("link", { name: "Export CSV" }).getAttribute("href");
  const res = await page.request.get(href!);
  expect(res.status()).toBe(200);
  const csv = await res.text();
  expect(csv).toContain("site=Riverside Retail Centre");
  const rows = csv.split("\r\n").filter((l) => l && !l.startsWith("#")).slice(1);
  expect(rows.length).toBeGreaterThan(0);
  expect(rows.every((r) => r.includes("Riverside Retail Centre"))).toBe(true);

  await page.goto("/copilot");
  await expect(page.getByText("AI provider not configured")).toBeVisible();
  await page.getByRole("button", { name: "Which work orders are overdue and what are the likely blockers?" }).click();
  await expect(page.getByText("Demo mode — deterministic lookup, not AI")).toBeVisible();
  await expect(page.getByText(/overdue work order/)).toBeVisible();
  await page.getByLabel("Ask the Copilot").fill("Draft a work order from this issue: Water leaking from the ceiling at Riverside Retail Centre food court");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("Proposed work order — not created yet")).toBeVisible();
  await page.getByRole("link", { name: "Review & create" }).click();
  await expect(page.getByText("Prefilled from an AI Copilot draft")).toBeVisible();
  await expect(page.getByLabel("Site")).toHaveValue(/.+/);
});
