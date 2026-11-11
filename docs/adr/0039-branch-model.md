# 0039: Branch model: main is the only long-lived branch

## Status

Superseded by [0040](0040-develop-branch-promoted-by-merge-commit.md).

Date: 2026-11-11

## Context

Standard v1 ([0035](0035-adopt-andryorelabs-standard-v1.md)) allows a `develop`
branch for repos that need a staging line. Snug ships one extension and one site
from a single line of history, and releases are cut from a verified tag
([0026](0026-store-release-is-gated-on-a-verified-tag.md)).

## Decision

- `main` is the only long-lived branch. There is no `develop`.
- Work happens on short-lived branches named `<type>/<slug>`, `ao-<n>-<slug>`,
  `renovate/*` or `worktree-*`, and reaches `main` through a pull request.
- Pull requests are squash-merged, so `main` stays linear and each commit title
  is the PR title.
- Releases are tag-driven: a `v*` tag on `main` triggers the release workflow.
  Nothing is published to a store by hand.
- The rules are enforced by rulesets on `main` and on `v*` tags, and by the
  pre-push hook.

## Alternatives considered

- **A `develop` branch.** It doubles every merge for a repo with no staging
  environment.
- **Merge commits or rebase merges.** They break the one-PR-one-commit history
  that the changelog and release notes rely on.

## Consequences

- No `develop` ruleset exists; it is listed as N-A in
  [0035](0035-adopt-andryorelabs-standard-v1.md).
- A broken `main` is fixed forward by a new PR, never by a force push.
