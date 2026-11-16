import { describe, expect, it, vi } from "vitest";

import { languageTag, LOCALES } from "../i18n/locales";
import { isRecord } from "../testing/guards";
import { chromeTranslationsLoader, formatZeroResults } from "./chrome-translations";

describe("formatZeroResults", () => {
  it("joins the sentence and the hint with the Pagefind placeholder", () => {
    expect(
      formatZeroResults({
        noResults: "No results for {query}.",
        hint: "Try a shorter word.",
      }),
    ).toBe("No results for [SEARCH_TERM]. Try a shorter word.");
  });
});

type LoadContext = Parameters<ReturnType<typeof chromeTranslationsLoader>["load"]>[0];

function isLoadContext(value: unknown): value is LoadContext {
  return isRecord(value) && isRecord(value.store);
}

describe("chromeTranslationsLoader", () => {
  it("stores one entry per locale in locale order", async () => {
    const set = vi.fn<(entry: { id: string; data: unknown }) => void>();
    const parseData = vi.fn<(entry: { id: string; data: unknown }) => Promise<unknown>>(
      ({ data }) => Promise.resolve(data),
    );
    const context: unknown = { store: { set }, parseData };
    if (!isLoadContext(context)) throw new Error("The fake loader context is invalid");

    await chromeTranslationsLoader().load(context);

    expect(set).toHaveBeenCalledTimes(LOCALES.length);
    expect(set.mock.calls.map(([entry]) => entry.id)).toEqual(
      LOCALES.map((locale) => languageTag(locale)),
    );
  });
});
