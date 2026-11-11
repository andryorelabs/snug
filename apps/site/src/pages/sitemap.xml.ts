import { hreflangAlternates, localePath, LOCALES, SITE_ORIGIN } from "../i18n/locales";
import { ENGLISH_PRIVACY_PATH, PRIVACY_PAGE_LOCALES, privacyPath } from "../i18n/privacy";
import { comparisonSitemapEntries } from "../seo/comparison-pages";
import { buildSitemapXml } from "../seo/crawlers";
import { documentationSitemapEntries } from "../seo/documentation-pages";
import { howToSitemapEntries } from "../seo/how-to-pages";
import { lastCommitDate } from "../seo/last-modified";

function lastmodField(lastmod: string | undefined): { lastmod?: string } {
  return lastmod === undefined ? {} : { lastmod };
}

export function GET() {
  const homeEntries = LOCALES.map((locale) => ({
    loc: `${SITE_ORIGIN}${localePath(locale)}`,
    ...lastmodField(lastCommitDate([`src/content/${locale}.json`])),
    alternates: hreflangAlternates(),
  }));
  const privacyAlternates = hreflangAlternates(ENGLISH_PRIVACY_PATH, PRIVACY_PAGE_LOCALES);
  const privacyLastmod = lastCommitDate([
    "src/content/privacy",
    "src/components/PrivacyPage.astro",
    "src/pages/privacy.astro",
    "../../PRIVACY_POLICY.md",
  ]);
  const privacyEntries = PRIVACY_PAGE_LOCALES.map((locale) => ({
    loc: `${SITE_ORIGIN}${privacyPath(locale)}`,
    ...lastmodField(privacyLastmod),
    alternates: privacyAlternates,
  }));
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
