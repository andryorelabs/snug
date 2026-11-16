import { describe, expect, it } from "vitest";

import { COMPARISON_PAGE_LOCALES, COMPARISON_SLUGS } from "../i18n/comparisons";
import { isRecord } from "../testing/guards";
import { comparisonPageDescriptor } from "./comparison-descriptor";

interface GraphNode {
  "@type": string;
  itemListElement?: { name: string; item: string }[];
}

function hasGraph(value: object | undefined): value is { "@graph": GraphNode[] } {
  return isRecord(value) && Array.isArray(value["@graph"]);
}

describe("comparisonPageDescriptor", () => {
  it("describes the Alternatives page with a two-step breadcrumb", () => {
    const page = comparisonPageDescriptor("en");
    expect(page.path("en")).toBe("/alternatives/");
    expect(page.alternateLocales).toEqual(COMPARISON_PAGE_LOCALES);
    if (!hasGraph(page.jsonLd)) throw new Error("Missing JSON-LD graph");
    const graph = page.jsonLd["@graph"];
    expect(graph.map((node) => node["@type"])).toEqual(["WebPage", "BreadcrumbList"]);
    expect(JSON.stringify(page.jsonLd)).not.toContain("aggregateRating");
  });

  it("ends a comparison breadcrumb on the competitor and its own path", () => {
    const slug = COMPARISON_SLUGS[0];
    expect(slug).toBeDefined();
    const page = comparisonPageDescriptor("en", slug);
    if (!hasGraph(page.jsonLd)) throw new Error("Missing JSON-LD graph");
    const list = page.jsonLd["@graph"][1]?.itemListElement;
    expect(list).toHaveLength(3);
    expect(list?.[2]?.item).toContain(`/alternatives/${slug}/`);
  });
});
