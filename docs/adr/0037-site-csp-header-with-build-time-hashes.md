# 0037: The site CSP is a header with build-time script hashes

## Status

Accepted.

Date: 2026-11-11

## Context

The landing site is static HTML served by nginx from a container. Astro emits a
Content-Security-Policy `<meta>` tag with hashes of its own inline scripts, but
a meta tag cannot carry `frame-ancestors` and is applied only after the parser
reaches it. The site also has inline scripts Astro does not hash (theme
initialization, Starlight), whose digests change with every build.

## Decision

The policy is sent as an HTTP header from
`apps/site/docker/security-headers.conf`, with build-time script hashes:

- The template holds the `__SCRIPT_HASHES__` placeholder in `script-src`.
- At build, `apps/site/src/scripts/render-security-headers.ts` reads every built
  HTML page. It collects the hashes from Astro's CSP meta tags
  (`collectMetaScriptHashes`) and computes SHA-256 hashes for every other
  executable inline script (`findInlineScriptHashes`). It fails when an inline
  script has no allowed hash, then fills the template (`renderSecurityHeaders`)
  with the sorted, de-duplicated hashes. It throws when there are none, which
  would block every script.
- The policy is strict: `default-src 'none'`, scripts from `'self'`, the Umami
  cloud host, `'wasm-unsafe-eval'` and the hashes; `frame-src` limited to
  `youtube-nocookie.com`; `connect-src` limited to `'self'` and the Umami
  gateway; `base-uri 'none'`, `form-action 'none'`, `frame-ancestors 'none'`,
  `upgrade-insecure-requests` and `require-trusted-types-for 'script'`.
- The same file sets `X-Content-Type-Options`, `Referrer-Policy`,
  `Permissions-Policy`, `X-Frame-Options`, `Cross-Origin-Opener-Policy`,
  `Cross-Origin-Resource-Policy` and `Strict-Transport-Security`.

## Alternatives considered

- **Meta tag only.** No `frame-ancestors`, and weaker than a header.
- **`'unsafe-inline'` for scripts.** It defeats the policy.
- **Nonces.** The site is static, so a per-request nonce would need a dynamic
  layer in front of nginx.

## Consequences

- Adding an inline script needs no policy edit; the build hashes it. A script
  that cannot be hashed fails the build instead of failing in production.
- The container E2E and `smoke.sh` check the served headers.
- `style-src` still allows `'unsafe-inline'`; tightening it is separate work.
