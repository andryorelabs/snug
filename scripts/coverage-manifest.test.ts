import { readdirSync } from "node:fs";
import path from "node:path";
import { expect, test } from "vitest";

const REPOSITORY_ROOT = path.resolve(import.meta.dirname, "..");

const SOURCE_ROOTS = [
  "apps/extension/lib",
  "apps/site/src",
  "scripts",
  "eslint-rules",
  "oxlint-plugins",
  "packages/ui/src",
  "apps/video/src",
  "apps/extension/entrypoints",
] as const;

const ASTRO_REASON =
  "Presentational Astro component or route with no logic of its own; its inputs are tested in the colocated i18n, seo and docs modules and verified through the site build output.";
const ISLAND_REASON =
  "React island with browser-only behavior, exercised in a real browser by the site e2e specs; its pure logic lives in colocated modules with their own tests.";
const ENDPOINT_REASON =
  "Thin Astro endpoint that feeds a tested builder, verified through the site build output.";
const TEST_SUPPORT_REASON =
  "Test-support helper shared by the extension tests, with no behavior of its own.";

const UI_REASON =
  "Vendored shadcn/ui primitive or helper in the shared UI package, which has no test runner; it is checked by the @shadcn/lint rules and the typecheck, and exercised through the extension and site tests and e2e specs.";
const VIDEO_REASON =
  "Remotion composition, asset or timing module of the promo video, verified by rendering the video and the typecheck; it has no unit-test seam beyond the pure helpers that carry their own tests.";
const ENTRYPOINT_REASON =
  "WXT entrypoint or route that wires tested lib modules into the extension UI; it needs a real browser and is exercised by the extension e2e specs.";

const EXEMPTIONS: Readonly<Record<string, string>> = {
  "apps/extension/lib/testing/dom-harness.ts": TEST_SUPPORT_REASON,
  "apps/extension/lib/testing/fake-folder-run-identity.ts": TEST_SUPPORT_REASON,
  "apps/extension/lib/testing/fake-i18n.ts": TEST_SUPPORT_REASON,
  "apps/extension/lib/testing/fake-locks.ts": TEST_SUPPORT_REASON,
  "apps/extension/lib/testing/fake-permissions.ts": TEST_SUPPORT_REASON,
  "apps/extension/lib/testing/setup-locks.ts": TEST_SUPPORT_REASON,
  "apps/extension/lib/types.ts":
    "Type-only module with the shared extension types, no runtime behavior to test.",
  "apps/site/src/components/AlternativesPage.astro": ASTRO_REASON,
  "apps/site/src/components/Bento.astro": ASTRO_REASON,
  "apps/site/src/components/ComparisonBreadcrumb.astro": ASTRO_REASON,
  "apps/site/src/components/ComparisonCell.astro": ASTRO_REASON,
  "apps/site/src/components/ComparisonPage.astro": ASTRO_REASON,
  "apps/site/src/components/ComparisonTable.astro": ASTRO_REASON,
  "apps/site/src/components/CopyMarkdownButton.tsx": ISLAND_REASON,
  "apps/site/src/components/Eyebrow.astro": ASTRO_REASON,
  "apps/site/src/components/Faq.astro": ASTRO_REASON,
  "apps/site/src/components/FinalCta.astro": ASTRO_REASON,
  "apps/site/src/components/FolderTree.astro": ASTRO_REASON,
  "apps/site/src/components/GoodbyePage.astro": ASTRO_REASON,
  "apps/site/src/components/Footer.astro": ASTRO_REASON,
  "apps/site/src/components/Header.astro": ASTRO_REASON,
  "apps/site/src/components/HeaderMenus.tsx": ISLAND_REASON,
  "apps/site/src/components/Hero.astro": ASTRO_REASON,
  "apps/site/src/components/HeroJourney.astro": ASTRO_REASON,
  "apps/site/src/components/HowItWorks.astro": ASTRO_REASON,
  "apps/site/src/components/HowToIndexPage.astro": ASTRO_REASON,
  "apps/site/src/components/HowToPage.astro": ASTRO_REASON,
  "apps/site/src/components/InstallButton.astro": ASTRO_REASON,
  "apps/site/src/components/InstallDock.astro": ASTRO_REASON,
  "apps/site/src/components/LanguageSwitcher.tsx": ISLAND_REASON,
  "apps/site/src/components/NotFoundPage.astro": ASTRO_REASON,
  "apps/site/src/components/PrivacyPage.astro": ASTRO_REASON,
  "apps/site/src/components/RealInterface.astro": ASTRO_REASON,
  "apps/site/src/components/Section.astro": ASTRO_REASON,
  "apps/site/src/components/SectionHeading.astro": ASTRO_REASON,
  "apps/site/src/components/SocialProof.astro": ASTRO_REASON,
  "apps/site/src/components/TextLink.astro": ASTRO_REASON,
  "apps/site/src/components/TrustProof.astro": ASTRO_REASON,
  "apps/site/src/components/VideoFacade.tsx": ISLAND_REASON,
  "apps/site/src/content.config.ts":
    "Declarative Astro content collection config bound to the astro:content virtual module, which the Vitest setup cannot resolve; its loaders are tested in docs/loader.test.ts and docs/chrome-translations.test.ts.",
  "apps/site/src/docs/components/DocumentationEditLink.astro": ASTRO_REASON,
  "apps/site/src/docs/components/DocumentationFooter.astro": ASTRO_REASON,
  "apps/site/src/docs/components/DocumentationHeader.astro": ASTRO_REASON,
  "apps/site/src/docs/components/DocumentationMobileMenuFooter.astro": ASTRO_REASON,
  "apps/site/src/docs/components/DocumentationMobileMenuToggle.astro": ASTRO_REASON,
  "apps/site/src/docs/components/DocumentationPageTitle.astro": ASTRO_REASON,
  "apps/site/src/docs/components/DocumentationPagination.astro": ASTRO_REASON,
  "apps/site/src/docs/components/DocumentationSearch.astro": ASTRO_REASON,
  "apps/site/src/docs/components/DocumentationTableOfContents.astro": ASTRO_REASON,
  "apps/site/src/docs/components/DocumentationThemeProvider.astro": ASTRO_REASON,
  "apps/site/src/docs/components/DocumentationThemeSelect.astro": ASTRO_REASON,
  "apps/site/src/docs/components/DocumentationTranslationNotice.astro": ASTRO_REASON,
  "apps/site/src/layouts/Layout.astro": ASTRO_REASON,
  "apps/site/src/pages/.well-known/security.txt.ts": ENDPOINT_REASON,
  "apps/site/src/pages/404.astro": ASTRO_REASON,
  "apps/site/src/pages/goodbye.astro": ASTRO_REASON,
  "apps/site/src/pages/[...slug].md.ts": ENDPOINT_REASON,
  "apps/site/src/pages/[locale]/404.astro": ASTRO_REASON,
  "apps/site/src/pages/[locale]/alternatives/[slug].astro": ASTRO_REASON,
  "apps/site/src/pages/[locale]/alternatives/index.astro": ASTRO_REASON,
  "apps/site/src/pages/[locale]/goodbye.astro": ASTRO_REASON,
  "apps/site/src/pages/[locale]/how-to/[slug].astro": ASTRO_REASON,
  "apps/site/src/pages/[locale]/how-to/index.astro": ASTRO_REASON,
  "apps/site/src/pages/[locale]/index.astro": ASTRO_REASON,
  "apps/site/src/pages/[locale]/privacy.astro": ASTRO_REASON,
  "apps/site/src/pages/alternatives/[slug].astro": ASTRO_REASON,
  "apps/site/src/pages/alternatives/index.astro": ASTRO_REASON,
  "apps/site/src/pages/how-to/[slug].astro": ASTRO_REASON,
  "apps/site/src/pages/how-to/index.astro": ASTRO_REASON,
  "apps/site/src/pages/index.astro": ASTRO_REASON,
  "apps/site/src/pages/llms-full.txt.ts": ENDPOINT_REASON,
  "apps/site/src/pages/llms.txt.ts": ENDPOINT_REASON,
  "apps/site/src/pages/privacy.astro": ASTRO_REASON,
  "apps/site/src/pages/robots.txt.ts": ENDPOINT_REASON,
  "apps/site/src/pages/sitemap.xml.ts": ENDPOINT_REASON,
  "apps/site/src/seo/page-descriptor.ts":
    "Type-only module with the page descriptor interface, no runtime behavior to test.",
  "packages/ui/src/components/accordion.tsx": UI_REASON,
  "packages/ui/src/components/alert-dialog.tsx": UI_REASON,
  "packages/ui/src/components/alert.tsx": UI_REASON,
  "packages/ui/src/components/badge.tsx": UI_REASON,
  "packages/ui/src/components/button-group.tsx": UI_REASON,
  "packages/ui/src/components/button.tsx": UI_REASON,
  "packages/ui/src/components/card.tsx": UI_REASON,
  "packages/ui/src/components/checkbox.tsx": UI_REASON,
  "packages/ui/src/components/collapsible.tsx": UI_REASON,
  "packages/ui/src/components/dialog.tsx": UI_REASON,
  "packages/ui/src/components/dropdown-menu.tsx": UI_REASON,
  "packages/ui/src/components/empty.tsx": UI_REASON,
  "packages/ui/src/components/field.tsx": UI_REASON,
  "packages/ui/src/components/input-group.tsx": UI_REASON,
  "packages/ui/src/components/input.tsx": UI_REASON,
  "packages/ui/src/components/item.tsx": UI_REASON,
  "packages/ui/src/components/kbd.tsx": UI_REASON,
  "packages/ui/src/components/label.tsx": UI_REASON,
  "packages/ui/src/components/popover.tsx": UI_REASON,
  "packages/ui/src/components/progress.tsx": UI_REASON,
  "packages/ui/src/components/radio-group.tsx": UI_REASON,
  "packages/ui/src/components/scroll-area.tsx": UI_REASON,
  "packages/ui/src/components/select.tsx": UI_REASON,
  "packages/ui/src/components/separator.tsx": UI_REASON,
  "packages/ui/src/components/sheet.tsx": UI_REASON,
  "packages/ui/src/components/sidebar.tsx": UI_REASON,
  "packages/ui/src/components/skeleton.tsx": UI_REASON,
  "packages/ui/src/components/spinner.tsx": UI_REASON,
  "packages/ui/src/components/switch.tsx": UI_REASON,
  "packages/ui/src/components/tabs.tsx": UI_REASON,
  "packages/ui/src/components/textarea.tsx": UI_REASON,
  "packages/ui/src/components/toast.tsx": UI_REASON,
  "packages/ui/src/components/toggle-group.tsx": UI_REASON,
  "packages/ui/src/components/toggle.tsx": UI_REASON,
  "packages/ui/src/components/tooltip.tsx": UI_REASON,
  "packages/ui/src/hooks/use-mobile.ts": UI_REASON,
  "packages/ui/src/lib/utils.ts": UI_REASON,
  "apps/video/src/audio/beats.ts": VIDEO_REASON,
  "apps/video/src/audio/cues.ts": VIDEO_REASON,
  "apps/video/src/audio/metadata.ts": VIDEO_REASON,
  "apps/video/src/audio/Soundtrack.tsx": VIDEO_REASON,
  "apps/video/src/copy/index.ts": VIDEO_REASON,
  "apps/video/src/copy/locales.ts": VIDEO_REASON,
  "apps/video/src/copy/messages.ts": VIDEO_REASON,
  "apps/video/src/copy/store-captions.ts": VIDEO_REASON,
  "apps/video/src/copy/video-copy.ts": VIDEO_REASON,
  "apps/video/src/FontGate.tsx": VIDEO_REASON,
  "apps/video/src/fonts.ts": VIDEO_REASON,
  "apps/video/src/gallery/Primitives.tsx": VIDEO_REASON,
  "apps/video/src/index.ts": VIDEO_REASON,
  "apps/video/src/motion/Camera.tsx": VIDEO_REASON,
  "apps/video/src/motion/Cursor.tsx": VIDEO_REASON,
  "apps/video/src/motion/easing.ts": VIDEO_REASON,
  "apps/video/src/motion/index.ts": VIDEO_REASON,
  "apps/video/src/motion/KineticText.tsx": VIDEO_REASON,
  "apps/video/src/motion/MatchCut.tsx": VIDEO_REASON,
  "apps/video/src/Promo.tsx": VIDEO_REASON,
  "apps/video/src/Root.tsx": VIDEO_REASON,
  "apps/video/src/scenes/auto-export.tsx": VIDEO_REASON,
  "apps/video/src/scenes/cta.tsx": VIDEO_REASON,
  "apps/video/src/scenes/export.tsx": VIDEO_REASON,
  "apps/video/src/scenes/hook.tsx": VIDEO_REASON,
  "apps/video/src/scenes/import.tsx": VIDEO_REASON,
  "apps/video/src/scenes/local.tsx": VIDEO_REASON,
  "apps/video/src/schema.ts": VIDEO_REASON,
  "apps/video/src/theme.ts": VIDEO_REASON,
  "apps/video/src/thumbnail/Thumbnail.tsx": VIDEO_REASON,
  "apps/video/src/timing.ts": VIDEO_REASON,
  "apps/video/src/ui/AppWindow.tsx": VIDEO_REASON,
  "apps/video/src/ui/BlobMark.tsx": VIDEO_REASON,
  "apps/video/src/ui/Button.tsx": VIDEO_REASON,
  "apps/video/src/ui/Checkbox.tsx": VIDEO_REASON,
  "apps/video/src/ui/Chip.tsx": VIDEO_REASON,
  "apps/video/src/ui/FileIcon.tsx": VIDEO_REASON,
  "apps/video/src/ui/Icon.tsx": VIDEO_REASON,
  "apps/video/src/ui/index.ts": VIDEO_REASON,
  "apps/video/src/ui/SegmentedControl.tsx": VIDEO_REASON,
  "apps/video/src/ui/Toast.tsx": VIDEO_REASON,
  "apps/video/src/ui/TreeRow.tsx": VIDEO_REASON,
  "apps/extension/entrypoints/advanced-export/main.ts": ENTRYPOINT_REASON,
  "apps/extension/entrypoints/advanced-import/main.ts": ENTRYPOINT_REASON,
  "apps/extension/entrypoints/app/app-shell.tsx": ENTRYPOINT_REASON,
  "apps/extension/entrypoints/app/main.tsx": ENTRYPOINT_REASON,
  "apps/extension/entrypoints/app/nav.ts": ENTRYPOINT_REASON,
  "apps/extension/entrypoints/app/routes/export.tsx": ENTRYPOINT_REASON,
  "apps/extension/entrypoints/app/routes/import.tsx": ENTRYPOINT_REASON,
  "apps/extension/entrypoints/app/routes/settings.tsx": ENTRYPOINT_REASON,
  "apps/extension/entrypoints/app/routes/welcome.tsx": ENTRYPOINT_REASON,
  "apps/extension/entrypoints/background.ts": ENTRYPOINT_REASON,
  "apps/extension/entrypoints/offscreen/main.ts": ENTRYPOINT_REASON,
  "apps/extension/entrypoints/popup/App.tsx": ENTRYPOINT_REASON,
  "apps/extension/entrypoints/popup/main.tsx": ENTRYPOINT_REASON,
  "apps/extension/entrypoints/update/main.ts": ENTRYPOINT_REASON,
  "apps/extension/entrypoints/welcome/main.ts": ENTRYPOINT_REASON,
  "scripts/coverage-exceptions.ts":
    "Data-only list of per-file coverage exceptions read by the Vitest configs; its shape and reasons are validated by coverage-floors.test.ts.",
  "scripts/lint-parity-run.ts":
    "CLI runner of the lint parity gate: it only orchestrates external processes (baseline ESLint install, Oxlint, git clones, corpus installs) and is exercised end to end by `bun run lint:parity`; its decision logic lives in the tested scripts/lint-parity.ts.",
  "scripts/oxlint-baseline-plugin.ts":
    "Vendored copy of the shared Oxlint baseline plugin from aokit, loaded only by oxlint.baseline.config.ts and verified by running `bun run lint:baseline`.",
  "scripts/workflow-files.ts":
    "Workflow loader used by workflows-invariants.test.ts, which exercises it against the real workflows.",
};

const exemptedFiles = new Set(Object.keys(EXEMPTIONS));

const isTestFile = (file: string) => /\.test\.(tsx?|mjs)$/.test(file);
const isSourceModule = (file: string) =>
  /\.(tsx?|mjs|astro)$/.test(file) && !/\.d\.m?ts$/.test(file) && !isTestFile(file);

const listFiles = (directory: string): string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return entry.name === "node_modules" ? [] : listFiles(absolute);
    }
    return absolute;
  });

const allFiles = SOURCE_ROOTS.flatMap((root) => listFiles(path.join(REPOSITORY_ROOT, root))).map(
  (file) => path.relative(REPOSITORY_ROOT, file).split(path.sep).join("/"),
);

const modules = allFiles.filter((file) => isSourceModule(file));
const testFiles = new Set(allFiles.filter((file) => isTestFile(file)));

const hasColocatedTest = (file: string) => {
  const base = file.replace(/\.(tsx?|mjs|astro)$/, "");
  return ["ts", "tsx", "mjs"].some((extension) => testFiles.has(`${base}.test.${extension}`));
};

test("every module has a colocated test or a written exemption", () => {
  const uncovered = modules.filter((file) => !hasColocatedTest(file) && !exemptedFiles.has(file));

  expect(uncovered).toEqual([]);
});

test("exemptions are justified and not stale", () => {
  const stale = Object.entries(EXEMPTIONS)
    .filter(
      ([file, reason]) => !modules.includes(file) || hasColocatedTest(file) || reason.trim() === "",
    )
    .map(([file]) => file);

  expect(stale).toEqual([]);
});
