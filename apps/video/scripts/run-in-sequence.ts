/**
 * Runs `task` for each item strictly one after another, so heavy renders never
 * overlap.
 * @param items - The items to process, in order.
 * @param task - Work for one item; a rejection stops the remaining items.
 * @returns Resolves once every item has finished.
 */
export const runInSequence = <TItem>(
  items: readonly TItem[],
  task: (item: TItem) => Promise<void>,
): Promise<void> => {
  const iterator = items[Symbol.iterator]();
  const runNext = async (): Promise<void> => {
    const next = iterator.next();
    if (next.done === true) return;
    await task(next.value);
    return runNext();
  };
  return runNext();
};
