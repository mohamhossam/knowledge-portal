/**
 * Runs `task` over `items`, at most `limit` at a time, starting them in order. Like
 * `Promise.allSettled`, a failure never stops the others: each result sits at its item's
 * index, fulfilled or rejected.
 */
export async function settleInPool<T, R>(items: readonly T[], limit: number, task: (item: T, index: number) => Promise<R>): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array<PromiseSettledResult<R>>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      try {
        results[index] = { status: "fulfilled", value: await task(items[index]!, index) };
      } catch (reason) {
        results[index] = { status: "rejected", reason };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker));
  return results;
}
