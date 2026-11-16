# Accessibility

The goal is for the Snug landing page and Guide to meet
[WCAG 2.2](https://www.w3.org/TR/WCAG22/) level AA, in the light and dark
themes, and for the extension's popup and App to be usable by keyboard and
assistive technology.

## What enforces it

- [`apps/site/e2e/accessibility.spec.ts`](apps/site/e2e/accessibility.spec.ts)
  runs axe-core with the `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`, `wcag22aa`
  and `best-practice` tags on every scanned page of the built Site, in the light
  and dark themes, and fails on any violation. It also scans `/privacy/` at
  320 px.
- [`apps/site/e2e/reduced-motion.spec.ts`](apps/site/e2e/reduced-motion.spec.ts)
  checks that the Site's motion respects the visitor's reduced-motion
  preference ([ADR 0023](docs/adr/0023-landing-motion-is-css-scroll-driven-no-motion-library.md)).
- `tools/tokens.test.ts` in [`docs/brand`](docs/brand) fails when a text and
  background pair of the brand tokens falls below WCAG AA (4.5:1) in either
  theme.

How to run the browser checks is in [Development](docs/development.md).

## Known barriers

Axe catches only part of the possible barriers. The extension has no automated
axe scan, there is no screen reader or keyboard-only walkthrough on record, and
no manual audit has been done. No barrier is currently known.

## Report a barrier

Open an issue with the
[bug report template](https://github.com/andryorelabs/snug/issues/new/choose),
naming the page or the extension screen, the browser and any assistive
technology you use. For other questions, see
[`.github/SUPPORT.md`](.github/SUPPORT.md).
