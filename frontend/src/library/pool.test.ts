import { describe, expect, it } from "vitest";

import { settleInPool } from "./pool";

/** A task that can be finished from outside, to watch how many run at once. */
function gate() {
  let open!: () => void;
  const promise = new Promise<void>((resolve) => { open = resolve; });
  return { promise, open };
}

describe("uploads a few at a time (area 2 backlog)", () => {
  it("runs at most the limit at once, starting in order, and keeps each result at its item", async () => {
    const gates = Array.from({ length: 5 }, gate);
    const started: number[] = [];
    let running = 0;
    let most = 0;
    const done = settleInPool([0, 1, 2, 3, 4], 3, async (item) => {
      started.push(item);
      running += 1;
      most = Math.max(most, running);
      await gates[item]!.promise;
      running -= 1;
      if (item === 1) throw new Error("refused");
      return item * 10;
    });
    await Promise.resolve();
    expect(started).toEqual([0, 1, 2]);
    // Finishing out of order frees a place for the next in line.
    gates[2]!.open();
    gates[1]!.open();
    gates[0]!.open();
    gates[4]!.open();
    gates[3]!.open();
    const results = await done;
    expect(started).toEqual([0, 1, 2, 3, 4]);
    expect(most).toBe(3);
    expect(results.map((result) => result.status)).toEqual(["fulfilled", "rejected", "fulfilled", "fulfilled", "fulfilled"]);
    expect(results.map((result) => (result.status === "fulfilled" ? result.value : "refused"))).toEqual([0, "refused", 20, 30, 40]);
  });

  it("settles at once with nothing to do", async () => {
    expect(await settleInPool([], 3, () => Promise.resolve(1))).toEqual([]);
  });
});
