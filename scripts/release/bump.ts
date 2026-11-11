import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { cutRelease } from "./changelog";
import { compareVersions, parseVersion } from "./version";

const PACKAGE_PATH = "apps/extension/package.json";
const CHANGELOG_DATA_PATH = "apps/extension/lib/changelog.ts";
const LOCALES_PATH = "apps/extension/locales";
const CHANGELOG_PATH = "CHANGELOG.md";
const DEFAULT_LOCALE_FILE = "en.json";

const PACKAGE_VERSION_FIELD = /^(\s*"version":\s*")([^"]*)(")/m;
const FIRST_CHANGELOG_ENTRY = /^([ \t]*)\{\n([ \t]*)version: (['"])/m;
const LOCALE_FILE_END = /\n\}\s*$/;

/**
 * A release that cannot be prepared as asked. The message is written for the
 * person cutting the release.
 */
export class ReleaseError extends Error {
  override readonly name = "ReleaseError";
}

/**
 * One file the release script rewrote: its `path` relative to the repository
 * root, with `/` separators, and a one-line `summary` of what changed in it.
 */
export interface ChangedFile {
  readonly path: string;
  readonly summary: string;
}

interface PlannedWrite extends ChangedFile {
  readonly content: string;
}

function todayIsoDate(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

function messageKeys(version: string, count: number): string[] {
  const prefix = `changelog_${version.replaceAll(/[^0-9A-Za-z]/g, "_")}`;
  return Array.from({ length: count }, (_, index) => `${prefix}_${index + 1}`);
}

function readCurrentVersion(packageText: string): string {
  const { version } = JSON.parse(packageText) as { version?: unknown };
  if (typeof version !== "string") {
    throw new ReleaseError(`${PACKAGE_PATH} has no "version" field`);
  }
  return version;
}

function assertIncreasing(version: string, currentVersion: string): void {
  const next = parseVersion(version);
  if (!next) {
    throw new ReleaseError(
      `"${version}" is not a valid version. Use MAJOR.MINOR.PATCH with an optional prerelease suffix and no leading "v", such as 2.4.0 or 2.4.0-beta.1`,
    );
  }
  const current = parseVersion(currentVersion);
  if (!current) {
    throw new ReleaseError(
      `${PACKAGE_PATH} carries the version "${currentVersion}", which is not valid`,
    );
  }
  if (compareVersions(next, current) <= 0) {
    throw new ReleaseError(`${version} is not higher than the current version ${currentVersion}`);
  }
}

function bumpPackage(packageText: string, currentVersion: string, version: string): string {
  const field = PACKAGE_VERSION_FIELD.exec(packageText);
  const [, prefix = "", fieldVersion] = field ?? [];
  if (!field || fieldVersion !== currentVersion) {
    throw new ReleaseError(`Could not find the "version" field to rewrite in ${PACKAGE_PATH}`);
  }
  const versionStart = field.index + prefix.length;
  return (
    packageText.slice(0, versionStart) +
    version +
    packageText.slice(versionStart + currentVersion.length)
  );
}

function addChangelogEntry(
  source: string,
  version: string,
  isoDate: string,
  keys: readonly string[],
): string {
  const firstEntry = FIRST_CHANGELOG_ENTRY.exec(source);
  if (!firstEntry) {
    throw new ReleaseError(
      `Could not find the first changelog entry in ${CHANGELOG_DATA_PATH} to insert ${version} above it`,
    );
  }
  const [, entryIndent = "", fieldIndent = "", quote = "'"] = firstEntry;
  const quoted = (text: string) => `${quote}${text}${quote}`;
  const items = keys.map((key) => `{ textKey: ${quoted(key)} }`);
  const itemLines =
    items.length === 1
      ? [`${fieldIndent}items: [${items[0]}],`]
      : [
          `${fieldIndent}items: [`,
          ...items.map((item) => `${fieldIndent}  ${item},`),
          `${fieldIndent}],`,
        ];
  const entry = [
    `${entryIndent}{`,
    `${fieldIndent}version: ${quoted(version)},`,
    `${fieldIndent}isoDate: ${quoted(isoDate)},`,
    ...itemLines,
    `${entryIndent}},`,
    "",
  ].join("\n");
  return source.slice(0, firstEntry.index) + entry + source.slice(firstEntry.index);
}

function addLocaleMessages(
  localeText: string,
  localePath: string,
  messages: ReadonlyMap<string, string>,
): string {
  const existingKeys = new Set(Object.keys(JSON.parse(localeText) as Record<string, unknown>));
  for (const key of messages.keys()) {
    if (existingKeys.has(key)) {
      throw new ReleaseError(`${localePath} already has the key "${key}"`);
    }
  }
  if (!LOCALE_FILE_END.test(localeText)) {
    throw new ReleaseError(`Could not find the closing brace of ${localePath}`);
  }
  const additions = [...messages].map(
    ([key, text]) =>
      `,\n  ${JSON.stringify(key)}: {\n    "message": ${JSON.stringify(text.replaceAll("$", "$$$$"))}\n  }`,
  );
  return localeText.replace(LOCALE_FILE_END, () => `${additions.join("")}\n}\n`);
}

function planRelease(root: string, version: string): PlannedWrite[] {
  const read = (relativePath: string) => readFileSync(path.join(root, relativePath), "utf8");

  const packageText = read(PACKAGE_PATH);
  const currentVersion = readCurrentVersion(packageText);
  assertIncreasing(version, currentVersion);

  const isoDate = todayIsoDate();
  const cut = cutRelease(read(CHANGELOG_PATH), version, isoDate);
  const keys = messageKeys(version, cut.items.length);
  const messages = new Map(keys.map((key, index) => [key, cut.items[index] ?? ""]));

  const localeFiles = readdirSync(path.join(root, LOCALES_PATH))
    .filter((name) => name.endsWith(".json"))
    .toSorted((first, second) => first.localeCompare(second));
  if (!localeFiles.includes(DEFAULT_LOCALE_FILE)) {
    throw new ReleaseError(`${LOCALES_PATH} has no ${DEFAULT_LOCALE_FILE}`);
  }

  return [
    {
      path: PACKAGE_PATH,
      summary: `version ${currentVersion} -> ${version}`,
      content: bumpPackage(packageText, currentVersion, version),
    },
    {
      path: CHANGELOG_DATA_PATH,
      summary: `new ${version} entry with ${keys.length} item(s)`,
      content: addChangelogEntry(read(CHANGELOG_DATA_PATH), version, isoDate, keys),
    },
    ...localeFiles.map((name) => {
      const localePath = `${LOCALES_PATH}/${name}`;
      return {
        path: localePath,
        summary:
          name === DEFAULT_LOCALE_FILE
            ? `${keys.length} changelog string(s) copied from CHANGELOG.md`
            : `${keys.length} changelog string(s) in English, to translate`,
        content: addLocaleMessages(read(localePath), localePath, messages),
      };
    }),
    {
      path: CHANGELOG_PATH,
      summary: `[Unreleased] moved into [${version}] - ${isoDate}, compare links updated`,
      content: cut.text,
    },
  ];
}

/**
 * Prepares a release in the working tree: bumps the extension version, adds
 * the in-app changelog entry and one message key per CHANGELOG entry to every
 * locale, moves `[Unreleased]` into a section dated today and updates the
 * compare links. Every file is validated before the first one is written, so
 * a rejected release changes nothing. Never commits, tags or pushes.
 *
 * Locales other than `en` receive the English text as a placeholder; the
 * release PR translates it.
 * @param root The repository root to release.
 * @param version The new version, such as `2.4.0` or `2.4.0-beta.1`.
 * @returns The files that were rewritten, in the order they were written.
 * @throws {ReleaseError} When the version is invalid or not higher than the
 * current one, or a file does not have the expected shape.
 * @throws {ChangelogError} When `[Unreleased]` has nothing to release.
 */
export function bumpVersion(root: string, version: string): ChangedFile[] {
  const writes = planRelease(root, version);
  for (const write of writes) {
    writeFileSync(path.join(root, write.path), write.content);
  }
  return writes.map(({ path: filePath, summary }) => ({
    path: filePath,
    summary,
  }));
}

/**
 * Runs the `bun run release <version>` command.
 * @param commandArguments The arguments after the script name.
 * @param root The repository root to release.
 * @param log Receives each output line.
 * @returns The process exit code: 0 when the release was prepared, 1 when it
 * was rejected.
 */
export function runRelease(
  commandArguments: readonly string[],
  root: string,
  log: (message: string) => void,
): number {
  const [version, ...extra] = commandArguments;
  if (!version || extra.length > 0) {
    log("Usage: bun run release <version>, for example bun run release 2.4.0");
    return 1;
  }
  try {
    const changed = bumpVersion(root, version);
    log(`Prepared release ${version}:`);
    for (const file of changed) {
      log(`  ${file.path}: ${file.summary}`);
    }
    log("Nothing was committed, tagged or pushed. Next:");
    log("  1. Translate the new changelog strings in every locale other than en.");
    log("  2. Run bun run fix, then bun run check and bun run test.");
    log(`  3. Open a PR titled "chore: 🔖 release v${version}".`);
    return 0;
  } catch (error) {
    if (error instanceof Error) {
      log(`release: ${error.message}`);
      return 1;
    }
    throw error;
  }
}

if (import.meta.main) {
  process.exitCode = runRelease(
    process.argv.slice(2),
    path.resolve(import.meta.dirname, "../.."),
    (message) => console.error(message),
  );
}
