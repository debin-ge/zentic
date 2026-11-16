import { describe, expect, test } from "vitest";

import { MutableDaemonConfigPatchSchema, MutableDaemonConfigSchema } from "./messages.js";
import { ProviderOverrideSchema, ProviderZenticToolsPolicySchema } from "./provider-config.js";

describe("provider Zentic-tool policy", () => {
  test("accepts arbitrary tool IDs and leaves an empty policy enabled by default", () => {
    expect(
      ProviderZenticToolsPolicySchema.parse({
        disabledTools: ["future_tool", "browser_future_tool"],
      }),
    ).toEqual({
      disabledTools: ["future_tool", "browser_future_tool"],
    });
    expect(ProviderZenticToolsPolicySchema.parse({})).toEqual({});
    expect(ProviderOverrideSchema.parse({}).zenticTools).toBeUndefined();
  });

  test("accepts zenticTools on persisted provider overrides", () => {
    expect(
      ProviderOverrideSchema.parse({
        extends: "claude",
        zenticTools: {
          enabled: false,
          disabledTools: ["create_workspace"],
        },
      }).zenticTools,
    ).toEqual({
      enabled: false,
      disabledTools: ["create_workspace"],
    });
  });

  test("accepts zenticTools when reading and patching mutable daemon providers", () => {
    expect(
      MutableDaemonConfigSchema.parse({
        mcp: { injectIntoAgents: true },
        providers: {
          codex: {
            zenticTools: { enabled: false, disabledTools: ["future_tool"] },
          },
        },
      }).providers.codex?.zenticTools,
    ).toEqual({
      enabled: false,
      disabledTools: ["future_tool"],
    });

    expect(
      MutableDaemonConfigPatchSchema.parse({
        providers: {
          codex: {
            zenticTools: { disabledTools: ["browser_future_tool"] },
          },
        },
      }).providers?.codex?.zenticTools,
    ).toEqual({ disabledTools: ["browser_future_tool"] });
  });
});
