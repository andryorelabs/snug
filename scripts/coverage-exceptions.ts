export interface CoverageException {
  readonly reason: string;
  readonly lines: number;
  readonly functions: number;
}

/**
 * Files allowed below the per-file coverage minimum, keyed by workspace and
 * then by the file path relative to that workspace. Each carries its own
 * floor, which can only rise.
 */
export const COVERAGE_EXCEPTIONS: Readonly<
  Record<string, Readonly<Record<string, CoverageException>>>
> = {
  ".": {
    "eslint-rules/no-non-doc-comments.mjs": {
      reason:
        "Loaded by Oxlint through its JS-plugin bridge, so Vitest sees no executions of it; its behavior is tested through the lint runner in no-non-doc-comments.test.ts.",
      lines: 0,
      functions: 0,
    },
    "oxlint-plugins/typed-react.mjs": {
      reason:
        "Tooling script whose remaining uncovered lines are process, filesystem or network failure paths that only run in CI or against real repositories.",
      lines: 90,
      functions: 78,
    },
    "scripts/check-zip-size.ts": {
      reason:
        "Tooling script whose remaining uncovered lines are process, filesystem or network failure paths that only run in CI or against real repositories.",
      lines: 95,
      functions: 100,
    },
    "scripts/ci-audit.ts": {
      reason:
        "Tooling script whose remaining uncovered lines are process, filesystem or network failure paths that only run in CI or against real repositories.",
      lines: 86,
      functions: 80,
    },
    "scripts/commit-msg.ts": {
      reason:
        "Hook entry point whose main block only runs under Bun when git invokes the hook; the policy function is fully tested.",
      lines: 62,
      functions: 33,
    },
    "scripts/flaky-summary.ts": {
      reason:
        "Tooling script whose remaining uncovered lines are process, filesystem or network failure paths that only run in CI or against real repositories.",
      lines: 92,
      functions: 93,
    },
    "scripts/launch-directories.ts": {
      reason:
        "Tooling script whose remaining uncovered lines are process, filesystem or network failure paths that only run in CI or against real repositories.",
      lines: 96,
      functions: 100,
    },
    "scripts/lint-commits.ts": {
      reason:
        "Tooling script whose remaining uncovered lines are process, filesystem or network failure paths that only run in CI or against real repositories.",
      lines: 86,
      functions: 100,
    },
    "scripts/lint-docs.ts": {
      reason:
        "Tooling script whose remaining uncovered lines are process, filesystem or network failure paths that only run in CI or against real repositories.",
      lines: 88,
      functions: 88,
    },
    "scripts/lint-parity.ts": {
      reason:
        "Tooling script whose remaining uncovered lines are process, filesystem or network failure paths that only run in CI or against real repositories.",
      lines: 96,
      functions: 93,
    },
    "scripts/locks.ts": {
      reason:
        "Tooling script whose remaining uncovered lines are process, filesystem or network failure paths that only run in CI or against real repositories.",
      lines: 76,
      functions: 85,
    },
    "scripts/pre-commit.ts": {
      reason:
        "Hook entry point whose main block only runs under Bun when git invokes the hook; the policy function is fully tested.",
      lines: 53,
      functions: 50,
    },
    "scripts/pre-push.ts": {
      reason:
        "Tooling script whose remaining uncovered lines are process, filesystem or network failure paths that only run in CI or against real repositories.",
      lines: 86,
      functions: 69,
    },
    "scripts/release-gates.ts": {
      reason:
        "Tooling script whose remaining uncovered lines are process, filesystem or network failure paths that only run in CI or against real repositories.",
      lines: 90,
      functions: 77,
    },
    "scripts/release/bump.ts": {
      reason:
        "Tooling script whose remaining uncovered lines are process, filesystem or network failure paths that only run in CI or against real repositories.",
      lines: 90,
      functions: 95,
    },
    "scripts/release/release-notes.ts": {
      reason:
        "Tooling script whose remaining uncovered lines are process, filesystem or network failure paths that only run in CI or against real repositories.",
      lines: 82,
      functions: 40,
    },
    "scripts/repo-settings/check.ts": {
      reason:
        "Tooling script whose remaining uncovered lines are process, filesystem or network failure paths that only run in CI or against real repositories.",
      lines: 89,
      functions: 92,
    },
    "scripts/typecheck-site.ts": {
      reason:
        "Tooling script whose remaining uncovered lines are process, filesystem or network failure paths that only run in CI or against real repositories.",
      lines: 69,
      functions: 83,
    },
  },
  "apps/extension": {
    "lib/custom-folder-writer.ts": {
      reason:
        "Branches that only run against live browser state, covered by the extension e2e specs; the floor rises as unit tests land.",
      lines: 96,
      functions: 100,
    },
    "lib/exporters/export-csv.ts": {
      reason:
        "Branches that only run against live browser state, covered by the extension e2e specs; the floor rises as unit tests land.",
      lines: 96,
      functions: 100,
    },
    "lib/exporters/export-html.ts": {
      reason:
        "Branches that only run against live browser state, covered by the extension e2e specs; the floor rises as unit tests land.",
      lines: 93,
      functions: 100,
    },
    "lib/exporters/export-json.ts": {
      reason:
        "Branches that only run against live browser state, covered by the extension e2e specs; the floor rises as unit tests land.",
      lines: 92,
      functions: 100,
    },
    "lib/folder-access-startup.ts": {
      reason:
        "Branches that only run against live browser state, covered by the extension e2e specs; the floor rises as unit tests land.",
      lines: 90,
      functions: 100,
    },
    "lib/folder-handle.ts": {
      reason:
        "Branches that only run against live browser state, covered by the extension e2e specs; the floor rises as unit tests land.",
      lines: 80,
      functions: 80,
    },
    "lib/folder-run-identity.ts": {
      reason:
        "Branches that only run against live browser state, covered by the extension e2e specs; the floor rises as unit tests land.",
      lines: 97,
      functions: 94,
    },
    "lib/importers/import-html.ts": {
      reason:
        "Branches that only run against live browser state, covered by the extension e2e specs; the floor rises as unit tests land.",
      lines: 95,
      functions: 100,
    },
    "lib/importers/import-json.ts": {
      reason:
        "Branches that only run against live browser state, covered by the extension e2e specs; the floor rises as unit tests land.",
      lines: 92,
      functions: 100,
    },
    "lib/legacy-redirect.ts": {
      reason:
        "Branches that only run against live browser state, covered by the extension e2e specs; the floor rises as unit tests land.",
      lines: 66,
      functions: 50,
    },
    "lib/popup-import-plan.ts": {
      reason:
        "Branches that only run against live browser state, covered by the extension e2e specs; the floor rises as unit tests land.",
      lines: 93,
      functions: 100,
    },
    "lib/run-import.ts": {
      reason:
        "Branches that only run against live browser state, covered by the extension e2e specs; the floor rises as unit tests land.",
      lines: 96,
      functions: 100,
    },
    "lib/safety-snapshot.ts": {
      reason:
        "Branches that only run against live browser state, covered by the extension e2e specs; the floor rises as unit tests land.",
      lines: 95,
      functions: 100,
    },
    "lib/testing/fake-directory-handle.ts": {
      reason:
        "Branches that only run against live browser state, covered by the extension e2e specs; the floor rises as unit tests land.",
      lines: 100,
      functions: 90,
    },
    "lib/testing/fake-locks.ts": {
      reason:
        "Branches that only run against live browser state, covered by the extension e2e specs; the floor rises as unit tests land.",
      lines: 92,
      functions: 100,
    },
    "lib/types.ts": {
      reason:
        "Branches that only run against live browser state, covered by the extension e2e specs; the floor rises as unit tests land.",
      lines: 0,
      functions: 0,
    },
    "lib/uninstall-url.ts": {
      reason:
        "Branches that only run against live browser state, covered by the extension e2e specs; the floor rises as unit tests land.",
      lines: 95,
      functions: 100,
    },
  },
  "apps/site": {
    "src/components/ThemeMenu.tsx": {
      reason:
        "Browser-only behavior (DOM, Trusted Types, theme storage) covered by the site e2e specs rather than by unit tests.",
      lines: 97,
      functions: 94,
    },
    "src/content.config.ts": {
      reason:
        "Astro virtual-module entry that Vitest cannot resolve, verified through the site build output.",
      lines: 0,
      functions: 100,
    },
    "src/docs/chrome-translations.ts": {
      reason:
        "Locale and generated-content branches exercised by the site build and e2e specs; the floor rises as unit tests land.",
      lines: 36,
      functions: 50,
    },
    "src/docs/language-links.ts": {
      reason:
        "Locale and generated-content branches exercised by the site build and e2e specs; the floor rises as unit tests land.",
      lines: 91,
      functions: 100,
    },
    "src/docs/release-notes.ts": {
      reason:
        "Locale and generated-content branches exercised by the site build and e2e specs; the floor rises as unit tests land.",
      lines: 96,
      functions: 100,
    },
    "src/docs/search-trusted-types.ts": {
      reason:
        "Browser-only behavior (DOM, Trusted Types, theme storage) covered by the site e2e specs rather than by unit tests.",
      lines: 85,
      functions: 66,
    },
    "src/i18n/how-to.ts": {
      reason:
        "Locale and generated-content branches exercised by the site build and e2e specs; the floor rises as unit tests land.",
      lines: 98,
      functions: 95,
    },
    "src/i18n/landing.ts": {
      reason:
        "Locale and generated-content branches exercised by the site build and e2e specs; the floor rises as unit tests land.",
      lines: 93,
      functions: 85,
    },
    "src/pages/[...slug].md.ts": {
      reason:
        "Astro virtual-module entry that Vitest cannot resolve, verified through the site build output.",
      lines: 0,
      functions: 0,
    },
    "src/scripts/hidden-until-found.ts": {
      reason:
        "Browser-only behavior (DOM, Trusted Types, theme storage) covered by the site e2e specs rather than by unit tests.",
      lines: 28,
      functions: 42,
    },
    "src/seo/page-descriptor.ts": {
      reason:
        "Locale and generated-content branches exercised by the site build and e2e specs; the floor rises as unit tests land.",
      lines: 0,
      functions: 0,
    },
  },
  "apps/video": {
    "src/audio/beats.ts": {
      reason:
        "Remotion composition or asset module, verified by rendering the video rather than by unit tests.",
      lines: 0,
      functions: 0,
    },
    "src/audio/cues.ts": {
      reason:
        "Remotion composition or asset module, verified by rendering the video rather than by unit tests.",
      lines: 0,
      functions: 0,
    },
    "src/audio/metadata.ts": {
      reason:
        "Remotion composition or asset module, verified by rendering the video rather than by unit tests.",
      lines: 0,
      functions: 0,
    },
    "src/copy/index.ts": {
      reason:
        "Remotion composition or asset module, verified by rendering the video rather than by unit tests.",
      lines: 0,
      functions: 0,
    },
    "src/copy/locales.ts": {
      reason:
        "Remotion composition or asset module, verified by rendering the video rather than by unit tests.",
      lines: 0,
      functions: 100,
    },
    "src/copy/messages.ts": {
      reason:
        "Remotion composition or asset module, verified by rendering the video rather than by unit tests.",
      lines: 0,
      functions: 0,
    },
    "src/copy/store-captions.ts": {
      reason:
        "Remotion composition or asset module, verified by rendering the video rather than by unit tests.",
      lines: 0,
      functions: 0,
    },
    "src/copy/video-copy.ts": {
      reason:
        "Remotion composition or asset module, verified by rendering the video rather than by unit tests.",
      lines: 0,
      functions: 100,
    },
    "src/fonts.ts": {
      reason:
        "Remotion composition or asset module, verified by rendering the video rather than by unit tests.",
      lines: 0,
      functions: 0,
    },
    "src/index.ts": {
      reason:
        "Remotion composition or asset module, verified by rendering the video rather than by unit tests.",
      lines: 0,
      functions: 100,
    },
    "src/motion/easing.ts": {
      reason:
        "Remotion composition or asset module, verified by rendering the video rather than by unit tests.",
      lines: 0,
      functions: 0,
    },
    "src/motion/index.ts": {
      reason:
        "Remotion composition or asset module, verified by rendering the video rather than by unit tests.",
      lines: 0,
      functions: 0,
    },
    "src/motion/split-words.ts": {
      reason:
        "Remotion composition or asset module, verified by rendering the video rather than by unit tests.",
      lines: 96,
      functions: 100,
    },
    "src/schema.ts": {
      reason:
        "Remotion composition or asset module, verified by rendering the video rather than by unit tests.",
      lines: 0,
      functions: 0,
    },
    "src/theme.ts": {
      reason:
        "Remotion composition or asset module, verified by rendering the video rather than by unit tests.",
      lines: 0,
      functions: 100,
    },
    "src/timing.ts": {
      reason:
        "Remotion composition or asset module, verified by rendering the video rather than by unit tests.",
      lines: 0,
      functions: 0,
    },
    "src/ui/index.ts": {
      reason:
        "Remotion composition or asset module, verified by rendering the video rather than by unit tests.",
      lines: 0,
      functions: 0,
    },
  },
};
