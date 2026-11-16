import noNonDocumentComments from "./no-non-doc-comments.mjs";
import noUnawaitedAsyncMatcher from "./no-unawaited-async-matcher.mjs";
import requireDescription from "./require-description.mjs";

/**
 * This repo's local Oxlint plugin, registered in `oxlint.config.ts` under
 * the `local` namespace (e.g. `local/no-non-doc-comments`).
 */
const localPlugin = {
  meta: { name: "local" },
  rules: {
    "no-non-doc-comments": noNonDocumentComments,
    "no-unawaited-async-matcher": noUnawaitedAsyncMatcher,
    "require-description": requireDescription,
  },
};

export default localPlugin;
