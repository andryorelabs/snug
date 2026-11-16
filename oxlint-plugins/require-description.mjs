const DISABLE_DIRECTIVE_PATTERN = /^\s*(?:oxlint|eslint)-disable(?:-next-line|-line)?(?=\s|$)/;
const DIRECTIVE_REASON_PATTERN = /\s--\s+\S/;

/**
 * ESLint-compatible rule requiring a ` -- <reason>` suffix on every
 * `oxlint-disable` and `eslint-disable` directive. Registered as
 * `local/require-description` in `oxlint.config.ts`.
 */
const rule = {
  meta: {
    type: "suggestion",
    docs: {
      description: "Require a ` -- <reason>` suffix on every lint disable directive.",
    },
    messages: {
      missingReason: "Disable directives need a reason: add ` -- <why this is safe>`.",
    },
    schema: [],
  },
  create(context) {
    const sourceCode = context.sourceCode ?? context.getSourceCode();

    return {
      Program() {
        for (const comment of sourceCode.getAllComments()) {
          if (
            DISABLE_DIRECTIVE_PATTERN.test(comment.value) &&
            !DIRECTIVE_REASON_PATTERN.test(comment.value)
          ) {
            context.report({ node: comment, messageId: "missingReason" });
          }
        }
      },
    };
  },
};

export default rule;
