/**
 * Folds the items through an async step strictly one after another: a step
 * starts only after the previous one settled, and a rejected step stops the
 * fold and rejects the returned promise. Bookmark and folder work depends on
 * this order, so it is never parallelized.
 * @param items The items to visit, in order.
 * @param initial The accumulator the first step receives.
 * @param step The async work for one item, given the accumulator so far.
 * @returns The accumulator after the last step.
 */
export function reduceSequentially<T, A>(
  items: Iterable<T>,
  initial: A,
  step: (accumulator: A, item: T) => Promise<A>,
): Promise<A> {
  const iterator = items[Symbol.iterator]();
  const runNext = async (accumulator: A): Promise<A> => {
    const next = iterator.next();
    return next.done ? accumulator : runNext(await step(accumulator, next.value));
  };
  return runNext(initial);
}

/**
 * Runs an async step for each item strictly one after another.
 * @param items The items to visit, in order.
 * @param step The async work for one item.
 * @returns Resolves once every step has completed.
 */
export async function forEachSequentially<T>(
  items: Iterable<T>,
  step: (item: T) => Promise<void>,
): Promise<void> {
  await reduceSequentially<T, null>(items, null, async (_previous, item) => {
    await step(item);
    return null;
  });
}

/**
 * Finds the first item an async test accepts, testing one item at a time and
 * stopping at the first match.
 * @param items The items to test, in order.
 * @param isMatch The async test for one item.
 * @returns The first matching item, or `undefined` when none matches.
 */
export function findSequentially<T>(
  items: Iterable<T>,
  isMatch: (item: T) => Promise<boolean>,
): Promise<T | undefined> {
  return reduceSequentially<T, T | undefined>(items, undefined, async (found, item) => {
    if (found !== undefined) return found;
    return (await isMatch(item)) ? item : undefined;
  });
}
