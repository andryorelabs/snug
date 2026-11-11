// @vitest-environment jsdom
import { act, createElement, useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createDomHarness } from "./testing/dom-harness";
import type { DomHarness } from "./testing/dom-harness";
import { useOperationProgress } from "./use-operation-progress";
import type { OperationProgressControls } from "./use-operation-progress";

const mountedHarnesses: DomHarness[] = [];
const latest: { controls?: OperationProgressControls | undefined } = {};

const controlsNow = (): OperationProgressControls => {
  if (!latest.controls) throw new Error("Probe has not rendered");
  return latest.controls;
};

function Probe() {
  const controls = useOperationProgress();
  useEffect(() => {
    latest.controls = controls;
  });
  return null;
}

beforeEach(async () => {
  vi.useFakeTimers();
  const harness = createDomHarness();
  mountedHarnesses.push(harness);
  await harness.render(createElement(Probe));
});

afterEach(() => {
  for (const harness of mountedHarnesses.splice(0)) harness.unmount();
  latest.controls = undefined;
  vi.useRealTimers();
});

describe("useOperationProgress", () => {
  it("starts idle with no card", () => {
    expect(controlsNow().state).toEqual({
      phase: "idle",
      done: 0,
      total: 0,
      skippedDuplicates: 0,
      isCardVisible: false,
    });
  });

  it("shows the card only after the operation outlasts the delay", async () => {
    act(() => {
      controlsNow().begin();
    });
    expect(controlsNow().state.phase).toBe("running");
    expect(controlsNow().state.isCardVisible).toBe(false);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(399);
    });
    expect(controlsNow().state.isCardVisible).toBe(false);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(controlsNow().state.isCardVisible).toBe(true);
  });

  it("never shows the card for an operation that ends quickly", async () => {
    act(() => {
      controlsNow().begin();
    });
    act(() => controlsNow().end());

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    expect(controlsNow().state.phase).toBe("idle");
    expect(controlsNow().state.isCardVisible).toBe(false);
  });

  it("records reported counts, defaulting skipped duplicates to zero", () => {
    act(() => {
      controlsNow().begin();
    });

    act(() => controlsNow().report({ done: 3, total: 10 }));
    expect(controlsNow().state).toMatchObject({
      done: 3,
      total: 10,
      skippedDuplicates: 0,
    });

    act(() => controlsNow().report({ done: 4, total: 10, skippedDuplicates: 2 }));
    expect(controlsNow().state.skippedDuplicates).toBe(2);
  });

  it("aborts the signal and shows the card at once when canceling", () => {
    let signal: AbortSignal | undefined;
    act(() => {
      signal = controlsNow().begin();
    });

    act(() => controlsNow().requestCancel());

    expect(signal?.aborted).toBe(true);
    expect(controlsNow().state.phase).toBe("canceling");
    expect(controlsNow().state.isCardVisible).toBe(true);
  });

  it("resets the counts on the next begin and returns to idle on end", () => {
    act(() => {
      controlsNow().begin();
    });
    act(() => controlsNow().report({ done: 5, total: 5, skippedDuplicates: 1 }));
    act(() => controlsNow().end());
    expect(controlsNow().state.phase).toBe("idle");

    act(() => {
      controlsNow().begin();
    });
    expect(controlsNow().state).toMatchObject({
      phase: "running",
      done: 0,
      total: 0,
      skippedDuplicates: 0,
    });
  });

  it("tolerates canceling when no operation began", () => {
    expect(() => act(() => controlsNow().requestCancel())).not.toThrow();
  });
});
