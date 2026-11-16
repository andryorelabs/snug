import { expect, it } from "vitest";

import localPlugin from "./index.mjs";
import rule from "./no-non-doc-comments.mjs";
import noUnawaitedAsyncMatcher from "./no-unawaited-async-matcher.mjs";
import requireDescription from "./require-description.mjs";

it("the local plugin registers every local rule", () => {
  expect(localPlugin.rules["no-non-doc-comments"]).toBe(rule);
  expect(localPlugin.rules["no-unawaited-async-matcher"]).toBe(noUnawaitedAsyncMatcher);
  expect(localPlugin.rules["require-description"]).toBe(requireDescription);
});
