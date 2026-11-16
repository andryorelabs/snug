import type { RuleTester } from "oxlint/plugins-dev";

/**
 * Type declaration for `./require-description.mjs`, needed because this
 * module is imported from `require-description.test.ts` and TypeScript
 * cannot infer types across a `.ts` -> `.mjs` import without one.
 */
declare const rule: Parameters<RuleTester["run"]>[1];

export default rule;
