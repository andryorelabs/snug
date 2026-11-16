/**
 * Narrows a value that a test expects to exist, failing with a clear message
 * instead of a later null dereference.
 * @param value - A value that may be `null` or `undefined`.
 * @param message - The failure message.
 * @returns The same value, without `null` and `undefined`.
 */
export function requireValue<T>(value: T | null | undefined, message = "Expected a value"): T {
  if (value === null || value === undefined) throw new Error(message);
  return value;
}
