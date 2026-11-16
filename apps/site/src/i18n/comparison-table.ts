import { COMPETITORS, SNUG_FACTS } from "../content/competitors";
import { COMPARISON_SLUGS, type ComparisonSlug } from "./comparisons";
import { languageTag, type Locale } from "./locales";

/**
 * Criteria of the comparison tables, in column order. Each key has a label in
 * the comparison copy's `shared.criteria`.
 */
export const CRITERION_KEYS = [
  "exportFormats",
  "import",
  "chooseFolders",
  "schedule",
  "cloudCopies",
  "browsers",
  "languages",
  "usersRating",
  "dataDisclosure",
] as const;

export type CriterionKey = (typeof CRITERION_KEYS)[number];

type Maybe<T> = T | "not-listed";

/**
 * The facts a table cell reads. Both a competitor's store listing and Snug's
 * own facts satisfy it.
 */
export interface TableFacts {
  exportFormats: Maybe<readonly string[]>;
  import: Maybe<readonly string[]>;
  chooseFolders: true | "not-listed";
  schedule: true | "not-listed";
  cloudCopies: true | "none" | "not-listed";
  browsers: Maybe<readonly string[]>;
  languageCount: Maybe<number>;
  userCount: number;
  ratingValue: number;
  ratingCount: number;
  dataDisclosure: "none-declared" | Maybe<readonly string[]>;
}

/**
 * What one table cell shows. `not-listed` is the only rendering of a missing
 * fact; `none` is reserved for a stated absence such as Snug's own copies or a
 * listing that declares no data.
 */
export type FactCell =
  | { kind: "text"; text: string; isEnglish: boolean }
  | { kind: "yes" }
  | { kind: "none" }
  | { kind: "none-declared" }
  | { kind: "not-listed" };

function listCell(value: Maybe<readonly string[]>, isEnglish: boolean): FactCell {
  if (value === "not-listed") return { kind: "not-listed" };
  const text = value.join(", ");
  return { kind: "text", text, isEnglish };
}

function flagCell(value: true | "none" | "not-listed"): FactCell {
  return { kind: value === true ? "yes" : value };
}

/**
 * The cell for one criterion of one subject.
 * @param key - The criterion.
 * @param facts - Snug's facts or a competitor's listing facts.
 * @param locale - The page locale, used to format numbers.
 * @returns The cell to render; text is not translated, copy labels are.
 */
export function factCell(key: CriterionKey, facts: TableFacts, locale: Locale): FactCell {
  if (key === "exportFormats") return listCell(facts.exportFormats, false);
  if (key === "import") return listCell(facts.import, false);
  if (key === "chooseFolders") return flagCell(facts.chooseFolders);
  if (key === "schedule") return flagCell(facts.schedule);
  if (key === "cloudCopies") return flagCell(facts.cloudCopies);
  if (key === "browsers") return listCell(facts.browsers, false);
  const tag = languageTag(locale);
  if (key === "languages") {
    return facts.languageCount === "not-listed"
      ? { kind: "not-listed" }
      : {
          kind: "text",
          text: new Intl.NumberFormat(tag).format(facts.languageCount),
          isEnglish: false,
        };
  }
  if (key === "usersRating") {
    const numbers = new Intl.NumberFormat(tag);
    const rating = new Intl.NumberFormat(tag, {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    });
    return {
      kind: "text",
      text: `${numbers.format(facts.userCount)} / ${rating.format(facts.ratingValue)} (${numbers.format(facts.ratingCount)})`,
      isEnglish: false,
    };
  }
  return facts.dataDisclosure === "none-declared"
    ? { kind: "none-declared" }
    : listCell(facts.dataDisclosure, true);
}

/**
 * One extension in a comparison table.
 */
export interface ComparisonSubject {
  isSnug: boolean;
  slug?: ComparisonSlug;
  name: string;
  shortName: string;
  storeUrl: string;
  facts: TableFacts;
}

/**
 * Snug followed by each competitor that has a comparison page.
 * @returns The table rows, Snug first.
 */
export function comparisonSubjects(): ComparisonSubject[] {
  const competitors = COMPARISON_SLUGS.map((slug) => {
    const facts = COMPETITORS[slug];
    return {
      isSnug: false,
      slug,
      name: facts.name,
      shortName: facts.shortName,
      storeUrl: facts.storeUrl,
      facts,
    };
  });
  return [
    {
      isSnug: true,
      name: SNUG_FACTS.name,
      shortName: SNUG_FACTS.name,
      storeUrl: SNUG_FACTS.storeUrl,
      facts: SNUG_FACTS,
    },
    ...competitors,
  ];
}
