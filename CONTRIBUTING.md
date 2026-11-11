# Contributing

Thanks for your interest in contributing to Snug! This document covers the
conventions this repository expects from a pull request.

By participating in this project, you agree to abide by the
[Code of Conduct](CODE_OF_CONDUCT.md).

## Where to start

Look for issues labeled `good first issue` or `help wanted` in the
[issue tracker](https://github.com/andryorelabs/snug/issues). For anything
bigger than a small fix, open an issue first so the "why" is agreed before you
write code. Read [`ROADMAP.md`](ROADMAP.md) to see what is in scope: Snug is
local-only by design, so features that need a backend, an account or telemetry
will not be accepted.

## Setup

See [`docs/development.md`](docs/development.md) for the full local development
guide: available scripts, git hooks, `fakeBrowser` testing, and how to add a
`@shadcn/lint` contract.

## Branch naming and commit format

Branch names and commit/PR titles follow fixed conventions — see
[`docs/development.md`](docs/development.md#branch-naming) and
[`docs/development.md`](docs/development.md#commit-format) for the exact
patterns, what's actually lint-enforced versus convention-only, and how each is
checked locally (git hooks) and in CI.

## Merging

This repository merges pull requests via **squash merge only**, keeping a linear
history on `main`. Your commits within a PR don't need to follow the format
above individually, but the final PR title does, since it becomes the squashed
commit message.

## CI

The `CI passed` check must be green before a pull request can be merged. This
includes formatting, linting, type-checking, unused-code detection, and tests.
`bun run check` runs the first four; it does **not** run the test suite. Run
both `bun run check` and `bun run test` locally before opening a PR to catch
issues early.

## Tests

Paths to extension code (`lib/`, `entrypoints/`, `locales/`, `e2e-store/`) are
relative to `apps/extension/`.

New functionality and bug fixes in `lib/**` must add or update Vitest tests in
the same PR. See
[`docs/development.md`](docs/development.md#fakebrowser-testing) for how
`fakeBrowser`-based tests work. `lib/**` is held to the coverage thresholds
documented in [`docs/development.md`](docs/development.md).

## Review process

The maintainer reviews every pull request. Expect a first response within a
week; Snug has a single maintainer, so a busy week can take longer. Review
comments are requests to change the code, not judgments of you. Resolve each
conversation, push follow-up commits, and the maintainer squash-merges once
`CI passed` is green and every thread is resolved. A pull request that sits
without a reply for two weeks can be pinged in its own thread. See
[`GOVERNANCE.md`](GOVERNANCE.md) for who decides what.

## Sign-off (DCO)

Every commit must be signed off under the
[Developer Certificate of Origin (DCO) 1.1](https://developercertificate.org/):
by signing off, you certify you have the right to submit the change under this
project's license. Add the sign-off with `git commit -s`, which appends a
`Signed-off-by: Your Name <your.email@example.com>` trailer to the commit
message. There is no CI check enforcing this — it's a contributor obligation,
not an automated gate.

## Questions

Ask a question in an
[issue](https://github.com/andryorelabs/snug/issues/new/choose) using the form
that fits it. Support options are in [`.github/SUPPORT.md`](.github/SUPPORT.md).
Do not use an issue for a security report; see the next section.

## Reporting security issues

Do not open a public issue for a security vulnerability. Report it privately as
described in [`.github/SECURITY.md`](.github/SECURITY.md).
