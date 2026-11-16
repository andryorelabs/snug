import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";

import { isRecord } from "../testing/guards";
import { interactionDirective } from "./interaction-integration";

type SetupOptions = Parameters<
  NonNullable<ReturnType<typeof interactionDirective>["hooks"]["astro:config:setup"]>
>[0];

function isSetupOptions(value: unknown): value is SetupOptions {
  return isRecord(value) && typeof value.addClientDirective === "function";
}

describe("interactionDirective integration", () => {
  it("is named after the directive it registers", () => {
    expect(interactionDirective().name).toBe("interaction-directive");
  });

  it("registers client:interaction with the directive entrypoint", () => {
    const addClientDirective = vi.fn<(directive: unknown) => void>();
    const setup = interactionDirective().hooks["astro:config:setup"];

    const config: unknown = { addClientDirective };
    if (!isSetupOptions(config)) throw new Error("The fake setup options are invalid");
    void setup?.(config);

    expect(addClientDirective).toHaveBeenCalledExactlyOnceWith({
      name: "interaction",
      entrypoint: fileURLToPath(new URL("interaction-directive.ts", import.meta.url)),
    });
  });
});
