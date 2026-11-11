import { describe, expect, it } from "vitest";

import { SITE_ORIGIN } from "../i18n/locales";
import {
  UMAMI_COLLECT_ORIGIN,
  UMAMI_DOMAINS,
  UMAMI_SCRIPT_ORIGIN,
  UMAMI_SCRIPT_URL,
  UMAMI_WEBSITE_ID,
} from "./umami";

describe("Umami settings", () => {
  it("serves the script from the Umami Cloud origin", () => {
    expect(UMAMI_SCRIPT_URL).toBe(`${UMAMI_SCRIPT_ORIGIN}/script.js`);
    expect(new URL(UMAMI_SCRIPT_URL).protocol).toBe("https:");
  });

  it("collects events on a separate https origin", () => {
    expect(new URL(UMAMI_COLLECT_ORIGIN).protocol).toBe("https:");
    expect(UMAMI_COLLECT_ORIGIN).not.toBe(UMAMI_SCRIPT_ORIGIN);
  });

  it("restricts tracking to the site hostname", () => {
    expect(UMAMI_DOMAINS).toBe(new URL(SITE_ORIGIN).hostname);
  });

  it("uses a UUID website id", () => {
    expect(UMAMI_WEBSITE_ID).toMatch(/^[\da-f]{8}(-[\da-f]{4}){3}-[\da-f]{12}$/);
  });
});
