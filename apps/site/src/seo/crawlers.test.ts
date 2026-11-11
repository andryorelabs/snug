import { describe, expect, it } from "vitest";

import { getContent } from "../i18n/content";
import { SITE_ORIGIN } from "../i18n/locales";
import { buildLlmsFullTxt, buildLlmsTxt, buildRobotsTxt, buildSitemapXml } from "./crawlers";

const englishContent = getContent("en");

describe("buildRobotsTxt", () => {
  const robots = buildRobotsTxt();

  it("allows search crawlers and disallows training crawlers in their own group", () => {
    expect(robots).toMatch(/User-agent: Googlebot[\s\S]*?Allow: \//);
    expect(robots).toMatch(/User-agent: GPTBot[\s\S]*?Disallow: \/\n/);
    expect(robots.indexOf("GPTBot")).toBeGreaterThan(robots.indexOf("PerplexityBot"));
  });

  it("disallows the redirect-only paths in every group and lists the sitemap", () => {
    expect(robots.match(/Disallow: \/install/g)).toHaveLength(3);
    expect(robots.match(/Disallow: \/reviews/g)).toHaveLength(3);
    expect(robots).toContain(`Sitemap: ${SITE_ORIGIN}/sitemap.xml`);
  });
});

describe("buildLlmsTxt", () => {
  const localePages = [{ languageTag: "en", title: "Snug", url: `${SITE_ORIGIN}/` }];

  it("lists the landing pages and the fixed pages with the description", () => {
    const text = buildLlmsTxt("A short description.", localePages);

    expect(text).toContain("> A short description.");
    expect(text).toContain(`- [Snug](${SITE_ORIGIN}/): en`);
    expect(text).toContain(`${SITE_ORIGIN}/llms-full.txt`);
    expect(text).toContain("## Optional");
  });

  it("omits the Guide, Comparisons and How-to sections when empty", () => {
    const text = buildLlmsTxt("d", localePages);

    expect(text).not.toContain("## Guide");
    expect(text).not.toContain("## Comparisons");
    expect(text).not.toContain("## How-to");
  });

  it("adds each optional section and keeps secondary pages under Optional", () => {
    const text = buildLlmsTxt(
      "d",
      localePages,
      [
        {
          title: "Guide page",
          description: "About",
          markdownUrl: "https://x.example/guide.md",
          secondary: false,
        },
        {
          title: "What's new",
          description: "Releases",
          markdownUrl: "https://x.example/changelog.md",
          secondary: true,
        },
      ],
      [
        {
          title: "Versus",
          description: "Compare",
          url: "https://x.example/v/",
        },
      ],
      [{ title: "How", description: "Steps", url: "https://x.example/h/" }],
    );

    const [beforeOptional, optional] = text.split("## Optional", 2);
    expect(beforeOptional).toContain("## Guide");
    expect(beforeOptional).toContain("- [Guide page](https://x.example/guide.md): About");
    expect(beforeOptional).not.toContain("What's new");
    expect(optional).toContain("- [What's new](https://x.example/changelog.md)");
    expect(beforeOptional).toContain("## Comparisons");
    expect(beforeOptional).toContain("- [Versus](https://x.example/v/): Compare");
    expect(beforeOptional).toContain("## How-to");
    expect(beforeOptional).toContain("- [How](https://x.example/h/): Steps");
  });
});

describe("buildLlmsFullTxt", () => {
  it("flattens the landing page under the product heading", () => {
    const text = buildLlmsFullTxt(englishContent);

    expect(text.startsWith("# Snug\n\n> ")).toBe(true);
    expect(text).toContain(englishContent.meta.description);
    expect(text).toContain(`${SITE_ORIGIN}/install`);
    expect(text.endsWith("\n")).toBe(true);
  });

  it("appends extra sections under their own heading with the url", () => {
    const text = buildLlmsFullTxt(englishContent, [
      { title: "Extra", url: "https://x.example/e/", body: "\n  body text \n" },
    ]);

    expect(text).toContain("## Extra (https://x.example/e/)\n\nbody text\n");
  });
});

describe("buildSitemapXml", () => {
  it("renders each url with its lastmod and alternates", () => {
    const xml = buildSitemapXml([
      {
        loc: "https://x.example/a/",
        lastmod: "2026-01-02",
        alternates: [{ hreflang: "es", href: "https://x.example/es/a/" }],
      },
      { loc: "https://x.example/b/" },
    ]);

    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain("<loc>https://x.example/a/</loc>");
    expect(xml).toContain("<lastmod>2026-01-02</lastmod>");
    expect(xml).toContain(
      '<xhtml:link rel="alternate" hreflang="es" href="https://x.example/es/a/"/>',
    );
    expect(xml.match(/<url>/g)).toHaveLength(2);
    expect(xml.match(/<lastmod>/g)).toHaveLength(1);
    expect(xml.trimEnd().endsWith("</urlset>")).toBe(true);
  });
});
