# `/emet:run` operational specifics for snug

Repo-specific config the `emet` plugin reads before it runs a feature from spec
to merge. Machine-checkable values (trunk and remote, ticket id shape,
concurrency, preflight's required files, handoff and usage thresholds, models)
live in [`emet.config.json`](../../emet.config.json) at the repo root, matching
`~/.claude/emet/schema/emet.config.schema.json`. This file holds the "why" prose
and everything a JSON value can't express. The full key reference is in the emet
repository's `docs/reference/configuration.md`.

## Commands

- `/emet:init` writes `emet.config.json` and the `docs/agents/*` files for a
  repo. It has run here; re-run it only to refresh them.
- `/emet:run` is the one-shot pipeline: interview, spec, tickets, one approval,
  then parallel workers in isolated worktrees, a review per wave and CI green
  before merge.
- `/emet:doctor` checks the setup: the config, the tracker, the labels and the
  host's dependencies.
- The `emet` CLI does the deterministic parts. The ones used most often are
  `emet doctor`, `emet preflight`, `emet slots --list`, `emet handoff --check`,
  `emet results` and `emet cleanup`.

## Tracker

Tracker: `linear`. See [issue-tracker.md](issue-tracker.md) for the literal
calls `/emet:run` makes to create, read, and transition tickets here, and
[triage-labels.md](triage-labels.md) for the triage vocabulary.

## Ticket ids and branches

- Ticket id shape: `^AO-\d+$` (e.g. `AO-1`), from `ticket.idPattern`.
- Worker branch: `ao-<n>-<slug>` (`ticket.branchPrefix` is `ao`) — each worker
  checks this out itself at worktree step 0. Local-only, never pushed.
- Commit: add a trailer line referencing the ticket at the end of the commit
  body (see `commit.trailer` and `commit.trailerPosition` in `emet.config.json`
  if this repo wants something other than the built-in default).

## Worktree setup

A worker's first action in a fresh worktree is always `git worktree lock` with
the reason the coordinator generated for it (`emet lock-reason`) — that's built
into `/emet:run` itself, identical in every repo, and nothing below needs to
restate it.

A fresh worktree needs `bun install` (`worktree.bootstrap` in
`emet.config.json`) — `postinstall` runs `wxt prepare` in `apps/extension`,
which regenerates the `apps/extension/.wxt/` types a worker needs before `tsc`
will pass. No env files to copy from the main checkout; this extension has no
runtime secrets (see [configuration](../configuration.md)).

A worker writes `.emet/surface.json` (the files its ticket may edit) and its
handoff note under `.emet/`. The directory is git-ignored and never committed.

## Self-check

Commands a worker runs before considering its own change done: see
`commands.selfCheck` in `emet.config.json` (`bun run check` — format, lint, and
typecheck — followed by `bun run test`).

## Models

The `models` block in `emet.config.json` picks the model and effort per role:
the reviewer for medium- and high-risk waves, and the escalation target when a
worker needs a stronger model. Change it there, not in a prompt.

## Concurrency

Max `concurrency.waveSize` live agents per wave, and a global
`concurrency.maxLiveWorkers` cap shared **host-wide** — by every concurrently
running `/emet:run` coordinator on this machine, across _every_ repo and every
git worktree of every repo (e.g. several Orca worktrees of this same repo, or an
entirely unrelated repo, all draw from one pool). The pool lives under
`~/.local/state/emet/slots`, not this repo's own `--git-common-dir`. A slot is
held only while its worker is actually live — it's released as soon as that
worker reports done, not held for the rest of the wave.

`concurrency.maxLiveWorkers` defaults to `"auto"`: derived from this host's own
cpu count and RAM rather than a fixed number, so it scales with the machine
`/emet:run` actually runs on instead of an arbitrary constant. A separate
memory-headroom brake also denies new slot acquisitions when `MemAvailable` is
too low, regardless of how many slots are technically free — see `emet doctor`
for this host's resolved numbers, and pin an explicit integer here instead of
`"auto"` only when there's a specific reason to cap this repo lower than the
host otherwise would. Both settings live in `emet.config.json`.
`EMET_MAX_LIVE_WORKERS` (accepting `"auto"` too) and
`EMET_RUN_IDLE_THRESHOLD_MS` override their config counterparts when set, and
`EMET_STATE_DIR` moves the slot pool. See [configuration](../configuration.md).
