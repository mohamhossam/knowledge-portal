import { describe, expect, it } from "vitest";

import { basePath } from "./basePath";

describe("basePath", () => {
  it("defaults to /knowledge/", () => {
    expect(basePath(undefined)).toBe("/knowledge/");
  });

  it("serves at the root of its own hostname", () => {
    expect(basePath("/")).toBe("/");
    expect(basePath("")).toBe("/");
  });

  it("always has a leading and a trailing slash", () => {
    expect(basePath("portal")).toBe("/portal/");
    expect(basePath(" /tools/knowledge ")).toBe("/tools/knowledge/");
  });
});
