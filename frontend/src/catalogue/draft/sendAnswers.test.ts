import { describe, expect, it } from "vitest";

import type { Suggestion } from "../../api/client";
import { ApiError } from "../../api/errors";
import { passes, sendAnswers, type SendPlan, type SendPort } from "./sendAnswers";

const system = (id: string, systemId: string): Suggestion =>
  ({ id, status: "proposed", content: { kind: "system", system_id: systemId } }) as unknown as Suggestion;

/** A draft that records each call, in order; each part can be told to fail. */
function fakeDraft(overrides: Partial<SendPort> = {}, suggestions: Suggestion[] = []) {
  const calls: string[] = [];
  const port: SendPort = {
    decide: async ({ suggestionId, accept }) => {
      calls.push(`${accept ? "accept" : "reject"} ${suggestionId}`);
      return suggestionId !== "refused";
    },
    acceptReady: async () => {
      calls.push("accept ready");
      return { remaining: 2 };
    },
    settleSubject: async ({ system_id }) => {
      calls.push(`suggest ${system_id}`);
      return {};
    },
    refetchSuggestions: async () => {
      calls.push("read suggestions");
      return suggestions;
    },
    ...overrides,
  };
  return { port, calls };
}

const plan = (overrides: Partial<SendPlan> = {}): SendPlan => ({
  rejected: [{ suggestionId: "r1", accept: false, content: null }],
  accepted: [{ suggestionId: "a1", accept: true, content: null }],
  first: { accept: [], add: [] },
  withFollowing: false,
  ...overrides,
});

describe("sending the Decide answers", () => {
  it("sends rejections, then what is ready, then the systems answers need, then the answers, then what they made ready", async () => {
    const { port, calls } = fakeDraft({}, [system("s-crm", "crm"), system("s-new", "new-one"), system("s-other", "other")]);
    const outcome = await sendAnswers(port, plan({ first: { accept: ["s-crm"], add: [{ id: "new-one", name: "New One" }] }, withFollowing: true }));
    expect(calls).toEqual([
      "reject r1",
      "accept ready",
      "suggest new-one",
      "read suggestions",
      "accept s-crm",
      "accept s-new",
      "accept a1",
      "accept ready",
    ]);
    expect(outcome).toEqual({ done: 2, refused: 0, systems: 2, remaining: 2 });
  });

  it("reads the suggestions again only when systems are needed, and accepts what is ready only when asked", async () => {
    const { port, calls } = fakeDraft();
    expect(await sendAnswers(port, plan())).toEqual({ done: 2, refused: 0, systems: 0, remaining: 0 });
    expect(calls).toEqual(["reject r1", "accept a1"]);
  });

  it("counts an answer the service refused, and sends the rest", async () => {
    const { port, calls } = fakeDraft();
    const outcome = await sendAnswers(port, plan({ accepted: [{ suggestionId: "refused", accept: true, content: null }, { suggestionId: "a2", accept: true, content: null }] }));
    expect(outcome).toMatchObject({ done: 2, refused: 1 });
    expect(calls.at(-1)).toBe("accept a2");
  });

  it("passes over a system the draft already has, one nothing waits for any more, or a draft that moved on", async () => {
    for (const refusal of [
      new ApiError(422, "The draft already has the system New One.", "invalid_architecture_knowledge"),
      new ApiError(404, "No suggestion waiting in the draft names New One.", "catalogue_suggestion_not_found"),
      new ApiError(409, "The draft changed; reload before deciding.", "architecture_knowledge_conflict"),
    ]) {
      const { port, calls } = fakeDraft({ settleSubject: async () => { throw refusal; } });
      await expect(sendAnswers(port, plan({ first: { accept: [], add: [{ id: "new-one", name: "New One" }] } }))).resolves.toMatchObject({ done: 2 });
      expect(calls).toContain("accept a1");
    }
  });

  it("passes over a draft that moved on while accepting what is ready, and keeps the answers going", async () => {
    const { port, calls } = fakeDraft({ acceptReady: async () => { throw new ApiError(409, "The draft changed; reload before deciding.", "architecture_knowledge_conflict"); } });
    await expect(sendAnswers(port, plan({ withFollowing: true }))).resolves.toEqual({ done: 2, refused: 0, systems: 0, remaining: 0 });
    expect(calls).toEqual(["reject r1", "accept a1"]);
  });

  it("stops on any other failure, so the person sees it, and sends nothing after it", async () => {
    const broken = new ApiError(500, "The knowledge service failed.", "internal");
    const { port, calls } = fakeDraft({ settleSubject: async () => { throw broken; } });
    await expect(sendAnswers(port, plan({ first: { accept: [], add: [{ id: "new-one", name: "New One" }] } }))).rejects.toBe(broken);
    expect(calls).toEqual(["reject r1"]);

    const offline = new TypeError("Failed to fetch");
    const ready = fakeDraft({ acceptReady: async () => { throw offline; } });
    await expect(sendAnswers(ready.port, plan({ withFollowing: true }))).rejects.toBe(offline);
    expect(ready.calls).toEqual(["reject r1"]);
  });

  it("only passes over a 422 or 404 with the code that says the work is done", () => {
    const settle = [{ status: 422, code: "invalid_architecture_knowledge" }];
    expect(passes(new ApiError(422, "x", "invalid_architecture_knowledge"), settle)).toBe(true);
    expect(passes(new ApiError(422, "x", "invalid_input"), settle)).toBe(false);
    expect(passes(new ApiError(403, "x", "invalid_architecture_knowledge"), settle)).toBe(false);
    expect(passes(new Error("x"), settle)).toBe(false);
  });
});
