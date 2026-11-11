import { fileURLToPath } from "node:url";

import { describe, expect, it, vi } from "vitest";

import { interactionDirective } from "./interaction-integration";

describe("interactionDirective integration", () => {
  it("is named after the directive it registers", () => {
    expect(interactionDirective().name).toBe("interaction-directive");
  });

  it("registers client:interaction with the directive entrypoint", () => {
    const addClientDirective = vi.fn();
    const setup = interactionDirective().hooks["astro:config:setup"];

    void setup?.({ addClientDirective } as never);

    expect(addClientDirective).toHaveBeenCalledExactlyOnceWith({
      name: "interaction",
      entrypoint: fileURLToPath(new URL("interaction-directive.ts", import.meta.url)),
    });
  });
});
