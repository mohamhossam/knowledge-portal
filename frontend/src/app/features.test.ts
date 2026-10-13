import { afterEach, describe, expect, it, vi } from "vitest";

/** features.ts reads import.meta.env once, on import: each case imports it afresh. */
async function features(env: Record<string, string | boolean | undefined>) {
  for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value as string);
  vi.resetModules();
  return import("./features");
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("the build-time switches", () => {
  it("turns the catalogue lab on under the dev server", async () => {
    expect((await features({ DEV: true, VITE_CATALOGUE_LAB: undefined })).catalogueLabEnabled).toBe(true);
  });

  it("leaves the lab out of a production build unless VITE_CATALOGUE_LAB is exactly \"true\"", async () => {
    expect((await features({ DEV: false, VITE_CATALOGUE_LAB: undefined })).catalogueLabEnabled).toBe(false);
    expect((await features({ DEV: false, VITE_CATALOGUE_LAB: "yes" })).catalogueLabEnabled).toBe(false);
    expect((await features({ DEV: false, VITE_CATALOGUE_LAB: "true" })).catalogueLabEnabled).toBe(true);
  });

  it("has no loader for the lab where it is off, so its code is never fetched", async () => {
    expect((await features({ DEV: false, VITE_CATALOGUE_LAB: undefined })).loadCatalogueLab).toBeNull();
    expect((await features({ DEV: true })).loadCatalogueLab).toBeTypeOf("function");
  });

  it("starts the lab on the API unless the sample is asked for by name", async () => {
    expect((await features({ VITE_CATALOGUE_SOURCE: undefined })).catalogueSourceSetting).toBe("api");
    expect((await features({ VITE_CATALOGUE_SOURCE: "Sample" })).catalogueSourceSetting).toBe("api");
    expect((await features({ VITE_CATALOGUE_SOURCE: "sample" })).catalogueSourceSetting).toBe("sample");
  });
});
