// @vitest-environment jsdom
import { act, createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createDomHarness } from "@/lib/testing/dom-harness";
import type { DomHarness } from "@/lib/testing/dom-harness";
import { resetFakeI18n } from "@/lib/testing/fake-i18n";

import en from "../locales/en.json" with { type: "json" };
import { SafetySnapshotCard } from "./safety-snapshot-card";

const restoreMock = vi.hoisted(() => vi.fn<() => Promise<void>>());
const takeMock = vi.hoisted(() => vi.fn<() => void>());
const downloadMock = vi.hoisted(() => vi.fn<() => void>());

vi.mock("@/lib/import-lock", () => ({
  withImportLock: (task: () => Promise<unknown>) => task(),
}));

vi.mock("@/lib/safety-snapshot", () => ({
  safetySnapshotStore: {},
  restoreSafetySnapshot: restoreMock,
  takeSafetySnapshot: takeMock,
  downloadSafetySnapshot: downloadMock,
}));

function snapshotAt(takenAt: number, url: string) {
  return {
    takenAt,
    roots: [
      {
        id: "1",
        title: "Bookmarks bar",
        dateAdded: 0,
        children: [{ title: "A", url, dateAdded: 0 }],
      },
    ],
  };
}

const NEWEST = snapshotAt(2, "https://new.example/");
const OLDER = snapshotAt(1, "https://old.example/");

vi.mock("@/lib/use-storage-item", () => ({
  useStorageItem: () => [[NEWEST, OLDER]],
}));

const mountedHarnesses: DomHarness[] = [];

beforeEach(() => {
  resetFakeI18n();
});

afterEach(() => {
  for (const harness of mountedHarnesses.splice(0)) harness.unmount();
  document.body.replaceChildren();
  restoreMock.mockReset();
  takeMock.mockReset();
  downloadMock.mockReset();
  vi.unstubAllGlobals();
});

function confirmButton(): HTMLButtonElement {
  const buttons = document.body.querySelectorAll<HTMLButtonElement>(
    ':scope [role="alertdialog"] button',
  );
  const button = [...buttons].at(-1);
  if (!button) throw new Error("confirm button missing");
  return button;
}

function rowButton(rowIndex: number, label: string): HTMLButtonElement {
  const row = document.body.querySelectorAll<HTMLElement>('[data-testid="safety-snapshot-row"]')[
    rowIndex
  ];
  const button = [...(row?.querySelectorAll("button") ?? [])].find(
    (candidate) => candidate.textContent.trim() === label,
  );
  if (!button) throw new Error(`${label} button missing in row ${rowIndex}`);
  return button;
}

async function mountCard(): Promise<void> {
  const harness = createDomHarness();
  mountedHarnesses.push(harness);
  await harness.render(createElement(SafetySnapshotCard));
}

async function openConfirmDialog(rowIndex = 1): Promise<void> {
  await mountCard();
  await act(() => {
    rowButton(rowIndex, en.safetySnapshot_restore.message).click();
    return Promise.resolve();
  });
}

describe("SafetySnapshotCard", () => {
  it("marks only the newest row as Latest", async () => {
    await mountCard();

    const rows = document.body.querySelectorAll('[data-testid="safety-snapshot-row"]');
    expect(rows).toHaveLength(2);
    expect(rows[0]?.textContent).toContain(en.safetySnapshot_latest.message);
    expect(rows[1]?.textContent).not.toContain(en.safetySnapshot_latest.message);
  });

  it("restores the chosen snapshot, not the newest", async () => {
    restoreMock.mockResolvedValue(undefined);
    await openConfirmDialog(1);

    await act(() => {
      confirmButton().click();
      return Promise.resolve();
    });

    expect(restoreMock).toHaveBeenCalledExactlyOnceWith(OLDER);
  });

  it("downloads the chosen snapshot", async () => {
    downloadMock.mockResolvedValue(undefined);
    await mountCard();

    await act(() => {
      rowButton(1, en.safetySnapshot_download.message).click();
      return Promise.resolve();
    });

    expect(downloadMock).toHaveBeenCalledExactlyOnceWith(OLDER);
  });

  it("shows the inline error when taking a snapshot fails", async () => {
    takeMock.mockRejectedValue(new Error("blocked"));
    await mountCard();

    await act(() => {
      for (const button of document.body.querySelectorAll("button")) {
        if (button.textContent === en.safetySnapshot_take.message) {
          button.click();
        }
      }
      return Promise.resolve();
    });

    expect(document.body.textContent).toContain(en.safetySnapshot_takeFailedTitle.message);
  });

  it("starts exactly one restore on a fast double click", async () => {
    restoreMock.mockImplementation(
      () =>
        new Promise<void>(() => {
          return;
        }),
    );
    await openConfirmDialog();
    const confirm = confirmButton();

    await act(() => {
      confirm.click();
      confirm.click();
      return Promise.resolve();
    });

    expect(restoreMock).toHaveBeenCalledTimes(1);
  });

  it("allows another restore after the first one failed", async () => {
    restoreMock.mockRejectedValueOnce(new Error("boom"));
    restoreMock.mockResolvedValueOnce(undefined);
    await openConfirmDialog();

    await act(() => {
      confirmButton().click();
      return Promise.resolve();
    });
    await act(() => {
      rowButton(1, en.safetySnapshot_restore.message).click();
      return Promise.resolve();
    });
    await act(() => {
      confirmButton().click();
      return Promise.resolve();
    });

    expect(restoreMock).toHaveBeenCalledTimes(2);
  });
});
