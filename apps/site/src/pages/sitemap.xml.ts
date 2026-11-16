import { hreflangAlternates, localePath, LOCALES, SITE_ORIGIN } from "../i18n/locales";
import { ENGLISH_PRIVACY_PATH, PRIVACY_PAGE_LOCALES, privacyPath } from "../i18n/privacy";
import { comparisonSitemapEntries } from "../seo/comparison-pages";
import { buildSitemapXml, sitemapEntry } from "../seo/crawlers";
import { documentationSitemapEntries } from "../seo/documentation-pages";
import { howToSitemapEntries } from "../seo/how-to-pages";
import { lastCommitDate } from "../seo/last-modified";

export function GET() {
  const homeEntries = LOCALES.map((locale) =>
    sitemapEntry(
      `${SITE_ORIGIN}${localePath(locale)}`,
      lastCommitDate([`src/content/${locale}.json`]),
      hreflangAlternates(),
    ),
  );
  const privacyAlternates = hreflangAlternates(ENGLISH_PRIVACY_PATH, PRIVACY_PAGE_LOCALES);
  const privacyLastmod = lastCommitDate([
    "src/content/privacy",
    "src/components/PrivacyPage.astro",
    "src/pages/privacy.astro",
    "../../PRIVACY_POLICY.md",
  ]);
  const privacyEntries = PRIVACY_PAGE_LOCALES.map((locale) =>
    sitemapEntry(`${SITE_ORIGIN}${privacyPath(locale)}`, privacyLastmod, privacyAlternates),
  );
  const entries = [
    ...homeEntries,
    ...privacyEntries,
    ...comparisonSitemapEntries(),
    ...howToSitemapEntries(),
    ...documentationSitemapEntries(),
  ];
  return new Response(buildSitemapXml(entries), {
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
}
