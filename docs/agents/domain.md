# Domain docs

How the skills that read domain documentation (the `/emet:run` pipeline and the
repo's own `add-adr` skill) should consume this repo's domain documentation, and
how it relates to the existing `docs/` tree.

## Two different kinds of ground

An existing `docs/` tree (if this repo has one) is **published** ground:
finished reference material, written and maintained by hand. Don't restructure
it or fold `GLOSSARY.md` into it.

`GLOSSARY.md` and `docs/adr/` are the **live** ground that the domain-modeling work
maintains as `/emet:run` runs features through this repo: its ubiquitous
language and the architectural decisions made along the way. Both grow only when
a term or a decision actually crystallizes during a feature interview, never
speculatively. The `add-adr` skill (`.claude/skills/add-adr`) is the path for a
new ADR.

## Before exploring, read these

- **`GLOSSARY.md`** at the repo root.
- **`docs/adr/`**: read ADRs that touch the area you're about to work in.

## File structure

Single-context bun-workspaces monorepo
([ADR 0010](../adr/0010-bun-workspaces-monorepo.md)): `apps/*` and `packages/*`
share one root `GLOSSARY.md` and one `docs/adr/`.

```
/
├── GLOSSARY.md
└── docs/adr/
    ├── 0001-....md
    └── 0002-....md
```

## Use the glossary's vocabulary

When your output names a domain concept (an issue title, a ticket, a test name),
use the term as defined in `GLOSSARY.md`. Don't drift to synonyms the glossary
explicitly avoids.

If the concept you need isn't in the glossary yet, that's a signal: either
you're inventing language the project doesn't use (reconsider), or there's a
real gap worth noting for the domain-modeling work to close.

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than
silently overriding it — e.g. "Contradicts ADR-0003 (X), but worth reopening
because Y."
