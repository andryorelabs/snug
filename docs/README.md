# Documentation index

An index of every document in this repository. `scripts/docs-index.test.ts`
fails when a document under `docs/` is missing here. Terms follow
[`GLOSSARY.md`](../GLOSSARY.md).

## Core

- [`README.md`](../README.md) — user-facing portal: pitch, features, install,
  and links to the rest of the docs.
- [`CHANGELOG.md`](../CHANGELOG.md) — human-readable release notes, newest
  first, in [Keep a Changelog](https://keepachangelog.com/) format.
- [`CONTRIBUTING.md`](../CONTRIBUTING.md) — pull request conventions: setup,
  branch/commit format, merging, CI, security reporting.
- [`GOVERNANCE.md`](../GOVERNANCE.md) — the BDFL governance model, decision
  process, roles, and project continuity.
- [`ROADMAP.md`](../ROADMAP.md) — the project's direction for the next 12 months
  and what's out of scope.
- [`GLOSSARY.md`](../GLOSSARY.md) — a glossary of domain terms used consistently
  across code, docs, and UI.
- [`PRODUCT.md`](../PRODUCT.md) — the product brief: who Snug is for and what it
  promises.
- [`llms.txt`](../llms.txt) — the map of this repository for language models.
- [`docs/development.md`](development.md) — the local development guide: setup,
  workspaces, scripts, git hooks, CI, commit/branch format, the `@shadcn/lint`
  contract workflow, `fakeBrowser` testing, and the code documentation policy.
- [`docs/configuration.md`](configuration.md) — every environment variable, what
  reads it, whether it is secret or required, and what happens when it is
  missing.
- [`docs/troubleshooting.md`](troubleshooting.md) — fixes for real failures: the
  e2e build step, lychee, emet worktrees, BrowserStack, and the Coolify deploy.
- [`docs/architecture.md`](architecture.md) — a matklad-style code map of the
  codebase's shape: runtime contexts, data flows, and invariants.
- [`docs/security.md`](security.md) — the extension's assurance case: what
  security it provides, its threat model, the supply chain, CSP requirements and
  known limitations.

## Architecture decision records

- [`docs/adr/README.md`](adr/README.md) — the ADR index and status table, one
  row per decision, with the superseding ADR where one applies. The ADR files
  are covered by this index ([`docs/adr/`](adr/)).

## Usage and how-to

- [`docs/usage.md`](usage.md) — opening the app, plus a guide page each for
  [exporting](guide/exporting.md), [importing](guide/importing.md) (the Safety
  snapshot and Undo), [duplicates](guide/duplicates.md),
  [settings](guide/settings.md), [Auto-export](guide/auto-export.md) and the
  [FAQ](guide/faq.md).
- [`docs/how-to/README.md`](how-to/README.md) — index of the how-to recipes.
- [`docs/how-to/add-a-locale.md`](how-to/add-a-locale.md) — steps to add a new
  locale.
- [`docs/how-to/cut-a-release.md`](how-to/cut-a-release.md) — steps to cut a new
  release.
- [`docs/testing/browserstack-live-checklist.md`](testing/browserstack-live-checklist.md)
  — pre-release manual QA on BrowserStack Live: the site on mobile browsers and
  the extension on Chrome, Edge and Opera.

## Website

- [`apps/site/DESIGN.md`](../apps/site/DESIGN.md) — the landing page's design
  system: tokens, type, layout and motion.
- [`docs/landing/content.md`](landing/content.md) — the landing page copy for
  all ten locales.
- [`docs/design/README.md`](design/README.md) — the living design canvases for
  the UI.

## Store

- [`docs/store/README.md`](store/README.md) — the Chrome Web Store listing pack:
  English and Spanish listing copy, graphic assets, privacy-tab justifications,
  distribution, and the pre-publish checklist.
- [`docs/store/edge/README.md`](store/edge/README.md) — the Microsoft Edge
  Add-ons listing pack.
- [`docs/store/screenshots.md`](store/screenshots.md) — the store screenshot
  shot list, the ten localized sets and how the slides are produced.
- [`docs/store/listings/`](store/listings/) — listing copy for the other eight
  locales (`TEMPLATE.md` plus one file per locale).
- [`docs/store/baseline-2026-09.md`](store/baseline-2026-09.md) — pre-rename
  store analytics, for comparison after the rename.
- [`docs/store/featured-nomination.md`](store/featured-nomination.md) — the
  closed Featured badge nomination pack, kept for reference.

## Launch

- [`docs/launch/README.md`](launch/README.md) — the Launch kit: plan and index.
- [`docs/launch/press-kit.md`](launch/press-kit.md) — facts and assets for
  anyone writing about Snug.
- [`docs/launch/copy/community.md`](launch/copy/community.md) — launch copy for
  Product Hunt, Hacker News, Reddit, X and YouTube.
- [`docs/launch/copy/directories.md`](launch/copy/directories.md) — directory
  submission copy, one section per variant.
- [`docs/launch/directories.csv`](launch/directories.csv) — the directory
  submission tracker.
- [`docs/launch/closeout-2026-10-09.md`](launch/closeout-2026-10-09.md) — the
  launch close-out.

## Brand

- [`docs/brand/README.md`](brand/README.md) — the Snug brand kit: what each file
  is, the dated decisions, and where shared assets live.
- [`docs/brand/`](brand/) — every other file in the brand kit (voice, brief,
  naming, competitors, copy, tokens, logo, Open Graph images, YouTube assets and
  the brandbook) is covered by this directory and described in its README.

## Agent configuration

- [`AGENTS.md`](../AGENTS.md) — instructions for coding agents: layout, scripts,
  rules, conventions, and escalation ladders.
- [`docs/agents/domain.md`](agents/domain.md) — how domain-modeling-aware skills
  should use this repo's domain docs.
- [`docs/agents/emet.md`](agents/emet.md) — repo-specific config for the
  `/emet:run` command.
- [`docs/agents/issue-tracker.md`](agents/issue-tracker.md) — where issues and
  specs live (Linear) and how to work with them.
- [`docs/agents/triage-labels.md`](agents/triage-labels.md) — the mapping
  between triage roles and this workspace's Linear labels.

## Not covered here

- [`PRIVACY_POLICY.md`](../PRIVACY_POLICY.md) — the extension's published
  privacy policy.
- [`.github/SECURITY.md`](../.github/SECURITY.md) — how to report a security
  vulnerability privately.
- [`CODE_OF_CONDUCT.md`](../CODE_OF_CONDUCT.md) — the project's code of conduct.
