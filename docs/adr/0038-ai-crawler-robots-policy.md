# 0038: Robots policy for AI crawlers

## Status

Accepted.

Date: 2026-11-11

## Context

Snug's site wants to be found and quoted by search engines and by AI answer
engines, but its pages should not train models. AI vendors run separate bots for
search, for user-requested fetches and for training, so one rule for all of them
cannot express this.

## Decision

`buildRobotsTxt` in `apps/site/src/seo/crawlers.ts` generates `robots.txt` with
three kinds of group:

- Search and answer crawlers are allowed: `Googlebot`, `Bingbot`,
  `OAI-SearchBot`, `ChatGPT-User`, `Claude-SearchBot`, `Claude-User`,
  `PerplexityBot` and `Perplexity-User`.
- Model-training crawlers are disallowed in their own explicit group: `GPTBot`,
  `ClaudeBot`, `CCBot`, `Applebot-Extended` and `Bytespider`.
- Every other agent (`*`) is allowed.
- `/install` and `/reviews` are disallowed in every group, because they only
  redirect to the store listings.
- `Google-Extended` is not listed: blocking it also removes Gemini grounding and
  does not affect Search.
- The file ends with the sitemap URL.

The same module generates `llms.txt` and `llms-full.txt`, which summarize the
product for answer engines. `smoke.sh` checks that `robots.txt`, `sitemap.xml`
and `llms.txt` are served, as UTF-8 and gzipped.

## Alternatives considered

- **Block every AI crawler.** It removes Snug from AI answers, where users ask
  for extensions.
- **Allow everything.** It gives up the training opt-out for no gain.

## Consequences

- A new crawler is one line in a list, covered by `seo-files.test.ts`.
- `robots.txt` is a request, not enforcement; it does not stop a bot that
  ignores it.
- The crawler lists need review when vendors rename or split their bots.
