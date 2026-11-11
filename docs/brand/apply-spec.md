# Applying the brand

Where each asset and each approved line of copy is applied, what to regenerate
or edit when the brand changes, and what stays manual. The decisions are in
[`README.md`](README.md) and
[ADR 0036](../adr/0036-brand-kit-and-maker-credit.md).

## Asset to surface

| Asset                                        | Applied in                                                                                   |
| -------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `docs/brand/copy.md` (slogan)                | README bold slogan, the covers in `docs/brand/og/`                                           |
| `docs/brand/copy.md` (one-line description)  | Root and extension `package.json` `description`, the GitHub About text                       |
| `docs/brand/copy.md` (listing text)          | Chrome Web Store and Edge listings, see `docs/store/`                                        |
| `docs/brand/tokens.css`                      | The brandbook, the contrast test; mirrors `packages/ui/src/styles/globals.css`               |
| `docs/brand/logo/*.svg`                      | Covers, the brandbook, the extension icon, every PNG mark                                    |
| `docs/brand/logo/png/*` and `favicon.ico`    | Package pages and any raster use of the mark                                                 |
| `docs/brand/og/cover.png`, `cover-light.png` | README light and dark `<picture>`                                                            |
| `docs/brand/og/social-preview.png`           | The GitHub social preview upload; copied to `docs/assets/github-social-preview-1280x640.png` |
| `apps/site/public/og/og-<locale>.png`        | Site social previews, one per locale                                                         |

The maker credit "Built by AndryOre" (linking to `https://andryore.dev`) is
applied in the README's last line and the site footer. It is not applied on the
mark, the logo, the covers, the store listing or the social preview.

## Copy to surface

| Approved line        | README                    | Site                              | Store listing           | GitHub description | Social preview      |
| -------------------- | ------------------------- | --------------------------------- | ----------------------- | ------------------ | ------------------- |
| Slogan               | Bold line under the cover | Hero copy follows the voice guide | Not used verbatim       | Not used           | On the cover images |
| One-line description | Not used                  | Meta description follows it       | Summary is its own text | Set from it        | Not used            |
| Maker credit         | Last line                 | Footer                            | Not used                | Not used           | Not used            |

## What to run or edit when the brand changes

| Change        | Edit                                                                    | Then run                               |
| ------------- | ----------------------------------------------------------------------- | -------------------------------------- |
| A colour      | `docs/brand/tokens.css`, `packages/ui/src/styles/globals.css`, the SVGs | `bun run brand:export`, `bun run test` |
| The logo      | `docs/brand/logo/*.svg`                                                 | `bun run brand:export`, `bun run test` |
| The slogan    | `docs/brand/copy.md` first, then `README.md`                            | `bun run test` (copy drift test)       |
| A description | `docs/brand/copy.md` first, then the root and extension `package.json`  | `bun run test` (copy drift test)       |
| A document    | The document, and its row in [`README.md`](README.md)                   | `bun run lint:docs`                    |

Rasters are generated only by `bun run brand:export` and committed; never edit
one by hand. The export needs Chromium (`bunx playwright install chromium`).
`tools/export-spec.test.ts` checks every committed raster against its size and
byte budget.

## Manual steps

These are not automated and are done by a maintainer.

- GitHub About: set the description from the one-line description in
  [`copy.md`](copy.md) and the homepage to `https://snug.andryore.dev/`.
- The social preview: upload `docs/brand/og/social-preview.png` in the
  repository's Settings, Social preview. GitHub has no API for it.
- Store listings: updated through the store dashboards, see `docs/store/`.
