# How to cut a release

1. Make sure the `## [Unreleased]` section of the root `CHANGELOG.md` lists
   everything the release ships, one list item per change, written for users.
   The release script refuses an `[Unreleased]` section with no list item.

2. On a release branch, run `bun run release X.Y.Z` (for example
   `bun run release 2.4.0`; a prerelease suffix such as `2.4.0-beta.1` is
   accepted, a leading `v` is not). The version must be higher than the one in
   `apps/extension/package.json`. The script (`scripts/release/bump.ts`)
   rewrites every place that carries the version and nothing else:

   - `apps/extension/package.json`: the `version` field.
   - `apps/extension/lib/changelog.ts`: a new entry at the top of the array
     `getChangelog()` returns, with the `version`, today's `isoDate` and one
     item per `[Unreleased]` list item, keyed `changelog_X_Y_Z_<n>`.
   - Every file in `apps/extension/locales/` (all 10: `de`, `en`, `es`, `fr`,
     `it`, `ja`, `ko`, `pt_BR`, `ru`, `zh_CN`): those keys, with the English
     text of the CHANGELOG entry as the message.
   - `CHANGELOG.md`: `[Unreleased]` moves into a `## [X.Y.Z] - YYYY-MM-DD`
     section, `[Unreleased]` is left empty and the compare links at the bottom
     are updated.

   It prints the files it changed. It never commits, tags or pushes, and a
   rejected release changes no file.

3. Finish what the script cannot write. Translate the new `changelog_X_Y_Z_<n>`
   messages in every locale other than `en`: they hold the English text as a
   placeholder, and `apps/extension/lib/locale-parity.test.ts` compares key sets
   only, so nothing but review catches a message left in English. To make an
   item link to a page, add a `linkKey` and `linkUrl` to it in
   `apps/extension/lib/changelog.ts` (an App route built with `getAppUrl` from
   `apps/extension/lib/app-url.ts`, or a site URL) and the `linkKey` message to
   every locale. Then run `bun run fix` so the formatter settles the generated
   code.

4. Update the website translations of anything the release changed in the
   English Guide or `CHANGELOG.md`. Run `bun run i18n:status`: every page listed
   as `stale` has a translation under
   `apps/site/src/content/translations/<locale>/` whose `sourceHash` no longer
   matches its English source. Retranslate it and set the new `sourceHash` (the
   first 16 hex characters of the SHA-256 of the English file), or delete the
   translation so the page falls back to English with a notice. The drift test
   in `bun run test` fails on a stale translation.

5. Run `bun run check` and `bun run test` to confirm the version bump, changelog
   entry, and locale keys are all consistent. Commit, then open a PR against
   `develop` titled `chore: 🔖 release vX.Y.Z`; the squash merge makes that title
   the release commit on `develop`. Then promote: open a pull request from
   `develop` to `main` titled `chore: 🔀 promote develop to main` and merge it
   with a merge commit (see
   [Branching and promotion](../development.md#branching-and-promotion)).

6. Run `bun run zip` (the root `zip` script, which runs `wxt zip` in
   `apps/extension`) to produce the distributable extension archive and the
   sources archive for the new version, both in `apps/extension/.output/`:
   `snug-X.Y.Z-chrome.zip`, `snug-X.Y.Z-edge.zip` (built with
   `wxt zip -b edge`), and `snug-X.Y.Z-sources.zip`. The sources zip is rooted
   at the repo root and limited to an allowlist (`package.json`, `bun.lock`,
   `bunfig.toml`, `tsconfig.base.json`, `turbo.json`, `apps/extension/**`,
   `apps/video/package.json`, `packages/**`), set by `zip.includeSources` in
   `apps/extension/wxt.config.ts`. A reviewer rebuilds it with
   `bun install --frozen-lockfile && bun run build`. If a root file the build
   needs is added later, add it to that allowlist.

7. After the promotion merges, tag the promotion merge commit on `main` with a **signed,
   annotated** tag and push it:
   `git tag -s vX.Y.Z -m "vX.Y.Z" <merge-commit-sha> && git push origin vX.Y.Z`.
   `-s` signs the tag (GPG or SSH per your `git config`) and always creates an
   annotated tag; an unsigned or lightweight `git tag vX.Y.Z` is not acceptable.
   Verify a tag's signature at any time with `git tag -v vX.Y.Z`. A `v*` tag
   ruleset already protects these tags — see
   [ADR 0001](../adr/0001-public-repo-security-posture.md). Pushing the tag
   triggers the `release.yml` workflow. Before it builds or publishes anything,
   it runs `scripts/release/release-notes.ts` on the tag: the job fails when
   `CHANGELOG.md` has no `## [X.Y.Z]` section for the tag or the section is
   empty, otherwise the section becomes the release notes. It then builds the
   extension zip, attests build provenance, and publishes the GitHub Release —
   no manual `gh release create` needed.

8. Once the GitHub Release job finishes, a second job,
   `publish-chrome-web-store`, submits the same zip to the Chrome Web Store via
   `wxt submit` (the `publish-browser-extension` package), using Chrome Web
   Store API v2 and a service account. This job runs in the `chrome-web-store`
   GitHub Environment, which must hold these secrets:

   - `CHROME_SERVICE_ACCOUNT_CLIENT_EMAIL` — the service account's
     `client_email`.
   - `CHROME_SERVICE_ACCOUNT_PRIVATE_KEY` — the service account's `private_key`.
   - `CHROME_PUBLISHER_ID` — the Chrome Web Store publisher ID that owns the
     extension.
   - `CHROME_EXTENSION_ID` — the extension's ID in the Chrome Web Store.

   `CHROME_API_VERSION` is set to `v2` directly in the workflow, not as a secret
   — `publish-browser-extension` falls back to the sunsetting v1.1 API if it's
   left unset. A guard step runs before `wxt submit` and fails the job with an
   explicit message naming any missing secret, instead of letting the CLI fail
   further in with a less legible error. See
   [ADR 0005](../adr/0005-store-publishing-via-cws-api-v2.md) for the rationale.

   Listing text, screenshots, promo graphics, and privacy-practice fields are
   out of scope for this step — those stay dashboard-managed in the Chrome Web
   Store Developer Dashboard. Work through the
   [pre-publish checklist](../store/README.md#pre-publish-checklist) before
   pushing the tag.

   Also run the
   [BrowserStack Live checklist](../testing/browserstack-live-checklist.md)
   before pushing the tag: it is the only cross-browser check of the extension
   on Edge, Opera and Chrome on macOS.

9. In parallel with the Chrome Web Store job, a third job,
   `publish-edge-add-ons`, submits the Edge zip (`snug-X.Y.Z-edge.zip`) to
   Microsoft Edge Add-ons via `wxt submit`, using the Edge Add-ons API v1.1 with
   API key authentication. It depends on the `verify` and `release` jobs, never
   on `publish-chrome-web-store`, so one store failing does not block the other.
   This job runs in the `edge-add-ons` GitHub Environment, which must hold these
   secrets:

   - `EDGE_PRODUCT_ID` — the Product ID (a GUID) shown on the extension's
     Partner Center overview page. It is not the short Store ID
     (`0RDCK9J6Z4VS`).
   - `EDGE_CLIENT_ID` — the client ID shown on the Partner Center Publish API
     page.
   - `EDGE_API_KEY` — the API key generated on the same page.

   A guard step fails the job with a message naming any missing secret before
   `wxt submit` runs. **The Edge API key expires every 72 days**: rotate it in
   Partner Center (Publish API, create a new key) and update `EDGE_API_KEY` in
   the `edge-add-ons` environment before then. Microsoft emails reminders ahead
   of expiry. Listing metadata is not covered by the Edge API and stays Partner
   Center-managed. See [ADR 0015](../adr/0015-edge-add-ons-publishing.md) for
   the rationale.
