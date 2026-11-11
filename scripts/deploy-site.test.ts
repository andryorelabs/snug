import { spawn } from "node:child_process";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, test } from "vitest";

const DEPLOY_SCRIPT = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../.github/scripts/deploy-coolify.sh",
);
const TOKEN = "stub-token-value";
const APP_UUID = "app-123";
const DEPLOYMENT_UUID = "deployment-456";
const DATES = '{"/":"2026-11-01","/guide/":"2026-11-02"}';
const MAX_POLLS = 90;

interface RecordedRequest {
  readonly method: string;
  readonly url: string;
  readonly authorization: string;
  readonly body: string;
}

interface ScriptResult {
  readonly exitCode: number | null;
  readonly output: string;
}

interface CoolifyStub {
  readonly apiBase: string;
  readonly requests: RecordedRequest[];
  readonly close: () => Promise<void>;
}

/**
 * Starts a local stand-in for the Coolify API. Each status poll answers with
 * the next entry of `statuses`, repeating the last one once they run out.
 * @param statuses The deployment statuses to serve, in poll order.
 * @returns The stub's base URL, the requests it received and a close function.
 */
async function startCoolifyStub(statuses: readonly string[]): Promise<CoolifyStub> {
  const requests: RecordedRequest[] = [];
  let polls = 0;

  function respond(method: string, url: string): [number, unknown] {
    if (method === "PATCH" && url === `/api/v1/applications/${APP_UUID}/envs/bulk`) {
      return [200, {}];
    }
    if (method === "POST" && url === `/api/v1/deploy?uuid=${APP_UUID}&force=false`) {
      return [200, { deployments: [{ deployment_uuid: DEPLOYMENT_UUID }] }];
    }
    if (method === "GET" && url === `/api/v1/deployments/${DEPLOYMENT_UUID}`) {
      const status = statuses[Math.min(polls, statuses.length - 1)];
      polls += 1;
      return [200, { status }];
    }
    return [404, { message: "unexpected request" }];
  }

  const server: Server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
    });
    request.on("end", () => {
      const method = request.method ?? "";
      const url = request.url ?? "";
      requests.push({
        method,
        url,
        authorization: request.headers.authorization ?? "",
        body: Buffer.concat(chunks).toString("utf8"),
      });
      const [statusCode, payload] = respond(method, url);
      response.writeHead(statusCode, { "Content-Type": "application/json" });
      response.end(JSON.stringify(payload));
    });
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  const { port } = server.address() as AddressInfo;

  return {
    apiBase: `http://127.0.0.1:${port}/api/v1`,
    requests,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      }),
  };
}

/**
 * Runs the deploy script with only the given variables plus `PATH`, so no
 * real secret from the caller's environment can reach it.
 * @param environment The variables the script sees.
 * @returns The exit code and the combined stdout and stderr.
 */
function runDeployScript(environment: Record<string, string>): Promise<ScriptResult> {
  return new Promise((resolve, reject) => {
    const child = spawn("bash", [DEPLOY_SCRIPT], {
      env: { PATH: process.env["PATH"] ?? "", ...environment },
    });
    let output = "";
    child.stdout.on("data", (chunk: Buffer) => {
      output += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      output += chunk.toString("utf8");
    });
    child.on("error", reject);
    child.on("close", (exitCode) => {
      resolve({ exitCode, output });
    });
  });
}

describe("deploy-coolify.sh against a local stub", () => {
  let stub: CoolifyStub | undefined;

  async function deploy(
    statuses: readonly string[],
    overrides: Record<string, string> = {},
  ): Promise<{ result: ScriptResult; requests: RecordedRequest[] }> {
    stub = await startCoolifyStub(statuses);
    const result = await runDeployScript({
      COOLIFY_API_BASE: stub.apiBase,
      COOLIFY_POLL_INTERVAL: "0",
      COOLIFY_API_TOKEN: TOKEN,
      COOLIFY_APP_UUID: APP_UUID,
      LAST_MODIFIED_DATES: DATES,
      ...overrides,
    });
    return { result, requests: stub.requests };
  }

  beforeEach(() => {
    stub = undefined;
  });

  afterEach(async () => {
    await stub?.close();
  });

  test("publishes the dates, triggers a deploy and exits 0 once it finishes", async () => {
    const { result, requests } = await deploy(["queued", "in_progress", "finished"]);

    expect(result.output).toContain("Deploy succeeded.");
    expect(result.exitCode).toBe(0);
    expect(requests.map(({ method, url }) => `${method} ${url}`)).toEqual([
      `PATCH /api/v1/applications/${APP_UUID}/envs/bulk`,
      `POST /api/v1/deploy?uuid=${APP_UUID}&force=false`,
      `GET /api/v1/deployments/${DEPLOYMENT_UUID}`,
      `GET /api/v1/deployments/${DEPLOYMENT_UUID}`,
      `GET /api/v1/deployments/${DEPLOYMENT_UUID}`,
    ]);
    expect(JSON.parse(requests[0]?.body ?? "")).toEqual({
      data: [
        {
          key: "LAST_MODIFIED_DATES",
          value: DATES,
          is_buildtime: true,
          is_runtime: false,
          is_literal: true,
        },
      ],
    });
    for (const request of requests) {
      expect(request.authorization).toBe(`Bearer ${TOKEN}`);
    }
  });

  test("never prints the token", async () => {
    const { result } = await deploy(["finished"]);

    expect(result.output).not.toContain(TOKEN);
  });

  test.each(["failed", "cancelled-by-user"])(
    "exits non-zero when the deployment ends as %s",
    async (finalStatus) => {
      const { result, requests } = await deploy(["in_progress", finalStatus]);

      expect(result.output).toContain(
        `::error::Coolify deployment ${DEPLOYMENT_UUID} ended with status '${finalStatus}'.`,
      );
      expect(result.exitCode).toBe(1);
      expect(requests.filter(({ method }) => method === "GET")).toHaveLength(2);
    },
  );

  test("exits non-zero when the deployment never finishes", async () => {
    const { result, requests } = await deploy(["in_progress"]);

    expect(result.output).toContain(
      `::error::Coolify deployment ${DEPLOYMENT_UUID} did not finish after ${MAX_POLLS} status checks`,
    );
    expect(result.exitCode).toBe(1);
    expect(requests.filter(({ method }) => method === "GET")).toHaveLength(MAX_POLLS);
  }, 60_000);

  test("exits non-zero when Coolify rejects the deploy request", async () => {
    const { result, requests } = await deploy(["finished"], {
      COOLIFY_APP_UUID: "unknown-app",
    });

    expect(result.output).toContain("::error::Coolify rejected");
    expect(result.exitCode).toBe(1);
    expect(requests).toHaveLength(1);
  });

  test("names every missing secret and calls nothing", async () => {
    const { result, requests } = await deploy(["finished"], {
      COOLIFY_API_TOKEN: "",
      COOLIFY_APP_UUID: "",
      LAST_MODIFIED_DATES: "",
    });

    expect(result.output).toContain(
      "::error::Missing required environment variables: COOLIFY_API_TOKEN, COOLIFY_APP_UUID, LAST_MODIFIED_DATES.",
    );
    expect(result.exitCode).toBe(1);
    expect(requests).toEqual([]);
  });

  test.each(["COOLIFY_API_TOKEN", "COOLIFY_APP_UUID", "LAST_MODIFIED_DATES"])(
    "names only %s when it is the one missing",
    async (name) => {
      const { result, requests } = await deploy(["finished"], { [name]: "" });

      expect(result.output).toContain(`::error::Missing required environment variables: ${name}.`);
      expect(result.exitCode).toBe(1);
      expect(requests).toEqual([]);
    },
  );

  test.each(["[]", "{}", "not json"])(
    "rejects LAST_MODIFIED_DATES=%s before calling anything",
    async (dates) => {
      const { result, requests } = await deploy(["finished"], {
        LAST_MODIFIED_DATES: dates,
      });

      expect(result.output).toContain(
        "::error::LAST_MODIFIED_DATES is not a non-empty JSON object.",
      );
      expect(result.exitCode).toBe(1);
      expect(requests).toEqual([]);
    },
  );

  test.each(["-1", "1.5", "soon"])(
    "rejects COOLIFY_POLL_INTERVAL=%s before calling anything",
    async (interval) => {
      const { result, requests } = await deploy(["finished"], {
        COOLIFY_POLL_INTERVAL: interval,
      });

      expect(result.output).toContain(
        "::error::COOLIFY_POLL_INTERVAL must be a whole number of seconds.",
      );
      expect(result.exitCode).toBe(1);
      expect(requests).toEqual([]);
    },
  );
});
