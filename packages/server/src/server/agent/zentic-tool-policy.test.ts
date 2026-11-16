import { describe, expect, test } from "vitest";
import type { ProviderZenticToolsPolicy } from "@getzentic/protocol/provider-config";

import { isZenticToolEnabled, resolveZenticToolPolicy } from "./zentic-tool-policy.js";

describe("Zentic tool policy", () => {
  test("defaults to all Zentic tools and resolves only the exact provider ID", () => {
    const customPolicy = {
      enabled: true,
      disabledTools: ["list_agents"],
    } satisfies ProviderZenticToolsPolicy;

    expect(
      resolveZenticToolPolicy("custom-claude", {
        claude: { zenticTools: { enabled: false } },
        "custom-claude": { zenticTools: customPolicy },
      }),
    ).toBe(customPolicy);
    expect(resolveZenticToolPolicy("other-custom", { claude: { zenticTools: customPolicy } })).toBe(
      undefined,
    );
    expect(isZenticToolEnabled(undefined, "list_agents")).toBe(true);
  });

  test("applies the provider gate and sparse disabled tools without filtering speak", () => {
    expect(isZenticToolEnabled({ enabled: false }, "list_agents")).toBe(false);
    expect(isZenticToolEnabled({ enabled: false }, "speak")).toBe(true);
    expect(
      isZenticToolEnabled({ enabled: true, disabledTools: ["list_agents"] }, "list_agents"),
    ).toBe(false);
    expect(
      isZenticToolEnabled({ enabled: true, disabledTools: ["list_agents"] }, "create_agent"),
    ).toBe(true);
  });
});
