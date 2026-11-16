const ASYNC_MATCHER_MODIFIERS = new Set(["rejects", "resolves"]);

/**
 * Reads the property name of a member access, for both `.name` and `["name"]`.
 * @param node A `MemberExpression` node.
 * @returns The accessed name, or `undefined` when it is not a static name.
 */
function memberName(node) {
  const property = node.property;
  if (node.computed !== true) {
    return property?.type === "Identifier" ? property.name : undefined;
  }
  return typeof property?.value === "string" ? property.value : undefined;
}

/**
 * Reports whether the member chain below `node` goes through
 * `expect(...).rejects` or `expect(...).resolves`.
 * @param node The callee of a call expression.
 * @returns Whether the chain starts an async matcher.
 */
function startsAsyncMatcherChain(node) {
  let current = node;
  while (current?.type === "MemberExpression") {
    const name = memberName(current);
    if (name !== undefined && ASYNC_MATCHER_MODIFIERS.has(name)) {
      const expectCall = current.object;
      return (
        expectCall?.type === "CallExpression" &&
        expectCall.callee?.type === "Identifier" &&
        expectCall.callee.name === "expect"
      );
    }
    current = current.object;
  }
  return false;
}

/**
 * Reports whether a promise produced at `node` is awaited or handed back to
 * the caller.
 * @param node The call expression producing the promise.
 * @returns Whether the promise is awaited or returned.
 */
function isAwaitedOrReturned(node) {
  const parent = node.parent;
  return (
    parent.type === "AwaitExpression" ||
    parent.type === "ReturnStatement" ||
    (parent.type === "ArrowFunctionExpression" && parent.body === node)
  );
}

/**
 * ESLint-compatible rule requiring `expect(...).rejects` and `.resolves`
 * assertions to be awaited or returned, so a failing assertion cannot be lost.
 * Registered as `local/no-unawaited-async-matcher` in `oxlint.config.ts`.
 */
const rule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Require `expect(...).rejects` and `.resolves` assertions to be awaited or returned.",
    },
    messages: {
      unawaited:
        "This async assertion is never awaited, so a failure is silently lost. `await` it or `return` it.",
    },
    schema: [],
  },
  create(context) {
    return {
      CallExpression(node) {
        if (!startsAsyncMatcherChain(node.callee) || isAwaitedOrReturned(node)) {
          return;
        }
        context.report({ node, messageId: "unawaited" });
      },
    };
  },
};

export default rule;
