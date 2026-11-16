/**
 * A parsed JSON or YAML object whose members are still unchecked.
 */
export type JsonRecord = Record<string, unknown>;

/**
 * Narrows a parsed value to a non-null, non-array object.
 * @param value - The parsed value.
 * @returns Whether `value` is a plain object record.
 */
export function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Parses JSON text and checks the result with `isShape` instead of asserting
 * its shape.
 * @param text - The JSON document.
 * @param isShape - Type guard describing the expected shape.
 * @returns The parsed value, narrowed by `isShape`.
 * @throws {TypeError} When the parsed value does not satisfy `isShape`.
 */
export function parseJsonAs<TShape>(
  text: string,
  isShape: (value: unknown) => value is TShape,
): TShape {
  const value: unknown = JSON.parse(text);
  if (!isShape(value)) {
    throw new TypeError("JSON document does not have the expected shape");
  }
  return value;
}

/**
 * Parses a JSON object document.
 * @param text - The JSON document.
 * @returns The parsed object with unchecked members.
 * @throws {TypeError} When the document is not a JSON object.
 */
export function parseJsonRecord(text: string): JsonRecord {
  return parseJsonAs(text, isRecord);
}

/**
 * Parses a JSON array document.
 * @param text - The JSON document.
 * @returns The parsed array with unchecked elements.
 * @throws {TypeError} When the document is not a JSON array.
 */
export function parseJsonArray(text: string): unknown[] {
  return parseJsonAs(text, Array.isArray);
}
