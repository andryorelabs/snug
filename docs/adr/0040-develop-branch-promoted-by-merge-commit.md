# 0040: Develop branch promoted to main by merge commit

## Status

Accepted. Supersedes [0039](0039-branch-model.md). Amends
[0035](0035-adopt-andryorelabs-standard-v1.md): the `develop` ruleset leaves its
N-A list.

Date: 2026-11-11

## Context

[0039](0039-branch-model.md) kept `main` as the only long-lived branch. Every
change landed on the branch the site deploys from and releases are tagged on, so
work had no place to accumulate and be verified before it reached that branch.
Snug was also the only one of the six andryorelabs repositories without a
`develop` branch, which standard v1
([0035](0035-adopt-andryorelabs-standard-v1.md)) allows.

The sibling repositories promote `develop` to `main` in two ways. Three merge
the promotion with a merge commit. Three squash it, and then have to merge
`main` back into `develop` with a direct push that their own `develop` ruleset
forbids. GitHub's documentation says squash merging works best for short-lived
branches and recommends a merge commit for long-running ones, because later pull
requests from a squashed branch can repeat commits and conflicts.

## Decision

- `develop` is the development branch and the `/emet` trunk. Feature branches,
  `/emet` wave pull requests and Renovate pull requests target `develop` and are
  squash-merged, so `develop` stays linear.
- A promotion is a pull request from `develop` to `main`, merged with a merge
  commit and titled `chore: 🔀 promote develop to main`. `main` receives
  promotions only.
- No sync step exists: after a promotion, `main` contains `develop`.
- `main` stays the default branch. The site deploys from `main` and releases are
  tagged on `main` ([0026](0026-store-release-is-gated-on-a-verified-tag.md)):
  the release pull request lands on `develop`, a promotion follows, and the tag
  goes on the promotion merge commit. `develop` never deploys and is never
  tagged.
- Rulesets live as code in `.github/rulesets/`: `develop` (squash only, linear
  history, strict required checks, signed commits), `main` (merge commits only,
  required checks, signed commits) and `tags`. `main` drops linear history and
  the up-to-date policy, because a promotion is always ahead of `main`.
- The repository allows squash and merge commits; each ruleset decides which
  method its branch accepts.
- CI and CodeQL run on a push to `main` and to `develop`. Commitlint is skipped
  on a promotion, whose commits were linted when they reached `develop`.
- The pre-push hook and the agent deny list refuse a push to `main` or to
  `develop`.

## Alternatives considered

- **Keep `main` as the only long-lived branch ([0039](0039-branch-model.md)).**
  There is no verification point before a change reaches the deployed branch,
  and Snug stays different from its siblings.
- **Squash the promotion and sync `main` back into `develop`.** The squash
  breaks the ancestry between the two branches, so every promotion needs a
  follow-up merge pushed straight to `develop`, which a linear, pull-request-only
  ruleset blocks.
- **Make `develop` the default branch.** The README, the badges and the OpenSSF
  Scorecard would then read unpromoted history.
- **A staging site deployed from `develop`.** It needs a second deploy target
  and is not required to verify the extension.

## Consequences

- Two long-lived branches need a promotion to stay in step. `main` carries merge
  commits that `develop` lacks, so `main` is no longer linear.
- Renaming a required job in a workflow means updating both branch rulesets in
  the same change, or `bun run test` fails.
- A `Closes #N` line does not close a GitHub issue on merge into `develop`,
  because it is not the default branch. Tickets live in Linear, whose GitHub
  integration follows the pull request.
- A pull request opened without `--base develop` targets `main` and is refused
  by its ruleset unless it is a promotion.
