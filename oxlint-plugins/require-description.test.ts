import { RuleTester } from "oxlint/plugins-dev";
import { describe, it } from "vitest";

import rule from "./require-description.mjs";

RuleTester.describe = describe;
RuleTester.it = it;

const ruleTester = new RuleTester({
  languageOptions: { sourceType: "module", parserOptions: { lang: "ts" } },
});

const missing = [{ messageId: "missingReason" }];

ruleTester.run("require-description", rule, {
  valid: [
    "// oxlint-disable-next-line no-console -- the CLI prints to stdout\nexport const answer = 42;\n",
    "/* eslint-disable no-console -- the CLI prints to stdout */\nexport const answer = 42;\n",
    "// eslint-disable-line no-console -- reason\nexport const answer = 42;\n",
    "// see oxlint-disable docs\nexport const answer = 42;\n",
  ],
  invalid: [
    {
      code: "// oxlint-disable-next-line no-console\nexport const answer = 42;\n",
      errors: missing,
    },
    {
      code: "// eslint-disable-next-line no-console\nexport const answer = 42;\n",
      errors: missing,
    },
    {
      code: "/* eslint-disable no-console */\nexport const answer = 42;\n",
      errors: missing,
    },
    {
      code: "// oxlint-disable-line no-console\nexport const answer = 42;\n",
      errors: missing,
    },
    {
      code: "// oxlint-disable-next-line no-console --\nexport const answer = 42;\n",
      errors: missing,
    },
  ],
});
