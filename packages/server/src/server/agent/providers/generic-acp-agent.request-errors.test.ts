import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, test, vi } from "vitest";

import { createTestLogger } from "../../../test-utils/test-logger.js";
import type { AgentSession, AgentStreamEvent } from "../agent-sdk-types.js";
import { ACP_STDERR_BUFFER_LIMIT } from "./acp-agent.js";
import { GenericACPAgentClient } from "./generic-acp-agent.js";

describe("GenericACPAgentClient request errors", () => {
  test("reports the agent's message when it rejects the configured mode", async () => {
    await withFakeACPAgent("reject-set-mode", async (command, cwd) => {
      const client = new GenericACPAgentClient({ logger: createTestLogger(), command });

      const created = client.createSession({ provider: "acp", cwd, modeId: "plan" });

      await expect(created).rejects.toBeInstanceOf(Error);
      await expect(created).rejects.toThrow("Internal error: Mode plan is not allowed");
    });
  });

  test("reports the agent's message when it rejects the configured thinking option", async () => {
    await withFakeACPAgent("reject-set-config-option", async (command, cwd) => {
      const client = new GenericACPAgentClient({ logger: createTestLogger(), command });

      const created = client.createSession({ provider: "acp", cwd, thinkingOptionId: "high" });

      await expect(created).rejects.toBeInstanceOf(Error);
      await expect(created).rejects.toThrow("Internal error: Effort high is not allowed");
    });
  });

  test("continues in a new session when the agent no longer has the resumed one", async () => {
    await withFakeACPAgent("missing-session", async (command, cwd) => {
      const client = new GenericACPAgentClient({
        logger: createTestLogger(),
        command,
        label: "Fixture Agent",
      });

      const session = await client.resumeSession(
        { provider: "acp", sessionId: "missing-session", metadata: { cwd } },
        { cwd },
      );
      try {
        expect(session.describePersistence()).toMatchObject({
          sessionId: "fresh-session",
          nativeHandle: "fresh-session",
        });
        const events = collectEvents(session);
        expect(events[0]).toMatchObject({ type: "thread_started", sessionId: "fresh-session" });

        await runTurn(session, events, "first");
        await runTurn(session, events, "second");

        expect(assistantTexts(events)).toEqual([
          "prompt for fresh-session",
          "prompt for fresh-session",
        ]);
        expect(notificationMessages(events)).toEqual([
          "Fixture Agent couldn't find the previous session missing-session. Its data directory probably changed. This conversation continues in a new session without the earlier context.",
        ]);
      } finally {
        await session.close();
      }
    });
  });

  test("still rejects a resume that fails for another reason", async () => {
    await withFakeACPAgent("load-fails", async (command, cwd) => {
      const client = new GenericACPAgentClient({ logger: createTestLogger(), command });

      await expect(
        client.resumeSession(
          { provider: "acp", sessionId: "missing-session", metadata: { cwd } },
          { cwd },
        ),
      ).rejects.toThrow("Internal error: disk on fire");
    });
  });

  test("bounds the exit diagnostic to the most recent stderr", async () => {
    await withFakeACPAgent("noisy-exit", async (command, cwd) => {
      const client = new GenericACPAgentClient({ logger: createTestLogger(), command });
      const session = await client.createSession({ provider: "acp", cwd });
      try {
        const events = collectEvents(session);
        // The first turn floods stderr; the second makes the agent exit.
        await runTurn(session, events, "flood stderr");
        const failed = waitForEvent(events, "turn_failed");
        await session.startTurn("exit");
        const event = await failed;

        expect(event.error).toBe("ACP agent exited unexpectedly (3)");
        expect(event.diagnostic?.length).toBeLessThanOrEqual(ACP_STDERR_BUFFER_LIMIT);
        expect(event.diagnostic).toContain("STDERR-TAIL");
        expect(event.diagnostic).not.toContain("STDERR-HEAD");
      } finally {
        await session.close();
      }
    });
  });
});

function collectEvents(session: AgentSession): AgentStreamEvent[] {
  const events: AgentStreamEvent[] = [];
  session.subscribe((event) => events.push(event));
  return events;
}

async function waitForEvent<T extends AgentStreamEvent["type"]>(
  events: AgentStreamEvent[],
  type: T,
): Promise<Extract<AgentStreamEvent, { type: T }>> {
  const start = events.length;
  return await vi.waitFor(
    () => {
      const event = events.slice(start).find((candidate) => candidate.type === type);
      if (!event) {
        throw new Error(`waiting for ${type}`);
      }
      return event as Extract<AgentStreamEvent, { type: T }>;
    },
    { timeout: 5_000 },
  );
}

async function runTurn(
  session: AgentSession,
  events: AgentStreamEvent[],
  prompt: string,
): Promise<void> {
  const completed = waitForEvent(events, "turn_completed");
  await session.startTurn(prompt);
  await completed;
}

function assistantTexts(events: AgentStreamEvent[]): string[] {
  return events.flatMap((event) =>
    event.type === "timeline" && event.item.type === "assistant_message" ? [event.item.text] : [],
  );
}

function notificationMessages(events: AgentStreamEvent[]): string[] {
  return events.flatMap((event) =>
    event.type === "timeline" && event.item.type === "notification" ? [event.item.message] : [],
  );
}

async function withFakeACPAgent(
  mode:
    | "reject-set-mode"
    | "reject-set-config-option"
    | "missing-session"
    | "load-fails"
    | "noisy-exit",
  run: (command: [string, ...string[]], cwd: string) => Promise<void>,
): Promise<void> {
  const testDir = await mkdtemp(path.join(tmpdir(), "zentic-acp-request-errors-"));
  try {
    const scriptPath = path.join(testDir, "fake-acp-agent.cjs");
    await writeFile(scriptPath, fakeACPAgentScript, "utf8");
    await run([process.execPath, scriptPath, mode], testDir);
  } finally {
    await rm(testDir, { recursive: true, force: true });
  }
}

const fakeACPAgentScript = `
const readline = require("node:readline");

const mode = process.argv[2];
const rl = readline.createInterface({ input: process.stdin });
let promptCount = 0;

function write(message) {
  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", ...message }) + "\\n");
}

rl.on("line", (line) => {
  const message = JSON.parse(line);
  if (message.method === "initialize") {
    write({
      id: message.id,
      result: {
        protocolVersion: message.params?.protocolVersion ?? 1,
        agentCapabilities: {
          loadSession: mode === "missing-session" || mode === "load-fails",
          sessionCapabilities: { close: {} },
        },
      },
    });
    return;
  }

  if (message.method === "session/new") {
    write({
      id: message.id,
      result: {
        sessionId: mode === "missing-session" ? "fresh-session" : "session-1",
        modes: {
          currentModeId: "agent",
          availableModes: [
            { id: "agent", name: "Agent" },
            { id: "plan", name: "Plan" },
          ],
        },
        configOptions: [
          {
            id: "effort",
            name: "Effort",
            category: "thought_level",
            type: "select",
            currentValue: "low",
            options: [
              { value: "low", name: "Low" },
              { value: "high", name: "High" },
            ],
          },
        ],
      },
    });
    return;
  }

  if (message.method === "session/set_mode" && mode === "reject-set-mode") {
    write({
      id: message.id,
      error: { code: -32603, message: "Internal error", data: { details: "Mode plan is not allowed" } },
    });
    return;
  }

  if (message.method === "session/set_config_option" && mode === "reject-set-config-option") {
    write({
      id: message.id,
      error: { code: -32603, message: "Internal error", data: { details: "Effort high is not allowed" } },
    });
    return;
  }

  if (message.method === "session/load" && mode === "missing-session") {
    write({
      id: message.id,
      error: { code: -32002, message: "Resource not found", data: { uri: message.params.sessionId } },
    });
    return;
  }

  if (message.method === "session/load" && mode === "load-fails") {
    write({
      id: message.id,
      error: { code: -32603, message: "Internal error", data: { details: "disk on fire" } },
    });
    return;
  }

  if (message.method === "session/prompt" && mode === "noisy-exit") {
    promptCount += 1;
    if (promptCount > 1) {
      process.exit(3);
    }
    const flood = "STDERR-HEAD" + "x".repeat(20000) + "STDERR-TAIL\\n";
    process.stderr.write(flood, () => write({ id: message.id, result: { stopReason: "end_turn" } }));
    return;
  }

  if (message.method === "session/prompt") {
    write({
      method: "session/update",
      params: {
        sessionId: message.params.sessionId,
        update: {
          sessionUpdate: "agent_message_chunk",
          content: { type: "text", text: "prompt for " + message.params.sessionId },
        },
      },
    });
    write({ id: message.id, result: { stopReason: "end_turn" } });
    return;
  }

  if (message.id !== undefined) {
    write({ id: message.id, result: {} });
  }
});
`;
