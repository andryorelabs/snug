import { execFileSync } from "node:child_process";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { requestWithGitHubCli } from "./check";

vi.mock("node:child_process", () => ({ execFileSync: vi.fn() }));

const execFileSyncMock = vi.mocked(execFileSync);

describe("requestWithGitHubCli", () => {
  beforeEach(() => {
    execFileSyncMock.mockReset();
  });

  test("parses the JSON body and only issues a read through gh api", () => {
    execFileSyncMock.mockReturnValue('{"name":"snug"}');
    expect(requestWithGitHubCli("repos/andryorelabs/snug")).toEqual({
      found: true,
      body: { name: "snug" },
    });
    expect(execFileSyncMock.mock.calls[0]?.[1]).toEqual(["api", "repos/andryorelabs/snug"]);
  });

  test("treats an empty body as an empty object", () => {
    execFileSyncMock.mockReturnValue("  \n");
    expect(requestWithGitHubCli("repos/x")).toEqual({ found: true, body: {} });
  });

  test("maps an HTTP 404 to a not-found answer", () => {
    execFileSyncMock.mockImplementation(() => {
      throw Object.assign(new Error("failed"), { stderr: "gh: Not Found (HTTP 404)" });
    });
    expect(requestWithGitHubCli("repos/x")).toEqual({ found: false });
  });

  test("rethrows any other failure", () => {
    execFileSyncMock.mockImplementation(() => {
      throw Object.assign(new Error("boom"), { stderr: "HTTP 500" });
    });
    expect(() => requestWithGitHubCli("repos/x")).toThrow("boom");
  });
});
