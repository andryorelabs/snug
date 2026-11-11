import { describe, expect, it } from "vitest";

import { onRequest } from "./route-middleware";

interface FakeEntry {
  tag: string;
  attrs?: Record<string, string | boolean | undefined>;
  content?: string;
}

interface FakeRoute {
  lang: string;
  head: FakeEntry[];
  entry: {
    id: string;
    data: {
      title: string;
      seoTitle?: string;
      description?: string;
      translationStatus?: string;
    };
  };
  entryMeta: { lang?: string; dir?: string };
  pagination: { prev?: { href: string }; next?: { href: string } };
}

const runMiddleware = async (route: FakeRoute) => {
  await onRequest(
    { locals: { starlightRoute: route } } as never,
    (() => Promise.resolve(new Response())) as never,
  );
  return route;
};

const baseRoute = (overrides: Partial<FakeRoute> = {}): FakeRoute => ({
  lang: "en",
  head: [{ tag: "title", content: "Exporting | Snug" }],
  entry: {
    id: "guide/exporting",
    data: {
      title: "Exporting",
      seoTitle: "Export Chrome Bookmarks",
      description: "Export your bookmarks.",
      translationStatus: "translated",
    },
  },
  entryMeta: {},
  pagination: {},
  ...overrides,
});

const attributesOf = (route: FakeRoute, key: string, value: string) =>
  route.head.filter((entry) => entry.attrs?.[key] === value);

describe("Guide route middleware", () => {
  it("swaps the title for the SEO title and keeps the site suffix", async () => {
    const route = await runMiddleware(baseRoute());

    expect(route.head.find((entry) => entry.tag === "title")?.content).toBe(
      "Export Chrome Bookmarks | Snug",
    );
  });

  it("adds the documentation social and structured-data tags once", async () => {
    const route = await runMiddleware(baseRoute());

    expect(attributesOf(route, "property", "og:image")).toHaveLength(1);
    expect(
      route.head.some(
        (entry) => entry.tag === "script" && entry.attrs?.["type"] === "application/ld+json",
      ),
    ).toBe(true);
  });

  it("falls back to the locale description only when the page has none", async () => {
    const without = await runMiddleware(baseRoute());
    expect(attributesOf(without, "name", "description")).toHaveLength(1);
    expect(without.head.some((entry) => entry.attrs?.["property"] === "og:description")).toBe(true);

    const own = await runMiddleware(
      baseRoute({
        head: [
          { tag: "title", content: "Exporting | Snug" },
          { tag: "meta", attrs: { name: "description", content: "Own text" } },
        ],
      }),
    );
    expect(attributesOf(own, "name", "description")[0]?.attrs?.["content"]).toBe("Own text");
  });

  it("links the previous and next pages", async () => {
    const route = await runMiddleware(
      baseRoute({
        pagination: {
          prev: { href: "/guide/" },
          next: { href: "/guide/importing/" },
        },
      }),
    );

    expect(attributesOf(route, "rel", "prev")[0]?.attrs?.["href"]).toMatch(/\/guide\/$/);
    expect(attributesOf(route, "rel", "next")[0]?.attrs?.["href"]).toMatch(/\/guide\/importing\/$/);
  });

  it("leaves a translated page in its own language", async () => {
    const route = await runMiddleware(baseRoute({ lang: "es" }));

    expect(route.entryMeta).toEqual({});
  });

  it("marks the content of a page still in English as English", async () => {
    const route = await runMiddleware(
      baseRoute({
        lang: "es",
        entry: {
          id: "es/guide/exporting",
          data: { title: "Exporting", translationStatus: "missing" },
        },
      }),
    );

    expect(route.entryMeta).toEqual({ lang: "en", dir: "ltr" });
  });

  it("does not add documentation tags for an entry outside the allowlist", async () => {
    const route = await runMiddleware(
      baseRoute({
        entry: {
          id: "unpublished",
          data: { title: "Other", translationStatus: "translated" },
        },
      }),
    );

    expect(attributesOf(route, "property", "og:image")).toHaveLength(0);
  });
});
