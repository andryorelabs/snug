/**
 * Narrows an unknown value to a plain string-keyed object.
 * @param value - Any value.
 * @returns Whether the value is a non-null, non-array object.
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
