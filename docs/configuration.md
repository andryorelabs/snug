# Configuration

Every environment variable Snug's code, scripts and workflows read. The
extension itself reads none at runtime: it has no backend and no secrets. The
variables below configure build tooling, tests, deployment and CI. Values are
never written in this repository; [`.env.example`](../.env.example) lists the
names only.

A variable is **required** when the command that reads it fails without it, and
**secret** when its value must never be printed, logged or committed.

## Deploy and CI

Set in GitHub Actions, not on a developer machine.

| Name                      | Kind             | Read by                                                                     | Secret | Required              | When missing                                                                                                       |
| ------------------------- | ---------------- | --------------------------------------------------------------------------- | ------ | --------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `COOLIFY_API_TOKEN`       | Actions secret   | `.github/scripts/deploy-coolify.sh`, run by `deploy-site.yml`               | Yes    | For the site deploy   | The script prints `::error::` naming it and exits 1, so the deploy fails before calling Coolify.                   |
| `COOLIFY_APP_UUID`        | Script input     | `.github/scripts/deploy-coolify.sh`                                         | No     | For the site deploy   | Same error and exit. The workflow fills it from the `SNUG_COOLIFY_APP_UUID` repository variable.                   |
| `SNUG_COOLIFY_APP_UUID`   | Actions variable | `deploy-site.yml`                                                           | No     | For the site deploy   | `COOLIFY_APP_UUID` is empty, so the deploy script fails as above.                                                  |
| `LAST_MODIFIED_DATES`     | Build argument   | `apps/site/src/seo/last-modified.ts`, `deploy-coolify.sh`                   | No     | For the site deploy   | The deploy script fails unless it is a non-empty JSON object. A build outside git then ships no sitemap `lastmod`. |
| `BLACKSMITH_RUNNER`       | Actions variable | Light jobs listed in `ROUTED_JOBS` (`scripts/workflows-invariants.test.ts`) | No     | No                    | Jobs run on `ubuntu-latest`. See [CI](development.md#ci).                                                          |
| `BROWSERSTACK_USERNAME`   | Actions secret   | `browserstack.yml`, `ci.yml`, `apps/site/browserstack.yml`                  | Yes    | For BrowserStack runs | The workflow's check step reports it and the run is skipped. Fork pull requests never receive it.                  |
| `BROWSERSTACK_ACCESS_KEY` | Actions secret   | Same as `BROWSERSTACK_USERNAME`                                             | Yes    | For BrowserStack runs | Same as `BROWSERSTACK_USERNAME`.                                                                                   |
| `PERCY_TOKEN`             | Actions secret   | `browserstack.yml`, `ci.yml`, `apps/site/e2e-container/percy.spec.ts`       | Yes    | No                    | The Percy spec skips itself and the job prints a notice.                                                           |
| `GITHUB_STEP_SUMMARY`     | Set by GitHub    | `scripts/check-zip-size.ts`, `apps/site/browserstack-timing-reporter.ts`    | No     | No                    | The summary is not written; the scripts still print to the log.                                                    |

## Build, test and tooling

Set in the shell for one command, or by the workflow that runs it.

| Name                            | Read by                                                    | Secret | Required | When missing                                                                                                |
| ------------------------------- | ---------------------------------------------------------- | ------ | -------- | ----------------------------------------------------------------------------------------------------------- |
| `CI`                            | The Playwright configs                                     | No     | No       | Local defaults apply: no retries, `forbidOnly` off, the list reporter and a reused dev server.              |
| `SITE_URL`                      | `apps/site/playwright.container.config.ts`                 | No     | No       | Falls back to `http://127.0.0.1:8080`.                                                                      |
| `REQUIRE_DIST`                  | `apps/site/src/seo/distribution-audit.test.ts`             | No     | No       | The built-site audit runs only when `apps/site/dist` exists.                                                |
| `AXE_MATRIX`                    | `apps/site/e2e/routes.ts`                                  | No     | No       | The axe suite scans a sample of locales. `full` scans every locale.                                         |
| `BROWSERSTACK_TIER`             | `apps/site/playwright.browserstack.config.ts`              | No     | No       | Runs the full tier. `lean` drops the accessibility spec.                                                    |
| `BROWSERSTACK_PLATFORM_LABEL`   | `apps/site/browserstack-timing-reporter.ts`                | No     | No       | The timing summary omits the platform label.                                                                |
| `BROWSERSTACK_SHARD_LABEL`      | `apps/site/browserstack-timing-reporter.ts`                | No     | No       | The timing summary omits the shard label.                                                                   |
| `PERCY_BUILD_ID`                | `apps/site/e2e-container/percy.spec.ts`                    | No     | No       | Set by `percy exec`. The Percy spec fails with a message to run it through `percy exec` when it is missing. |
| `PWDEBUG`                       | `apps/extension/e2e/fixtures.ts`                           | No     | No       | Playwright runs normally. Set to `1` to open the inspector.                                                 |
| `SNUG_E2E_REQUIRED_PERMISSIONS` | `apps/extension/wxt.config.ts`                             | No     | No       | The manifest keeps `downloads` and `notifications` optional. `1` makes them required, for E2E builds only.  |
| `STORE_SCREENSHOT_THEME`        | `apps/extension/e2e-store/store-screenshots.spec.ts`       | No     | No       | Renders the dark theme. `light` is valid only with the landing variant.                                     |
| `STORE_SCREENSHOT_VARIANT`      | `apps/extension/e2e-store/store-screenshots.spec.ts`       | No     | No       | Renders the store slides. `landing` renders the landing set.                                                |
| `BROWSER`                       | WXT (`import.meta.env.BROWSER`)                            | No     | No       | WXT builds for Chrome. `edge` builds the Edge variant.                                                      |
| `REMOTION_BROWSER_EXECUTABLE`   | `apps/video/scripts/render-all.ts`, `render-thumbnails.ts` | No     | No       | Remotion downloads and uses its own browser.                                                                |
| `TZ`                            | `apps/extension/lib/auto-export.test.ts`                   | No     | No       | The test sets it itself.                                                                                    |

## Agent tooling

Read by the `emet` CLI, not by Snug. See [`agents/emet.md`](agents/emet.md).

| Name                         | Secret | Required | When missing                                                  |
| ---------------------------- | ------ | -------- | ------------------------------------------------------------- |
| `EMET_MAX_LIVE_WORKERS`      | No     | No       | `concurrency.maxLiveWorkers` from `emet.config.json` applies. |
| `EMET_RUN_IDLE_THRESHOLD_MS` | No     | No       | `concurrency.runIdleThresholdMs` applies.                     |
| `EMET_STATE_DIR`             | No     | No       | The slot pool lives in `~/.local/state/emet`.                 |

## Local files and dotenvx

Snug has no committed `.env`. The Coolify token was once a dotenvx-encrypted
`.env` in this repository; it became a GitHub Actions secret and the encrypted
file, the `env:encrypt` script and the `@dotenvx/dotenvx` dependency were
removed ([ADR 0022](adr/0022-coolify-token-as-github-secret.md)). A fresh
checkout therefore needs no environment setup: `bun install`, then the scripts
in [development](development.md#scripts).

If you do need a value locally, for example to try a BrowserStack run:

1. Copy the names you need from [`.env.example`](../.env.example) into a `.env`
   file at the repo root. `.env` and `.env.keys` are git-ignored; never commit
   either.
2. Put the values in `.env` yourself. Never paste a secret into a command line,
   an issue, a pull request or a log.
3. Load them for one command with `bunx @dotenvx/dotenvx run -- <command>`, or
   export them in your shell. To keep a value encrypted at rest, use
   `bunx @dotenvx/dotenvx set <NAME>`; this writes ciphertext to `.env` and the
   private key to `.env.keys`, which stays on your machine.

Production secrets are never kept in the repository, encrypted or not. To rotate
one, replace the repository secret in GitHub (`gh secret set <NAME>`), and
revoke the old one at its source.
