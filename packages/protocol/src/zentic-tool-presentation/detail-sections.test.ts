import { execFileSync } from "node:child_process";
import { copyFileSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { buildZenticToolDetailSections } from "./index.js";

describe("Zentic tool-call detail presentation", () => {
  it.each(["mcp__zentic__create_agent", "zentic.create_agent", "zentic_remote.create_agent"])(
    "shares one create-agent mapping for %s",
    (toolName) => {
      expect(
        buildZenticToolDetailSections(
          toolName,
          {
            workspaceId: "wks_123",
            provider: "codex/gpt-5.4",
            title: "Greeter",
            initialPrompt: "Say hello back.\nDo nothing else.",
            notifyOnFinish: true,
          },
          { agentId: "agt_123", status: "idle" },
        ),
      ).toEqual([
        {
          kind: "prose",
          title: "Prompt",
          text: "Say hello back.\nDo nothing else.",
        },
        {
          kind: "fields",
          title: "Details",
          fields: [
            { label: "Title", value: "Greeter" },
            { label: "Provider", value: "codex/gpt-5.4" },
            { label: "Workspace", value: "wks_123" },
            { label: "Notify on finish", value: "Yes" },
          ],
        },
        {
          kind: "fields",
          title: "Result",
          fields: [
            { label: "Agent", value: "agt_123" },
            { label: "Status", value: "idle" },
          ],
        },
      ]);
    },
  );

  it("formats schedule cadence and nested settings without JSON syntax", () => {
    const sections = buildZenticToolDetailSections(
      "mcp__zentic__create_schedule",
      {
        prompt: "Say hello back.",
        cron: "0 9 * * 1",
        timezone: "Europe/Berlin",
        provider: "codex/gpt-5.4",
        maxRuns: 1,
      },
      {
        id: "sch_123",
        status: "active",
        nextRunAt: "2026-09-07T09:00:00.000Z",
        target: { type: "new-agent", mode: "read-only" },
      },
    );

    expect(sections?.slice(0, 2)).toMatchObject([
      { kind: "prose", title: "Prompt", text: "Say hello back." },
      {
        kind: "fields",
        title: "Details",
        fields: [
          { label: "Cron", value: "0 9 * * 1" },
          { label: "Timezone", value: "Europe/Berlin" },
          { label: "Provider", value: "codex/gpt-5.4" },
          { label: "Maximum runs", value: "1" },
        ],
      },
    ]);
    expect(JSON.stringify(sections)).not.toContain('\\"new-agent\\"');
    expect(sections?.at(-1)).toEqual({
      kind: "fields",
      title: "Result",
      fields: [
        { label: "ID", value: "sch_123" },
        { label: "Status", value: "active" },
        { label: "Next run", value: "2026-09-07T09:00:00.000Z" },
      ],
    });
  });

  it("unwraps MCP result envelopes instead of exposing JSON-encoded text", () => {
    expect(
      buildZenticToolDetailSections(
        "mcp__zentic__send_agent_prompt",
        { prompt: "Say hello back." },
        {
          meta: null,
          content: [
            {
              type: "text",
              text: '{"success":true,"status":"idle","lastMessage":"Hello back."}',
            },
          ],
          structuredContent: {
            success: true,
            status: "idle",
            lastMessage: "Hello back.",
          },
        },
      )?.at(-1),
    ).toEqual({
      kind: "fields",
      title: "Result",
      fields: [
        { label: "Status", value: "idle" },
        { label: "Last message", value: "Hello back." },
      ],
    });
  });

  it("uses readable fallback fields for newly added Zentic tools", () => {
    expect(
      buildZenticToolDetailSections(
        "mcp__zentic__future_tool",
        { opaqueThing: ["one", "two"], enabled: false },
        { success: true },
      ),
    ).toEqual([
      {
        kind: "fields",
        title: "Details",
        fields: [
          { label: "Enabled", value: "No" },
          { label: "Opaque thing", value: "• one\n• two" },
        ],
      },
      {
        kind: "fields",
        title: "Result",
        fields: [{ label: "Success", value: "Yes" }],
      },
    ]);
  });

  it("leaves non-Zentic tools alone", () => {
    expect(buildZenticToolDetailSections("mcp__github__create_issue", {}, {})).toBeNull();
  });
});

describe("published Zentic tool-call detail entry", () => {
  it("preserves the 0.11.4 runtime export and types at the old subpath", () => {
    const packageRoot = fileURLToPath(new URL("../../", import.meta.url));
    const compiler = fileURLToPath(
      new URL("../../../../node_modules/typescript/bin/tsc", import.meta.url),
    );
    const fixture = mkdtempSync(path.join(tmpdir(), "zentic-tool-call-detail-"));
    try {
      copyFileSync(path.join(packageRoot, "package.json"), path.join(fixture, "package.json"));
      symlinkSync(
        path.join(packageRoot, "../../node_modules"),
        path.join(fixture, "node_modules"),
        "junction",
      );
      execFileSync(
        process.execPath,
        [
          compiler,
          "-p",
          path.join(packageRoot, "tsconfig.json"),
          "--outDir",
          path.join(fixture, "dist"),
          "--incremental",
          "false",
        ],
        { stdio: "pipe" },
      );
      writeFileSync(
        path.join(fixture, "consumer.mts"),
        `
import { strict as assert } from "node:assert";
import {
  buildZenticToolDetailSections,
  type ZenticToolDetailField,
  type ZenticToolDetailSection,
} from "@getzentic/protocol/zentic-tool-call-detail";
import { buildZenticToolDetailSections as current } from "@getzentic/protocol/zentic-tool-presentation/index";
const field: ZenticToolDetailField = { label: "Agent", value: "agt_123" };
const sections: ZenticToolDetailSection[] = [
  { kind: "prose", title: "Prompt", text: "Hello" },
  { kind: "fields", title: "Details", fields: [field] },
];
const build: (toolName: string, input: unknown, output: unknown) => ZenticToolDetailSection[] | null = buildZenticToolDetailSections;
assert.equal(build, current);
assert.deepEqual(build("mcp__zentic__send_agent_prompt", { prompt: "Hello", agentId: "agt_123" }, undefined), sections);
`,
      );
      execFileSync(
        process.execPath,
        [
          compiler,
          path.join(fixture, "consumer.mts"),
          "--module",
          "NodeNext",
          "--moduleResolution",
          "NodeNext",
          "--target",
          "ES2020",
          "--strict",
          "--skipLibCheck",
        ],
        { stdio: "inherit" },
      );
      expect(
        execFileSync(process.execPath, [path.join(fixture, "consumer.mjs")], { encoding: "utf8" }),
      ).toBe("");
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  }, 30_000);
});
