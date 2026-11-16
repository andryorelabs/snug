/**
 * Runs an async task for each item one after another, so browser steps keep
 * their order without awaiting inside a loop.
 * @param items - The values to visit, in order.
 * @param task - The async step for one value.
 */
export async function forEachSequentially<T>(
  items: Iterable<T>,
  task: (item: T) => Promise<unknown>,
): Promise<void> {
  const iterator = items[Symbol.iterator]();
  const runNext = async (): Promise<void> => {
    const next = iterator.next();
    if (next.done) return;
    await task(next.value);
    await runNext();
  };
  await runNext();
}

/**
 * The integers from zero up to, and not including, `count`.
 * @param count - How many indexes to produce.
 * @returns The indexes in ascending order.
 */
export function indexRange(count: number): number[] {
  return Array.from({ length: count }, (_, index) => index);
}
