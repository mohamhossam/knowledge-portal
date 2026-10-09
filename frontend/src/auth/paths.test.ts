import { describe, expect, it } from "vitest";

import { pageRequirementPortalUrl, requirementPortalUrl, requirementWorkHref } from "./paths";

describe("requirementPortalUrl", () => {
  it("defaults to the platform's root when nothing is configured", () => {
    expect(requirementPortalUrl(undefined)).toBe("/");
  });

  it("uses the configured address, ending it with a slash", () => {
    expect(requirementPortalUrl(" https://requirements.example.com ")).toBe("https://requirements.example.com/");
  });

  it("is absent when configured empty, so no link to requirement work is shown", () => {
    expect(requirementPortalUrl("")).toBeNull();
  });
});

describe("requirementWorkHref", () => {
  it("joins a page of requirement work onto its address", () => {
    expect(requirementWorkHref("requirements/R-1", "/")).toBe("/requirements/R-1");
    expect(requirementWorkHref("/requirements/R-1", "https://requirements.example.com/"))
      .toBe("https://requirements.example.com/requirements/R-1");
  });

  it("is absent without requirement work", () => {
    expect(requirementWorkHref("requirements/R-1", null)).toBeNull();
  });
});

describe("pageRequirementPortalUrl", () => {
  const page = (content: string | null) => {
    const doc = document.implementation.createHTMLDocument();
    if (content !== null) {
      const meta = doc.createElement("meta");
      meta.name = "requirement-portal-url";
      meta.content = content;
      doc.head.append(meta);
    }
    return doc;
  };

  it("takes the address the container filled in", () => {
    expect(pageRequirementPortalUrl(page("https://requirements.example.com/"))).toBe("https://requirements.example.com/");
  });

  it("keeps an empty address, which leaves out every link", () => {
    expect(pageRequirementPortalUrl(page(""))).toBe("");
  });

  it("says nothing when the placeholder was not filled in or is missing", () => {
    expect(pageRequirementPortalUrl(page("__REQUIREMENT_PORTAL_URL__"))).toBeUndefined();
    expect(pageRequirementPortalUrl(page(null))).toBeUndefined();
  });
});
