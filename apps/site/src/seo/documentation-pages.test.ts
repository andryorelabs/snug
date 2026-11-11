import { describe, expect, it } from "vitest";

import { PUBLISHED_SOURCES } from "../docs/published";
import { LOCALES, SITE_ORIGIN } from "../i18n/locales";
import {
  demoteHeadings,
  documentationLlmsPages,
  documentationSitemapEntries,
  guideLlmsFullSections,
} from "./documentation-pages";

describe("documentationSitemapEntries", () => {
  const entries = documentationSitemapEntries();

  it("lists every published source in every locale", () => {
    expect(entries).toHaveLength(PUBLISHED_SOURCES.length * LOCALES.length);
  });

  it("lists all locales plus x-default as alternates of each entry", () => {
    for (const entry of entries) {
      expect(entry.alternates).toHaveLength(LOCALES.length + 1);
    }
    expect(entries[0]?.loc).toBe(`${SITE_ORIGIN}/guide/`);
  });
});

describe("documentationLlmsPages", () => {
  const pages = documentationLlmsPages();

  it("links the Markdown twin of every published page", () => {
    expect(pages).toHaveLength(PUBLISHED_SOURCES.length);
    for (const page of pages) {
      expect(page.markdownUrl.startsWith(SITE_ORIGIN)).toBe(true);
      expect(page.markdownUrl).toMatch(/\.md$/);
    }
  });

  it("marks only What is new as secondary", () => {
    expect(pages.filter((page) => page.secondary).map((page) => page.markdownUrl)).toEqual([
      expect.stringContaining("changelog"),
    ]);
  });
});

describe("demoteHeadings", () => {
  it("pushes ATX headings one level down", () => {
    expect(demoteHeadings("# One\n## Two\n##### Five\ntext")).toBe(
      "## One\n### Two\n###### Five\ntext",
    );
  });

  it("leaves fenced code, level-six headings and non-headings alone", () => {
    const markdown = ["```sh", "# comment", "```", "###### Six", "#hashtag"].join("\n");

    expect(demoteHeadings(markdown)).toBe(markdown);
  });
});

describe("guideLlmsFullSections", () => {
  const sections = guideLlmsFullSections();

  it("has one section per Guide page and leaves What is new out", () => {
    expect(sections).toHaveLength(
      PUBLISHED_SOURCES.filter((source) => source.kind === "markdown").length,
    );
    expect(sections.some((section) => section.url.includes("changelog"))).toBe(false);
  });

  it("keeps no H1 in a body, since the section carries the page heading", () => {
    for (const section of sections) {
      expect(section.body).not.toMatch(/^# /m);
    }
  });
});
