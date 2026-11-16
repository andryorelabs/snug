// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { requireValue } from "../../e2e/require";
import { GOODBYE_COPY_EN, GOODBYE_REASON_IDS, GOODBYE_REINSTALL_HREF } from "../i18n/goodbye";
import type { Locale } from "../i18n/locales";
import GoodbyeReasons from "./GoodbyeReasons";

const mounted: { container?: HTMLElement; root?: Root } = {};

function currentContainer() {
  return requireValue(mounted.container);
}

function mount(search: string, locale: Locale = "en") {
  globalThis.history.replaceState({}, "", `/goodbye/${search}`);
  act(() => {
    mounted.root?.unmount();
  });
  const root = createRoot(currentContainer());
  mounted.root = root;
  act(() => {
    root.render(
      createElement(GoodbyeReasons, {
        locale,
        copy: GOODBYE_COPY_EN,
        privacyHref: "/privacy/",
      }),
    );
  });
}

function reasonButton(reason: string) {
  const buttons = [
    ...currentContainer().querySelectorAll<HTMLButtonElement>("button[data-umami-event-reason]"),
  ];
  return requireValue(buttons.find((button) => button.dataset.umamiEventReason === reason));
}

function click(element: HTMLElement) {
  act(() => {
    element.click();
  });
}

function replyRegion() {
  return requireValue(currentContainer().querySelector("[data-goodbye-reply-region]"));
}

describe("GoodbyeReasons", () => {
  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const container = document.createElement("div");
    document.body.append(container);
    mounted.container = container;
    mounted.root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      mounted.root?.unmount();
    });
    mounted.container?.remove();
    vi.unstubAllGlobals();
  });

  it("renders seven reason buttons with the uninstall-reason event", () => {
    mount("");
    const buttons = [
      ...currentContainer().querySelectorAll<HTMLButtonElement>("button[data-umami-event]"),
    ];
    expect(buttons.map((button) => button.dataset.umamiEvent)).toEqual(
      GOODBYE_REASON_IDS.map(() => "uninstall-reason"),
    );
    expect(buttons.map((button) => button.dataset.umamiEventReason)).toEqual([
      ...GOODBYE_REASON_IDS,
    ]);
  });

  it("shows the backups notice only when ae is 1", () => {
    mount("?ae=1");
    expect(currentContainer().textContent).toContain(GOODBYE_COPY_EN.notice.title);
    mount("?ae=0");
    expect(currentContainer().textContent).not.toContain(GOODBYE_COPY_EN.notice.title);
  });

  it("discloses the values received, or not provided", () => {
    mount("?lang=es&v=2.2.0&ae=1", "es");
    const disclosure = currentContainer().querySelector("[data-goodbye-disclosure]");
    expect(disclosure?.textContent).toBe(
      "This page received only: version 2.2.0, language es, scheduled backups yes. No identifier. Umami counts this visit and the reason you pick, without cookies.",
    );
    mount("");
    const empty = currentContainer().querySelector("[data-goodbye-disclosure]");
    expect(empty?.textContent).toContain("version not provided");
    expect(empty?.textContent).toContain("language not provided");
    expect(empty?.textContent).toContain("scheduled backups not provided");
  });

  it("never renders a bad value as markup", () => {
    mount("?v=%3Cb%3Ex%3C%2Fb%3E&lang=%3Cimg%3E&ae=%3Ci%3E");
    expect(currentContainer().querySelector("b, img, i")).toBeNull();
    expect(currentContainer().textContent).toContain("version not provided");
  });

  it("shows the matching reply when a reason is clicked", () => {
    mount("");
    expect(replyRegion().getAttribute("aria-live")).toBe("polite");
    expect(replyRegion().textContent).toBe("");
    for (const reason of GOODBYE_REASON_IDS) {
      click(reasonButton(reason));
      expect(replyRegion().textContent).toContain(GOODBYE_COPY_EN.replies[reason]);
      expect(reasonButton(reason).getAttribute("aria-pressed")).toBe("true");
    }
  });

  it("links reinstall through the tagged install redirect", () => {
    mount("");
    click(reasonButton("didnt-recognize"));
    const link = replyRegion().querySelector("a");
    expect(link?.getAttribute("href")).toBe(GOODBYE_REINSTALL_HREF);
    expect(GOODBYE_REINSTALL_HREF).toBe("/install?c=goodbye");
  });

  it("links the GitHub template and the email for a bug", () => {
    mount("");
    click(reasonButton("bug"));
    const hrefs = [...replyRegion().querySelectorAll("a")].map((anchor) =>
      anchor.getAttribute("href"),
    );
    expect(hrefs).toEqual([
      expect.stringContaining("github.com/andryorelabs/snug/issues/new"),
      "mailto:hello@andryore.dev",
    ]);
  });

  it("offers only the email for switched and other", () => {
    mount("");
    for (const reason of ["switched", "other"]) {
      click(reasonButton(reason));
      const hrefs = [...replyRegion().querySelectorAll("a")].map((anchor) =>
        anchor.getAttribute("href"),
      );
      expect(hrefs).toEqual(["mailto:hello@andryore.dev"]);
    }
  });
});
