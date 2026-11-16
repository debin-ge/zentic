import { describe, expect, it } from "vitest";

import {
  getZenticToolLeafName,
  isZenticToolName,
} from "@getzentic/protocol/tool-name-normalization";

describe("isZenticToolName", () => {
  it("detects Claude Code format", () => {
    expect(isZenticToolName("mcp__zentic__create_agent")).toBe(true);
    expect(isZenticToolName("mcp__zentic__list_agents")).toBe(true);
  });

  it("detects zentic_voice variant", () => {
    expect(isZenticToolName("mcp__zentic_voice__create_agent")).toBe(true);
    expect(isZenticToolName("zentic_voice.create_agent")).toBe(true);
  });

  it("excludes speak tools", () => {
    expect(isZenticToolName("mcp__zentic_voice__speak")).toBe(false);
    expect(isZenticToolName("mcp__zentic__speak")).toBe(false);
    expect(isZenticToolName("zentic.speak")).toBe(false);
  });

  it("detects Codex dot format", () => {
    expect(isZenticToolName("zentic.create_agent")).toBe(true);
  });

  it("rejects non-zentic tools", () => {
    expect(isZenticToolName("Bash")).toBe(false);
    expect(isZenticToolName("Read")).toBe(false);
    expect(isZenticToolName("mcp__other_server__some_tool")).toBe(false);
  });
});

describe("getZenticToolLeafName", () => {
  it("extracts leaf from Claude Code format", () => {
    expect(getZenticToolLeafName("mcp__zentic__create_agent")).toBe("create_agent");
  });

  it("extracts leaf from Codex format", () => {
    expect(getZenticToolLeafName("zentic.create_agent")).toBe("create_agent");
    expect(getZenticToolLeafName("zentic.list_agents")).toBe("list_agents");
  });

  it("returns null for non-zentic tools", () => {
    expect(getZenticToolLeafName("Bash")).toBeNull();
  });
});
