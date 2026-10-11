/**
 * Component accessibility checks (vitest-axe), redesign Phase 7.
 *
 * `checkAxeAfterEach()` runs axe on whatever a test left rendered, after
 * every test in the file, so each state a test drives is checked too.
 * jsdom can't compute colour, so contrast is left to the token contract
 * (`src/design/tokens/tokens.test.ts`) and to the Playwright suite; and a
 * component rendered alone has no page landmarks, so "region" is off here.
 */
import { cleanup } from "@testing-library/react";
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

// axe on a big view (the review desk's 200 rows) takes more than Vitest's 10 s hook default on a
// small CI runner.
const AXE_TIMEOUT_MS = 30_000;

export function checkAxeAfterEach() {
  afterEach(async () => {
    if (document.body.childElementCount === 0) return;
    try {
      expect(await axe(document.body)).toHaveNoViolations();
    } finally {
      // A failed check skips the hooks after it, the setup's cleanup among them; unmounting here
      // keeps one failure from leaving its view under every later test in the file.
      cleanup();
    }
  }, AXE_TIMEOUT_MS);
}
