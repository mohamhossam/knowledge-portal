import { afterEach, describe, expect, it, vi } from "vitest";

import { api } from "./client";
import { ApiError } from "./errors";

function respond(status: number, body: unknown) {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })));
}

const withheld = "The service could not complete the request.";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("an error the service names only by its code", () => {
  it("says the malware scanner didn't answer, where the service withholds why", async () => {
    respond(503, { code: "malware_scanner_unavailable", message: withheld, correlation_id: "c-1" });

    const failure = await api.previewCatalogueFile("d", new File(["systems: []"], "catalogue.yaml")).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ApiError);
    const error = failure as ApiError;
    expect(error.status).toBe(503);
    expect(error.code).toBe("malware_scanner_unavailable");
    expect(error.message).toMatch(/malware scanner didn't answer, so the file was not taken/);
    expect(error.correlationId).toBe("c-1");
  });

  it("keeps the service's own message for any other code", async () => {
    respond(503, { code: "document_extraction_busy", message: withheld });

    const failure = await api.previewCatalogueFile("d", new File(["x"], "catalogue.yaml")).catch((error: unknown) => error);

    expect((failure as ApiError).message).toBe(withheld);
  });

  it("does not read a code named after an object's own properties", async () => {
    respond(422, { code: "constructor", message: "Refused." });

    const failure = await api.previewCatalogueFile("d", new File(["x"], "catalogue.yaml")).catch((error: unknown) => error);

    expect((failure as ApiError).message).toBe("Refused.");
  });
});
