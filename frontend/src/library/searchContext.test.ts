import { expect, it } from "vitest";

import { contextPlaces } from "./searchContext";

it("sets each place of the surrounding text apart, marks the cited one, and drops heading markers", () => {
  const text = "Line 1\n# Ordering a bundle\n\nLine 2\nConfirm coverage.\n\nLine 3\nQuote it.";
  expect(contextPlaces(text, "Line 2")).toEqual([
    { location: "Line 1", text: "Ordering a bundle", cited: false },
    { location: "Line 2", text: "Confirm coverage.", cited: true },
    { location: "Line 3", text: "Quote it.", cited: false },
  ]);
});

it("keeps surrounding text that names no places, as one block", () => {
  expect(contextPlaces("Before and after.", "Line 4")).toEqual([{ location: "Line 4", text: "Before and after.", cited: true }]);
});
