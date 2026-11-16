# Design

Snug is a warm, dark-first interface with an amber accent on an Aurora ground. It
keeps its own palette, type and voice; only the maker credit is shared with the
other andryorelabs projects
([ADR 0036](docs/adr/0036-brand-kit-and-maker-credit.md)).

## Where the design lives

- [`docs/brand/README.md`](docs/brand/README.md) is the brand kit: the dated
  decisions, the voice, the copy and the logo files.
- [`docs/brand/tokens.css`](docs/brand/tokens.css) holds the design tokens
  (colors, radii and the display, UI and mono font families). It is mirrored by
  `packages/ui/src/styles/globals.css`, the theme every surface imports.
- [`apps/site/DESIGN.md`](apps/site/DESIGN.md) is the landing page's design
  system: tokens, type, layout and motion.
- [`docs/design/README.md`](docs/design/README.md) holds the living design
  canvases for the extension UI.
- [`packages/ui/AGENTS.md`](packages/ui/AGENTS.md) governs the shared shadcn/ui
  components.

## Principles

- Type: Space Grotesk for the wordmark and display, Geist for the UI, Geist Mono
  for code.
- Dark first, with a light theme that follows the system unless the visitor
  overrides it.
- Motion is CSS only and has a static end state first.
- Contrast and focus rules are in [`ACCESSIBILITY.md`](ACCESSIBILITY.md).
