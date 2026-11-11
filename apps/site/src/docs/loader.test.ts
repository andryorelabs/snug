import { describe, expect, it, vi } from "vitest";

import { catalogLoader } from "./loader";
import { REPOSITORY_ROOT, TRANSLATIONS_DIRECTORY } from "./paths";

const catalog = vi.hoisted(() => ({
  entries: [] as {
    id: string;
    title: string;
    description: string;
    seoTitle: string;
    editUrl: string;
    status: string;
    englishPath: string;
    body: string;
  }[],
}));

vi.mock("./catalog", () => ({
  loadLocalizedCatalog: () => catalog.entries,
}));

interface StoredEntry {
  id: string;
  body: string;
  data: unknown;
  digest: string;
  rendered: { html: string };
}

const entry = (id: string) => ({
  id,
  title: `Title ${id}`,
  description: "Description",
  seoTitle: "SEO title",
  editUrl: "https://example.com/edit",
  status: "translated",
  englishPath: "docs/usage.md",
  body: `Body of ${id} with [a link](https://example.org/).`,
});

const createContext = (hasWatcher = false) => {
  const handlers = new Map<string, (file: string) => void>();
  const store = {
    clear: vi.fn(),
    set: vi.fn<(stored: StoredEntry) => void>(),
  };
  const watcher = {
    add: vi.fn(),
    on: vi.fn((event: string, handler: (file: string) => void) => {
      handlers.set(event, handler);
    }),
  };
  return {
    handlers,
    store,
    watcher,
    logger: { error: vi.fn() },
    context: {
      store,
      parseData: vi.fn(({ data }: { data: unknown }) => Promise.resolve(data)),
      renderMarkdown: vi.fn((body: string) =>
        Promise.resolve({
          html: `<p>${body}</p>`,
          metadata: { headings: [] },
        }),
      ),
      generateDigest: vi.fn((value: string) => `digest:${value}`),
      logger: { error: vi.fn() },
      watcher: hasWatcher ? watcher : undefined,
    },
  };
};

const load = (context: unknown) =>
  catalogLoader().load(context as Parameters<ReturnType<typeof catalogLoader>["load"]>[0]);

describe("catalogLoader", () => {
  it("is the catalog loader", () => {
    expect(catalogLoader().name).toBe("catalog-loader");
  });

  it("fills the store with one parsed, rendered entry per catalog page", async () => {
    catalog.entries = [entry("guide"), entry("es/guide")];
    const { context, store } = createContext();

    await load(context);

    expect(store.clear).toHaveBeenCalledOnce();
    expect(store.set).toHaveBeenCalledTimes(2);
    expect(store.set.mock.calls[0]?.[0]).toMatchObject({
      id: "guide",
      body: "Body of guide with [a link](https://example.org/).",
      data: {
        title: "Title guide",
        translationStatus: "translated",
        englishPath: "docs/usage.md",
      },
      digest: "digest:translated:Body of guide with [a link](https://example.org/).",
    });
  });

  it("marks external links in the rendered html", async () => {
    catalog.entries = [{ ...entry("guide"), body: "x" }];
    const { context, store } = createContext();
    context.renderMarkdown.mockResolvedValue({
      html: '<a href="https://example.org/">out</a>',
      metadata: { headings: [] },
    });

    await load(context);

    const rendered = store.set.mock.calls[0]?.[0].rendered.html as string;
    expect(rendered).toContain('href="https://example.org/"');
    expect(rendered).not.toBe('<a href="https://example.org/">out</a>');
  });

  it("does not watch anything without a watcher", async () => {
    catalog.entries = [];
    const { context, watcher } = createContext(false);

    await expect(load(context)).resolves.toBeUndefined();
    expect(watcher.add).not.toHaveBeenCalled();
  });

  it("watches the docs, translations and published files and refills on change", async () => {
    catalog.entries = [entry("guide")];
    const { context, watcher, handlers, store } = createContext(true);
    await load(context);
    expect(store.clear).toHaveBeenCalledTimes(1);
    expect(watcher.add.mock.calls[0]?.[0]).toEqual(
      expect.arrayContaining([
        `${REPOSITORY_ROOT}/docs`,
        TRANSLATIONS_DIRECTORY,
        `${REPOSITORY_ROOT}/CHANGELOG.md`,
      ]),
    );
    expect(
      handlers
        .keys()
        .toArray()
        .toSorted((a, b) => a.localeCompare(b)),
    ).toEqual(["add", "change", "unlink"]);

    handlers.get("change")?.(`${REPOSITORY_ROOT}/docs/guide/faq.md`);
    await vi.waitFor(() => expect(store.clear).toHaveBeenCalledTimes(2));

    handlers.get("add")?.(`${REPOSITORY_ROOT}/src/unrelated.ts`);
    await Promise.resolve();
    expect(store.clear).toHaveBeenCalledTimes(2);
  });

  it("logs a refill failure instead of throwing", async () => {
    catalog.entries = [entry("guide")];
    const { context, handlers } = createContext(true);
    await load(context);
    context.parseData.mockRejectedValueOnce(new Error("bad frontmatter"));

    handlers.get("unlink")?.(`${REPOSITORY_ROOT}/CHANGELOG.md`);

    await vi.waitFor(() => expect(context.logger.error).toHaveBeenCalledWith("bad frontmatter"));
  });
});
