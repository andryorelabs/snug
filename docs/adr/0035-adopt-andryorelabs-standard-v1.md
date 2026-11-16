# 0035: Adopt the andryorelabs standard v1

## Status

Accepted. Amended by [0040](0040-develop-branch-promoted-by-merge-commit.md):
Snug has a `develop` branch, so its ruleset is no longer N-A.

Date: 2026-11-11

Revised: 2026-11-11, removed the `develop` ruleset from the N-A list
([0040](0040-develop-branch-promoted-by-merge-commit.md)).

Revised: 2026-11-16, adopts standard v2: the N-A list and the deviations below
are rewritten against v2, "Terminal banner" and `FUNDING.yml` leave the v1 N-A
list, and the file name keeps the v1 slug.

## Context

Six public repositories under the andryorelabs organization drifted apart:
different repository settings, community files, README shapes, docs layouts,
tooling and brand kits. [0027](0027-practices-parity-with-afe.md) aligned Snug
with one sibling by hand. That does not scale to six repos.

The organization now has a written standard, version 1, drafted in one repo and
voted by all six. Its technical rules live in the aokit repository:
<https://github.com/andryorelabs/aokit/tree/main/docs/standards>. Its brand
rules live in the andryore-web repository:
<https://github.com/andryorelabs/andryore-web/blob/main/docs/brand/README.md>.

## Decision

Snug conforms to standard v1. The standard is the source of truth: when a rule
there differs from a Snug document, the standard wins and the difference is
fixed or recorded here.

Snug keeps its own palette, type and voice. Only the maker credit is shared
([0036](0036-brand-kit-and-maker-credit.md)).

Rules that do not apply to Snug (N-A):

- npm trusted publishing: Snug is an extension and a site, not a library
  published to npm.
- Plugin manifests: Snug ships no agent plugin.

Snug now conforms to standard v2, which keeps v1's rules and adds the V
rules. Only andryore-web has a `FUNDING.yml`, so Snug neither has one nor lists
it as N-A.

Rules that do not apply to Snug under v2 (N-A), each with its reason:

- V11 (`docs/reference/dependencies.md`): the rule is for a CLI or a plugin, and
  Snug is an extension and a site with no machine prerequisites beyond bun.
- V36 (release checksums and binary smoke runs): Snug ships no binaries.
- V38 (`publint` and `attw`): Snug publishes no npm package.
- V39 (the CLI contract and `--json` envelope): Snug has no CLI.
- V40 (plugin contract tests): Snug ships no agent plugin.
- `local/no-bun-test-only`: the rule guards Bun's test runner, and Snug does not
  use `bun:test`.
- The `@oxlint/plugins` pin: Snug declares no custom oxlint plugin, so there is
  nothing to pin.

Deviations from v2, each with its reason:

- H3: `skills-lock.json` also lists third-party skills, not only Module-managed
  ones. Snug keeps them for design, SEO and browser work. An amendment to allow
  them is proposed to aokit; until it lands, this is the recorded deviation.
  `add-adr` and `cut-release` are copied by hand from the aokit Module sources,
  because Snug has no `aokit.lock.json`.
- F3: heavy CI jobs use the literal `ubuntu-latest`, not the `BLACKSMITH_RUNNER`
  expression, as decided in
  [0031](0031-github-hosted-ci-with-sharded-e2e-and-optional-blacksmith-runner.md).
- E3 and E9: the coverage floors start at measured values and only rise. The
  gap to the standard's 99.7 threshold and its 97 percent lines and 98 percent
  functions per-file floor is debt, closed as coverage grows.
- The root test runner is Vitest, not `bun test`, so rules written for Bun's
  runner apply through the Vitest equivalent.

Conformance is kept under test (repository invariants in `scripts/*.test.ts`) so
it cannot drift again. Each N-A rule above is the only accepted reason to leave
a standard rule unimplemented.

## Alternatives considered

- **Keep per-repo parity tables.** One table per pair of repos grows with every
  repo and never has a single owner.
- **Adopt only the rules that already match.** The drift would stay in exactly
  the places where the repos differ.

## Consequences

- A change to the standard becomes a ticket here, or a new N-A line in this ADR.
- The N-A list is the complete set of known exceptions; anything else that
  differs from the standard is a defect.
- Rules that need live GitHub settings are documented and checked by script, not
  applied by code.
