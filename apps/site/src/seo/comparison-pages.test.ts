import { describe, expect, it } from "vitest";

import { alternativesPath, COMPARISON_PAGE_LOCALES, COMPARISON_SLUGS } from "../i18n/comparisons";
import { SITE_ORIGIN } from "../i18n/locales";
import {
  comparisonLlmsFullSections,
  comparisonLlmsPages,
  comparisonSitemapEntries,
} from "./comparison-pages";

describe("comparisonSitemapEntries", () => {
  const entries = comparisonSitemapEntries();

  it("lists the Alternatives page and each comparison in every locale with copy", () => {
    expect(entries).toHaveLength((COMPARISON_SLUGS.length + 1) * COMPARISON_PAGE_LOCALES.length);
    expect(entries.map((entry) => entry.loc)).toContain(`${SITE_ORIGIN}${alternativesPath("en")}`);
  });

  it("shares one alternates list per page, ending with x-default", () => {
    const english = entries.find(
      (entry) => entry.loc === `${SITE_ORIGIN}${alternativesPath("en")}`,
    );

    expect(english?.alternates).toHaveLength(COMPARISON_PAGE_LOCALES.length + 1);
    expect(english?.alternates?.at(-1)?.hreflang).toBe("x-default");
  });
});

describe("comparisonLlmsPages", () => {
  it("lists the Alternatives page first, then each comparison", () => {
    const pages = comparisonLlmsPages();

    expect(pages).toHaveLength(COMPARISON_SLUGS.length + 1);
    expect(pages.map((page) => page.url)).toEqual([
      `${SITE_ORIGIN}${alternativesPath("en")}`,
      ...COMPARISON_SLUGS.map((slug) => `${SITE_ORIGIN}${alternativesPath("en", slug)}`),
    ]);
    for (const page of pages) {
      expect(page.title.length).toBeGreaterThan(0);
      expect(page.description.length).toBeGreaterThan(0);
    }
  });
});

describe("comparisonLlmsFullSections", () => {
  const sections = comparisonLlmsFullSections();

  it("has the overview followed by one section per comparison", () => {
    expect(sections).toHaveLength(COMPARISON_SLUGS.length + 1);
    expect(sections[0]?.url).toBe(`${SITE_ORIGIN}${alternativesPath("en")}`);
  });

  it("fills every placeholder and lists the switching steps", () => {
    for (const section of sections) {
      expect(section.body).not.toMatch(/\{[a-zA-Z]+\}/);
    }
    for (const section of sections.slice(1)) {
      expect(section.body).toMatch(/^1\. /m);
      expect(section.body).toContain("- ");
    }
  });
});
