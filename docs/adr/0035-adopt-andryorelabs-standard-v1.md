# 0035: Adopt the andryorelabs standard v1

## Status

Accepted.

Date: 2026-11-11

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

- `FUNDING.yml`: Snug is a product repository, not a sponsored library.
- A `develop` ruleset: `main` is the only long-lived branch
  ([0039](0039-branch-model.md)).
- npm trusted publishing: Snug is an extension and a site, not a library
  published to npm.
- Plugin manifests: Snug ships no agent plugin.
- Terminal banner: Snug has no CLI.

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
