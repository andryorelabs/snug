/**
 * Narrows an unknown value to a non-array object, so parsed JSON can be read
 * key by key without a type assertion.
 * @param value The value to test.
 * @returns Whether `value` is an object and not `null` or an array.
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
