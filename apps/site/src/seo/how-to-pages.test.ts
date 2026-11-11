import { describe, expect, it } from "vitest";

import {
  HOW_TO_INDEX_LOCALES,
  HOW_TO_SLUGS,
  howToIndexPath,
  howToPageLocales,
  howToPath,
} from "../i18n/how-to";
import { SITE_ORIGIN } from "../i18n/locales";
import {
  HOW_TO_SOURCES,
  howToLlmsFullSections,
  howToLlmsPages,
  howToSitemapEntries,
} from "./how-to-pages";

describe("howToSitemapEntries", () => {
  const entries = howToSitemapEntries();

  it("lists the index and every page in every locale that carries it", () => {
    const expectedCount =
      HOW_TO_INDEX_LOCALES.length + HOW_TO_SLUGS.flatMap((slug) => howToPageLocales(slug)).length;

    expect(entries).toHaveLength(expectedCount);
    expect(entries.map((entry) => entry.loc)).toContain(`${SITE_ORIGIN}${howToIndexPath("en")}`);
  });

  it("gives each page alternates for its own locales plus x-default", () => {
    const slug = HOW_TO_SLUGS[0] ?? "";
    const entry = entries.find(
      (candidate) => candidate.loc === `${SITE_ORIGIN}${howToPath("en", slug)}`,
    );

    expect(entry?.alternates).toHaveLength(howToPageLocales(slug).length + 1);
    expect(entry?.alternates?.at(-1)?.hreflang).toBe("x-default");
  });

  it("tracks the content sources for its modified date", () => {
    expect(HOW_TO_SOURCES).toContain("src/content/how-to");
  });
});

describe("howToLlmsPages", () => {
  it("lists the index first, then one page per slug, on absolute English urls", () => {
    const pages = howToLlmsPages();

    expect(pages).toHaveLength(HOW_TO_SLUGS.length + 1);
    expect(pages[0]?.url).toBe(`${SITE_ORIGIN}${howToIndexPath("en")}`);
    expect(pages[1]?.url).toBe(`${SITE_ORIGIN}${howToPath("en", HOW_TO_SLUGS[0] ?? "")}`);
    for (const page of pages) {
      expect(page.title.length).toBeGreaterThan(0);
      expect(page.description.length).toBeGreaterThan(0);
    }
  });
});

describe("howToLlmsFullSections", () => {
  const sections = howToLlmsFullSections();

  it("has one section per page with no unfilled placeholders", () => {
    expect(sections).toHaveLength(HOW_TO_SLUGS.length);
    for (const section of sections) {
      expect(section.body).not.toMatch(/\{[a-zA-Z]+\}/);
      expect(section.body).toContain("### ");
    }
  });

  it("numbers the steps of every page", () => {
    for (const section of sections) {
      expect(section.body).toMatch(/^1\. /m);
    }
  });
});
