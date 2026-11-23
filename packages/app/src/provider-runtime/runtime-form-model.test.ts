import { describe, expect, it } from "vitest";
import { resolveProviderRuntimeSpec } from "./fields";
import {
  joinLaunchArgs,
  openProviderRuntimeForm,
  splitLaunchArgs,
  type ProviderRuntimeOverride,
} from "./runtime-form-model";

function openForm(provider: string, override?: ProviderRuntimeOverride, extendsProvider?: string) {
  const spec = resolveProviderRuntimeSpec({ provider, extendsProvider });
  if (!spec) throw new Error(`no runtime spec for ${provider}`);
  return openProviderRuntimeForm({ provider, spec, override });
}

describe("resolveProviderRuntimeSpec", () => {
  it("gives built-in providers their own fields and their command as the default", () => {
    const claude = resolveProviderRuntimeSpec({ provider: "claude", extendsProvider: undefined });
    expect(claude?.defaultCommand).toBe("claude");
    expect(claude?.groups.map((group) => group.id)).toContain("endpoint");
    expect(
      resolveProviderRuntimeSpec({ provider: "copilot", extendsProvider: undefined })?.groups,
    ).toEqual([]);
  });

  it("gives a derived entry the fields of the provider it extends", () => {
    const derived = resolveProviderRuntimeSpec({
      provider: "claude-thub",
      extendsProvider: "claude",
    });
    expect(derived?.defaultCommand).toBe("claude");
    expect(derived?.groups.length).toBeGreaterThan(0);
  });

  it("requires a command for ACP entries and skips plugin providers", () => {
    expect(resolveProviderRuntimeSpec({ provider: "gemini", extendsProvider: "acp" })).toEqual({
      groups: [],
      defaultCommand: null,
    });
    expect(resolveProviderRuntimeSpec({ provider: "muse", extendsProvider: undefined })).toBeNull();
  });
});

describe("openProviderRuntimeForm", () => {
  it("opens a stored entry without a pending change", () => {
    const form = openForm("claude", {
      command: ["/opt/claude", "--settings", "a b.json"],
      env: {
        CLAUDE_CONFIG_DIR: "/home/me/.claude-alt",
        DISABLE_AUTO_COMPACT: "true",
        HTTPS_PROXY: "http://proxy:8080",
      },
    });
    const state = form.getState();

    expect(state.binaryPath).toBe("/opt/claude");
    expect(state.launchArgs).toBe('--settings "a b.json"');
    expect(state.values.claudeConfigDir).toBe("/home/me/.claude-alt");
    expect(state.values.disableAutoCompact).toBe("1");
    expect(state.customEnv.map(({ key, value }) => ({ key, value }))).toEqual([
      { key: "HTTPS_PROXY", value: "http://proxy:8080" },
    ]);
    expect(state.patch).toBeNull();
    expect(state.canSave).toBe(false);
  });

  it("sends only the env keys that changed, with null for removed ones", () => {
    const form = openForm("claude", {
      env: { CLAUDE_CONFIG_DIR: "/old", API_TIMEOUT_MS: "60000", KEEP: "x" },
    });

    form.setFieldValue("claudeConfigDir", "/new");
    form.setFieldValue("apiTimeoutMs", "");
    form.setFieldValue("anthropicBaseUrl", "https://relay.example.com");

    expect(form.getState().patch).toEqual({
      env: {
        CLAUDE_CONFIG_DIR: "/new",
        API_TIMEOUT_MS: null,
        ANTHROPIC_BASE_URL: "https://relay.example.com",
      },
    });
    expect(form.getState().canSave).toBe(true);
  });

  it("writes custom env rows and removes deleted ones", () => {
    const form = openForm("codex", { env: { FOO: "1" } });
    const [fooRow] = form.getState().customEnv;
    form.removeCustomEnv(fooRow.rowId);
    form.addCustomEnv();
    const added = form.getState().customEnv[0];
    form.setCustomEnvKey(added.rowId, "BAR");
    form.setCustomEnvValue(added.rowId, "two");

    expect(form.getState().patch).toEqual({ env: { FOO: null, BAR: "two" } });
  });

  it("builds the command from the binary path and launch args, and clears it when emptied", () => {
    const form = openForm("claude");
    form.setLaunchArgs("--verbose");
    expect(form.getState().patch).toEqual({ command: ["claude", "--verbose"] });

    form.setBinaryPath("/usr/local/bin/claude");
    expect(form.getState().patch).toEqual({ command: ["/usr/local/bin/claude", "--verbose"] });

    const stored = openForm("claude", { command: ["/usr/local/bin/claude"] });
    stored.setBinaryPath("");
    expect(stored.getState().patch).toEqual({ command: null });
  });

  it("stores provider options with their types and removes cleared ones", () => {
    const form = openForm("pi", { options: { rpcTimeoutMs: 30000, sessionDir: "/s" } });

    form.setFieldValue("rpcTimeoutMs", "90000");
    form.setFieldValue("sessionDir", "");

    expect(form.getState().patch).toEqual({ options: { rpcTimeoutMs: 90000, sessionDir: null } });
  });

  it("rejects invalid values and blocks the save", () => {
    const form = openForm("claude");
    form.setFieldValue("autoCompactWindow", "99999");
    form.setFieldValue("anthropicBaseUrl", "relay.example.com");
    form.addCustomEnv();
    const row = form.getState().customEnv[0];
    form.setCustomEnvKey(row.rowId, "CLAUDE_CONFIG_DIR");

    const state = form.getState();
    expect(state.errors.fields.autoCompactWindow).toEqual({
      code: "invalidInteger",
      min: 100_000,
      max: 1_000_000,
    });
    expect(state.errors.fields.anthropicBaseUrl).toEqual({ code: "invalidUrl" });
    expect(state.errors.customEnv[row.rowId]).toEqual({ code: "duplicateEnvKey" });
    expect(state.canSave).toBe(false);

    form.setFieldValue("autoCompactWindow", "1000000");
    expect(form.getState().errors.fields.autoCompactWindow).toBeUndefined();
  });

  it("requires a JSON object for inline OpenCode config", () => {
    const form = openForm("opencode");
    form.setFieldValue("opencodeConfigContent", "[1]");
    expect(form.getState().errors.fields.opencodeConfigContent).toEqual({ code: "invalidJson" });
    form.setFieldValue("opencodeConfigContent", '{"model":"x"}');
    expect(form.getState().patch).toEqual({ env: { OPENCODE_CONFIG_CONTENT: '{"model":"x"}' } });
  });

  it("requires a command for ACP entries", () => {
    const form = openForm("gemini", { command: ["gemini", "--acp"] }, "acp");
    form.setBinaryPath("");
    expect(form.getState().errors.binaryPath).toEqual({ code: "commandRequired" });
    expect(form.getState().canSave).toBe(false);
  });

  it("cannot save while saving, and an edit clears a failed save", () => {
    const form = openForm("claude");
    form.setFieldValue("claudeConfigDir", "/x");
    form.setSaveStatus({ status: "saving" });
    expect(form.getState().canSave).toBe(false);

    form.setSaveStatus({ status: "error", message: "boom" });
    form.setFieldValue("claudeConfigDir", "/y");
    expect(form.getState().save).toEqual({ status: "idle" });
    expect(form.getState().canSave).toBe(true);
  });
});

describe("launch args", () => {
  it("splits like a shell", () => {
    expect(splitLaunchArgs(`--a 'b c' "d \\"e\\"" f\\ g`)).toEqual(["--a", "b c", 'd "e"', "f g"]);
    expect(splitLaunchArgs("  ")).toEqual([]);
    expect(splitLaunchArgs("--a 'b")).toBeNull();
  });

  it("joins so that a split gives the same args back", () => {
    const args = ["--settings", "a b.json", 'say "hi"', "", "plain"];
    expect(splitLaunchArgs(joinLaunchArgs(args))).toEqual(args);
  });
});
