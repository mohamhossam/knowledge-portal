/**
 * Focus mode (UX rebuild plan, phase 2), keyboard only: To do starts a review
 * and a draft's decisions one question at a time. Number keys answer, Enter
 * goes on, Esc leaves; leaving with unsent answers asks first. Nothing here
 * saves or sends, so the seed stays as it is for every other spec.
 */
import { expect, settled, test } from "./fixtures";
import { seeded } from "./routes";

test("keyboard only: a library review, one question at a time, to its summary", async ({ page }) => {
  const { reviewDocument } = await seeded();
  test.skip(!reviewDocument, "this seed has no document waiting for review");
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`library/${reviewDocument}/focus`);
  await settled(page);

  // Opened directly, the skip link stays first; each next question's heading takes focus.
  const heading = page.getByRole("heading", { level: 1 });
  await expect(page.getByText(/^0 of \d+ answered$/)).toBeVisible();

  // Answer each one with its first choice and Enter, until the summary.
  for (let step = 0; step < 10 && !(await page.getByRole("button", { name: /^Publish version/ }).isVisible()); step += 1) {
    const before = await heading.textContent();
    const notice = page.getByRole("button", { name: /^(Noted, next|Go on to the other questions)$/ });
    if (await notice.isVisible()) {
      await notice.focus();
      await page.keyboard.press("Enter");
    } else {
      await page.keyboard.press("1");
      await expect(page.getByRole("radio").first()).toBeChecked();
      await page.keyboard.press("Enter");
    }
    await expect(heading).not.toHaveText(before ?? "");
    await expect(heading).toBeFocused();
  }
  await expect(heading).toHaveText(/^Publish version \d+\?$/);
  await expect(page.getByRole("region", { name: "What is published" })).toBeVisible();

  // Esc leaves for the full review, where the same answers show.
  await heading.focus();
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(new RegExp(`library/${reviewDocument}$`));
});

test("keyboard only: a draft's decisions beside the tree, and leaving asks before answers are lost", async ({ page }) => {
  const { draft } = await seeded();
  test.skip(!draft, "this seed has no draft");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("");
  await settled(page);

  // To do starts it in focus mode.
  const task = page.getByRole("region", { name: /Decisions waiting on you/ }).getByRole("link", { name: /^Start ?: .*integration/i });
  await task.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/decide\/focus\?from=todo$/);
  await settled(page);
  const heading = page.getByRole("heading", { level: 1 });
  await expect(heading).toBeFocused();
  await expect(page.getByRole("img", { name: /What waits on what/ }).or(page.getByRole("figure", { name: /What waits on what/ })).first()).toBeVisible();

  // The last choice rejects; Enter goes on.
  const first = await heading.textContent();
  const choices = await page.getByRole("radio").count();
  await page.keyboard.press(String(choices));
  await page.keyboard.press("Enter");
  await expect(heading).not.toHaveText(first ?? "");
  await expect(page.getByText(/^1 of \d+ answered$/)).toBeVisible();

  // Esc asks first; staying keeps the answer.
  await page.keyboard.press("Escape");
  const ask = page.getByRole("dialog", { name: "Leave without sending your answers?" });
  await expect(ask).toBeVisible();
  await expect(ask.getByRole("button", { name: "Stay" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(ask).toBeHidden();
  await expect(page.getByText(/^1 of \d+ answered$/)).toBeVisible();

  // Leaving without sending goes back to To do, and sends nothing.
  await page.keyboard.press("Escape");
  await ask.getByRole("button", { name: "Leave without sending" }).click();
  await expect(page).toHaveURL(/\/knowledge\/?$/);
});
