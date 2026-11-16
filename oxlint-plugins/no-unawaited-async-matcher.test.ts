import { RuleTester } from "oxlint/plugins-dev";
import { describe, it } from "vitest";

import rule from "./no-unawaited-async-matcher.mjs";

RuleTester.describe = describe;
RuleTester.it = it;

const ruleTester = new RuleTester({
  languageOptions: { sourceType: "module", parserOptions: { lang: "ts" } },
});

/**
 * Wraps a statement in an async test body.
 * @param statement The statement under test.
 * @returns A source file containing the statement.
 */
function inTest(statement: string): string {
  return `test("x", async () => {\n  ${statement}\n});\n`;
}

const unawaited = [{ messageId: "unawaited" }];

ruleTester.run("no-unawaited-async-matcher", rule, {
  valid: [
    inTest("await expect(promise).rejects.toThrow();"),
    inTest("await expect(promise).resolves.toBe(1);"),
    inTest("return expect(promise).resolves.toBe(1);"),
    'test("x", () => expect(promise).rejects.toThrow());\n',
    'test("x", () => {\n  expect(value).toBe(1);\n});\n',
  ],
  invalid: [
    { code: inTest("expect(promise).rejects.toThrow();"), errors: unawaited },
    { code: inTest("expect(promise).resolves.toBe(1);"), errors: unawaited },
    {
      code: inTest("expect(promise).rejects.not.toThrow();"),
      errors: unawaited,
    },
    { code: inTest("expect(promise)['resolves'].toBe(1);"), errors: unawaited },
    {
      code: inTest("const pending = expect(promise).resolves.toBe(1);"),
      errors: unawaited,
    },
  ],
});
