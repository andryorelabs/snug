# Codebase map for agents

Where things live, so you can find the right file without walking the tree. The
detailed map, with runtime contexts, data flows and invariants, is
[`docs/architecture.md`](../architecture.md). Terms follow
[`GLOSSARY.md`](../../GLOSSARY.md).

Snug is a bun-workspaces monorepo orchestrated by Turborepo
([ADR 0010](../adr/0010-bun-workspaces-monorepo.md)).

| Path                                             | What it is                                                                                              |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| `apps/extension`                                 | The Chrome MV3 extension (`@snug/extension`): WXT, React 19, Tailwind CSS v4. Rules in its `AGENTS.md`. |
| `apps/extension/entrypoints`                     | The popup, the hash-routed App shell, the background service worker and the Goodbye page.               |
| `apps/extension/lib`                             | The tested logic: parsers, exporters, import, duplicates, Auto-export, Safety snapshots, storage.       |
| `apps/extension/locales`                         | One JSON file per locale; keys stay in parity across locales.                                           |
| `apps/extension/e2e`, `apps/extension/e2e-store` | Playwright runs against the built extension, and the store screenshot pipeline.                         |
| `apps/site`                                      | The static Astro landing page, Guide and What's new (`@snug/site`). Rules in its `AGENTS.md`.           |
| `apps/video`                                     | The Remotion promo video and YouTube thumbnails (`@snug/video`). Rules in its `AGENTS.md`.              |
| `packages/ui`                                    | The shared shadcn/ui components, hooks and theme tokens (`@workspace/ui`). Rules in its `AGENTS.md`.    |
| `docs/`                                          | The documentation tree, indexed by [`docs/README.md`](../README.md).                                    |
| `docs/adr`                                       | Architecture decision records and their index and invariant test.                                       |
| `docs/brand`                                     | The brand kit: voice, copy, tokens, logo and Open Graph files.                                          |
| `scripts`                                        | Root repository scripts and the invariant tests that keep docs, config and coverage honest.             |
| `.github`                                        | Workflows, rulesets, issue forms, labels and community files.                                           |
| `.claude/skills`                                 | Project skills. `add-adr` and `cut-release` are locked in `skills-lock.json`.                           |

## Where to run what

- `bun run check` after any change, `bun run test` after a change to tested code.
- Never run `bun run build` unless asked.
- The full rules and the quirks are in [`AGENTS.md`](../../AGENTS.md).
