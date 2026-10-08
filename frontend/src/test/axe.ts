/**
 * Component accessibility checks (vitest-axe), redesign Phase 7.
 *
 * `checkAxeAfterEach()` runs axe on whatever a test left rendered, after
 * every test in the file, so each state a test drives is checked too.
 * jsdom can't compute colour, so contrast is left to the token contract
 * (`src/design/tokens/tokens.test.ts`) and to the Playwright suite; and a
 * component rendered alone has no page landmarks, so "region" is off here.
 */
import { afterEach, expect } from "vitest";
import { configureAxe } from "vitest-axe";
import * as matchers from "vitest-axe/matchers";

expect.extend(matchers);

// Vitest 5 types custom matchers through `Matchers<R, T>` (its parameters must match exactly).
declare module "vitest" {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface Matchers<R extends void | Promise<void> = void | Promise<void>, T = unknown> {
    toHaveNoViolations(): R;
  }
}

export const axe = configureAxe({
  rules: {
    "color-contrast": { enabled: false },
    region: { enabled: false },
  },
});

export function checkAxeAfterEach() {
  afterEach(async () => {
    if (document.body.childElementCount === 0) return;
    expect(await axe(document.body)).toHaveNoViolations();
  });
}
