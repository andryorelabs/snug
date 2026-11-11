import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { contrastRatio, readDeclarations } from "./contrast";

const TOKENS_CSS = readFileSync(path.join(import.meta.dirname, "../tokens.css"), "utf8");
const WCAG_AA_TEXT = 4.5;

const TEXT_PAIRS = [
  ["foreground", "background"],
  ["card-foreground", "card"],
  ["popover-foreground", "popover"],
  ["primary-foreground", "primary"],
  ["secondary-foreground", "secondary"],
  ["accent-foreground", "accent"],
  ["muted-foreground", "background"],
  ["muted-foreground", "card"],
  ["primary-text", "background"],
  ["primary-text", "card"],
  ["sidebar-foreground", "sidebar"],
] as const;

function blockAfter(marker: string): string {
  const start = TOKENS_CSS.indexOf(marker);
  return TOKENS_CSS.slice(start, TOKENS_CSS.indexOf("\n}", start));
}

function resolveVariable(value: string, scopes: readonly Record<string, string>[]): string {
  const name = /^var\(--([\w-]+)\)$/.exec(value)?.[1];
  const target = name === undefined ? undefined : scopes.map((scope) => scope[name]).find(Boolean);
  return target === undefined ? value : resolveVariable(target, scopes);
}

function blockOf(selector: ":root" | ".dark"): Record<string, string> {
  const declared = readDeclarations(blockAfter(`\n${selector} {`));
  const scopes = [declared, readDeclarations(blockAfter(":root {"))];
  return Object.fromEntries(
    Object.entries(declared).map(([name, value]) => [name, resolveVariable(value, scopes)]),
  );
}

describe("tokens.css", () => {
  for (const selector of [":root", ".dark"] as const) {
    const tokens = blockOf(selector);
    for (const [foreground, background] of TEXT_PAIRS) {
      it(`${selector} ${foreground} on ${background} meets WCAG AA`, () => {
        const ratio = contrastRatio(tokens[foreground] ?? "", tokens[background] ?? "");
        expect(
          ratio,
          `${selector} ${foreground} on ${background} is ${ratio.toFixed(2)}:1, needs ${WCAG_AA_TEXT}:1`,
        ).toBeGreaterThanOrEqual(WCAG_AA_TEXT);
      });
    }
  }

  it("declares the display, UI and mono font families", () => {
    const tokens = readDeclarations(TOKENS_CSS);
    expect(tokens["font-display"]).toContain("Space Grotesk");
    expect(tokens["font-sans"]).toContain("Geist");
    expect(tokens["font-mono"]).toContain("Geist Mono");
  });

  it("measures contrast with known references", () => {
    expect(contrastRatio("#ffffff", "#000000")).toBeCloseTo(21, 1);
    expect(contrastRatio("#777777", "#ffffff")).toBeLessThan(WCAG_AA_TEXT);
  });
});
