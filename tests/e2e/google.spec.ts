import { expect, test } from "@playwright/test";

const MOCK = "http://localhost:4555";

test("Sign in with Google: invited user gets in, unknown and unverified accounts are refused", async ({ page, request }) => {
  // Invited user (exists in the workspace) → lands on the dashboard as themselves.
  await request.get(`${MOCK}/set?email=tech@northstar.demo&sub=g-e2e-tech`);
  await page.goto("/sign-in");
  await page.getByRole("link", { name: "Continue with Google" }).click();
  await page.waitForURL("**/dashboard");
  await expect(page.getByText("Jordan Lee").first()).toBeVisible();

  // Someone with a Google account but no invitation → clear refusal, no session.
  await page.context().clearCookies();
  await request.get(`${MOCK}/set?email=stranger@gmail.example&sub=g-e2e-stranger`);
  await page.goto("/sign-in");
  await page.getByRole("link", { name: "Continue with Google" }).click();
  await page.waitForURL(/sign-in\?error=no_account/);
  await expect(page.getByText("There is no USM Orbit account for that Google email")).toBeVisible();
  await page.goto("/dashboard");
  await page.waitForURL(/sign-in/);

  // Unverified Google email → refused.
  await request.get(`${MOCK}/set?email=manager@northstar.demo&sub=g-e2e-unverified&verified=false`);
  await page.goto("/sign-in");
  await page.getByRole("link", { name: "Continue with Google" }).click();
  await page.waitForURL(/error=google_unverified/);

  // A forged callback (state not issued to this browser) is rejected.
  await page.goto("/api/auth/google/callback?code=abc&state=forged");
  await page.waitForURL(/error=google_state/);
  await expect(page.getByText("Your sign-in attempt expired")).toBeVisible();
});
