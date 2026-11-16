import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

import { isRecord, parseJsonAs } from "./json-guards";
interface TurboTask {
  inputs?: string[];
}

const turboConfig = parseJsonAs(
  readFileSync(new URL("../turbo.json", import.meta.url), "utf8"),
  (value): value is { tasks: Record<string, TurboTask> } =>
    isRecord(value) && isRecord(value.tasks),
);

const ROOT_TEST_TASKS = ["//#test:root", "//#test:coverage:root"];

describe("root test task inputs", () => {
  test.each(ROOT_TEST_TASKS)(
    "%s hashes every tracked file, because its tests scan the whole repository",
    (taskName) => {
      expect(turboConfig.tasks[taskName]?.inputs).toEqual(["$TURBO_DEFAULT$"]);
    },
  );
});
