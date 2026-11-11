# 0036: Brand kit in docs/brand with a maker credit

## Status

Accepted.

Date: 2026-11-11

## Context

The 2026-10-01 closed decision in `docs/brand/brief.md` made Snug a fully
independent brand: no AndryOre palette or grid, and no "by Andry Orellana"
signature on the mark, listing or logo. Authorship appeared only where a
repository normally shows it.

Standard v1 ([0035](0035-adopt-andryorelabs-standard-v1.md)) gives every repo
the same brand kit layout and a discreet maker credit, so a visitor can tell the
products come from one maker. The brand rules are in
<https://github.com/andryorelabs/andryore-web/blob/main/docs/brand/README.md>.

## Decision

- The brand kit lives in `docs/brand`, in the standard file set: a README with a
  dated decisions table, `apply-spec.md`, social images, logo exports, and font
  and color tokens in `tokens.css`.
- The maker credit "Built by AndryOre", linking to <https://andryore.dev>,
  appears in the README (its last line) and in the site footer in every locale.
- This revises the 2026-10-01 "fully independent brand" decision: the credit
  replaces "no signature". The brief records the 2026-11-11 decision.
- Palette, type and voice stay Snug's own. The credit is the only shared
  element, and it never appears on the mark, the logo or the store listing.

## Alternatives considered

- **Keep no signature.** It contradicts the standard and hides that the repos
  share a maker.
- **Adopt the andryore-web palette and type.** It erases the identity the brand
  work of 2026-10 established, and is out of scope.

## Consequences

- The site footer carries one extra link in every locale; long-string locales
  must not overflow at narrow widths.
- A test keeps the README slogan and package descriptions equal to
  `docs/brand/copy.md`.
- Earlier text that says "fully independent" stays as history in the brief, with
  the revision dated next to it.
