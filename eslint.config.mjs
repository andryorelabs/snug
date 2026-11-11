import eslintComments from "@eslint-community/eslint-plugin-eslint-comments";
import { plugin as shadcn } from "@shadcn/lint";
import astro from "eslint-plugin-astro";
import jsdoc from "eslint-plugin-jsdoc";
import jsxA11y from "eslint-plugin-jsx-a11y";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import unicorn from "eslint-plugin-unicorn";
import { defineConfig, globalIgnores } from "eslint/config";
import tseslint from "typescript-eslint";

import localPlugin from "./eslint-rules/index.mjs";
import { shadcnNoRestyleContracts } from "./lint-policy.mjs";

/**
 * ESLint lints only `.astro` files: Oxlint cannot see `.astro` templates or
 * `<style>` blocks (oxc#23207), and lints everything else.
 */

/**
 * `eslint-plugin-jsdoc`'s TypeScript-flavored recommended rules, with
 * `require-jsdoc` turned off (this repo documents only non-obvious
 * exports, not everything — see later wave-2/wave-3 tickets) and
 * `informative-docs` turned on (rejects JSDoc that just restates the
 * declaration's name).
 */
const jsdocRules = {
  ...jsdoc.configs["flat/recommended-typescript-error"].rules,
  "jsdoc/require-jsdoc": "off",
  "jsdoc/informative-docs": "error",
};

/**
 * `@eslint-community/eslint-plugin-eslint-comments`'s recommended rules,
 * with `require-description` turned on so every `eslint-disable*` comment
 * must say why.
 */
const eslintCommentsRules = {
  ...eslintComments.configs.recommended.rules,
  "@eslint-community/eslint-comments/require-description": "error",
};

/**
 * This repo's local `no-non-doc-comments` rule (see `eslint-rules/`),
 * which bans `//` line comments and non-JSDoc `/* *\/` block comments.
 */
const localCommentRules = {
  "local/no-non-doc-comments": "error",
};

/**
 * The three comment-policy rule groups this wave introduces, combined into
 * one named object for reuse across the config below.
 */
const commentPolicyRules = {
  ...jsdocRules,
  ...eslintCommentsRules,
  ...localCommentRules,
};

const eslintConfig = defineConfig([
  astro.configs["flat/base"],
  {
    files: ["**/*.astro"],
    languageOptions: {
      parserOptions: { parser: tseslint.parser },
    },
  },
  {
    files: ["**/*.astro"],
    plugins: { "react-hooks": reactHooks },
    rules: reactHooks.configs["recommended-latest"].rules,
  },
  { files: ["**/*.astro"], ...jsxA11y.flatConfigs.recommended },
  { files: ["**/*.astro"], ...unicorn.configs.recommended },
  {
    files: ["**/*.astro"],
    rules: {
      "unicorn/no-null": "off",
      /**
       * Formatting-owned rules that `eslint-config-prettier` used to switch
       * off; Oxfmt owns formatting now, so they stay off explicitly.
       */
      "unicorn/empty-brace-spaces": "off",
      "unicorn/no-nested-ternary": "off",
      "unicorn/number-literal-case": "off",
      "unicorn/template-indent": "off",
      "unicorn/no-array-reduce": ["error", { allowSimpleOperations: false }],
      "unicorn/filename-case": [
        "error",
        {
          cases: { kebabCase: true, pascalCase: true },
          ignore: [/^\[.+\]/, /^\(.+\)/],
        },
      ],
      /**
       * `Props` is Astro's own convention for a component's props interface.
       */
      "unicorn/name-replacements": [
        "error",
        {
          allowList: {
            utils: true,
            docs: true,
            doc: true,
            props: true,
            Props: true,
          },
        },
      ],
    },
  },
  {
    files: ["**/*.astro"],
    plugins: { react },
    rules: { "react/jsx-no-target-blank": "error" },
  },
  {
    files: ["**/*.astro"],
    plugins: { shadcn },
    rules: {
      "shadcn/no-restyle": ["error", { allow: ["layout"], contracts: shadcnNoRestyleContracts }],
      "shadcn/no-raw-colors": "error",
      "shadcn/no-arbitrary-values": "error",
      "shadcn/no-inline-styles": "error",
      "shadcn/no-unknown-classes": "error",
      "shadcn/require-static-classes": "error",
    },
  },
  {
    /**
     * The comment-policy rule groups (local `no-non-doc-comments`,
     * `eslint-plugin-jsdoc`'s TypeScript-flavored recommended rules plus
     * `jsdoc/informative-docs`, and `@eslint-community/eslint-comments`'s
     * recommended rules plus `require-description`) — banning non-doc
     * comments and uninformative or undescribed directive comments.
     */
    files: ["**/*.astro"],
    plugins: {
      jsdoc: jsdoc.configs["flat/recommended-typescript-error"].plugins.jsdoc,
      local: localPlugin,
      "@eslint-community/eslint-comments": eslintComments,
    },
    rules: commentPolicyRules,
  },
  globalIgnores([
    "**/.output/**",
    "**/.wxt/**",
    "**/.astro/**",
    "apps/site/dist/**",
    "**/coverage/**",
    ".claude/skills/**",
    ".claude/worktrees/**",
  ]),
]);

export default eslintConfig;
