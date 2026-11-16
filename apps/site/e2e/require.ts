/**
 * Parses JSON and checks its shape, so tests read typed data without casts.
 * @param text - A JSON document.
 * @param isExpected - A guard for the shape the test relies on.
 * @returns The parsed value.
 */
export function parseJson<T>(text: string, isExpected: (value: unknown) => value is T): T {
  const parsed: unknown = JSON.parse(text);
  if (!isExpected(parsed)) throw new Error("The JSON document does not have the expected shape");
  return parsed;
}

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
