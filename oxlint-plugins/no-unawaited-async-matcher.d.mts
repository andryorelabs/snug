import type { RuleTester } from "oxlint/plugins-dev";

/**
 * Type declaration for `./no-unawaited-async-matcher.mjs`, needed because
 * this module is imported from `no-unawaited-async-matcher.test.ts` and
 * TypeScript cannot infer types across a `.ts` -> `.mjs` import without one.
 */
declare const rule: Parameters<RuleTester["run"]>[1];

export default rule;
