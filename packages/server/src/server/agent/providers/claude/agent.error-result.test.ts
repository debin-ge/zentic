import { expect, test } from "vitest";
import { createTestLogger } from "../../../../test-utils/test-logger.js";
import { collectSessionTurnEvents } from "../test-utils/session-stream-adapter.js";
import { ClaudeAgentClient } from "./agent.js";
import type { ClaudeQueryFactory } from "./query.js";

const LIMIT = "You've hit your session limit · resets 5:20pm (Asia/Singapore)";

interface ScriptedTurn {
  // An API error reply as Claude Code writes it: a synthetic assistant message with `error`.
  errorReply?: string;
  // Assistant text the model wrote before or after it.
  before?: string;
  after?: string;
  isError: boolean;
  // Failed API attempts Claude Code reports before the turn ends, as `api_retry` messages.
  apiRetries?: { status: number; error: string }[];
  // Hold the turn after its retries until Zentic interrupts Claude, as a stuck retry loop would.
  untilInterrupted?: boolean;
  subtype?:
    | "error_max_turns"
    | "error_during_execution"
    | "error_max_budget_usd"
    | "error_max_structured_output_retries";
  usage?: {
    inputTokens: number;
    cachedInputTokens: number;
    outputTokens: number;
    totalCostUsd: number;
  };
}

async function* apiRetryMessages(
  turn: ScriptedTurn,
  turnIndex: number,
  interrupted: Promise<void>,
) {
  yield* (turn.apiRetries ?? []).map((retry, attempt) => ({
    type: "system",
    subtype: "api_retry",
    attempt: attempt + 1,
    max_retries: 10,
    retry_delay_ms: 500,
    error_status: retry.status,
    error: retry.error,
    uuid: `retry-${turnIndex}-${attempt}`,
    session_id: "error-session",
  }));
  if (turn.untilInterrupted) await interrupted;
}

// A query dependency that speaks Claude Code's stream interface, one scripted turn per prompt.
interface QueryCalls {
  interrupts: number;
}

function scriptedQuery(
  turns: ScriptedTurn[],
  calls: QueryCalls = { interrupts: 0 },
): ClaudeQueryFactory {
  return ({ prompt }) => {
    let index = 0;
    let resolveInterrupted!: () => void;
    const interrupted = new Promise<void>((resolve) => {
      resolveInterrupted = resolve;
    });
    const assistant = (id: string, text: string, error?: string) => ({
      type: "assistant",
      session_id: "error-session",
      parent_tool_use_id: null,
      uuid: id,
      message: {
        id,
        role: "assistant",
        model: error ? "<synthetic>" : "claude-opus-5-5",
        content: [{ type: "text", text }],
        stop_reason: "stop_sequence",
        usage: { input_tokens: 0, output_tokens: 0 },
      },
      ...(error ? { error } : {}),
    });
    const messages = (async function* () {
      if (typeof prompt === "string") throw new Error("Expected streaming input");
      for await (const _message of prompt) {
        const turn = turns[index];
        index += 1;
        yield {
          type: "system",
          subtype: "init",
          session_id: "error-session",
          permissionMode: "default",
          model: "claude-opus-5-5",
        };
        yield* apiRetryMessages(turn, index, interrupted);
        if (turn.before) yield assistant(`before-${index}`, turn.before);
        if (turn.errorReply) yield assistant(`error-${index}`, turn.errorReply, "rate_limit");
        if (turn.after) yield assistant(`after-${index}`, turn.after);
        yield {
          type: "result",
          subtype: turn.subtype ?? "success",
          session_id: "error-session",
          duration_ms: 1,
          duration_api_ms: 0,
          is_error: turn.isError,
          ...(turn.subtype ? { errors: ["Reached maximum number of turns (1)"] } : {}),
          num_turns: 1,
          result: turn.isError ? (turn.errorReply ?? "") : (turn.after ?? turn.errorReply ?? ""),
          stop_reason: "stop_sequence",
          total_cost_usd: turn.usage?.totalCostUsd ?? 0,
          usage: {
            input_tokens: turn.usage?.inputTokens ?? 0,
            output_tokens: turn.usage?.outputTokens ?? 0,
            cache_read_input_tokens: turn.usage?.cachedInputTokens ?? 0,
          },
          modelUsage: {},
          permission_denials: [],
          uuid: `result-${index}`,
        };
      }
    })();
    return Object.assign(messages, {
      close: () => {
        void messages.return();
      },
      interrupt: async () => {
        calls.interrupts += 1;
        resolveInterrupted();
      },
      setModel: async () => undefined,
      setPermissionMode: async () => undefined,
      supportedModels: async () => [],
      supportedCommands: async () => [],
    }) as ReturnType<ClaudeQueryFactory>;
  };
}

async function runTurns(turns: ScriptedTurn[], calls?: QueryCalls) {
  const client = new ClaudeAgentClient({
    logger: createTestLogger(),
    queryFactory: scriptedQuery(turns, calls),
    resolveBinary: async () => process.execPath,
  });
  const session = await client.createSession({
    provider: "claude",
    cwd: process.cwd(),
  });
  try {
    const results = [];
    for (const [index] of turns.entries()) {
      results.push(await collectSessionTurnEvents(session, `turn ${index + 1}`));
    }
    return results;
  } finally {
    await session.close();
  }
}

function assistantTexts(events: Awaited<ReturnType<typeof runTurns>>[number]): string[] {
  return events.flatMap((event) =>
    event.type === "timeline" && event.item.type === "assistant_message" ? [event.item.text] : [],
  );
}

function terminal(events: Awaited<ReturnType<typeof runTurns>>[number]) {
  return events.find(
    (event) =>
      event.type === "turn_completed" ||
      event.type === "turn_failed" ||
      event.type === "turn_canceled",
  );
}

test("a turn Claude Code ends on an API error fails with the error, shown once", async () => {
  const [limited, overloaded, next] = await runTurns([
    { errorReply: LIMIT, isError: true },
    {
      before: "Checking the deploy doc.",
      errorReply: "API Error: 529 Overloaded",
      isError: true,
    },
    { after: "Done.", isError: false },
  ]);

  expect(terminal(limited)).toMatchObject({
    type: "turn_failed",
    error: LIMIT,
  });
  expect(assistantTexts(limited)).toEqual([]);

  expect(terminal(overloaded)).toMatchObject({
    type: "turn_failed",
    error: "API Error: 529 Overloaded",
  });
  expect(assistantTexts(overloaded)).toEqual(["Checking the deploy doc."]);

  // The session keeps working after a failed turn.
  expect(terminal(next)).toMatchObject({ type: "turn_completed" });
  expect(assistantTexts(next)).toEqual(["Done."]);
});

test("a failed turn retains its final token counts and cost", async () => {
  const usage = {
    inputTokens: 120,
    cachedInputTokens: 80,
    outputTokens: 30,
    totalCostUsd: 0.012,
  };
  const [failed] = await runTurns([
    { before: "Checking the deploy doc.", errorReply: LIMIT, isError: true, usage },
  ]);

  expect(failed).toContainEqual(
    expect.objectContaining({ type: "usage_updated", usage: expect.objectContaining(usage) }),
  );
  expect(terminal(failed)).toMatchObject({ type: "turn_failed", error: LIMIT });
  expect(assistantTexts(failed)).toEqual(["Checking the deploy doc."]);
});

test("an error reply the turn moves past is still shown", async () => {
  const [recovered, completed] = await runTurns([
    {
      errorReply: "API Error: 529 Overloaded",
      after: "Recovered.",
      isError: false,
    },
    { errorReply: LIMIT, isError: false },
  ]);

  expect(terminal(recovered)).toMatchObject({ type: "turn_completed" });
  expect(assistantTexts(recovered)).toEqual(["API Error: 529 Overloaded", "Recovered."]);

  expect(terminal(completed)).toMatchObject({ type: "turn_completed" });
  expect(assistantTexts(completed)).toEqual([LIMIT]);
});

test.each([
  "error_max_turns",
  "error_during_execution",
  "error_max_budget_usd",
  "error_max_structured_output_retries",
] as const)("a %s result publishes final usage before failure", async (subtype) => {
  const usage = {
    inputTokens: 2,
    cachedInputTokens: 12577,
    outputTokens: 110,
    totalCostUsd: 0.00365537,
  };
  const [failed, next] = await runTurns([
    { before: "Running the command.", isError: true, subtype, usage },
    { after: "Done.", isError: false },
  ]);

  // Collection ends at the terminal event, so this also checks ordering.
  expect(failed).toContainEqual(
    expect.objectContaining({ type: "usage_updated", usage: expect.objectContaining(usage) }),
  );
  expect(terminal(failed)).toMatchObject({
    type: "turn_failed",
    error: "Reached maximum number of turns (1)",
  });
  expect(assistantTexts(failed)).toEqual(["Running the command."]);
  expect(terminal(next)).toMatchObject({ type: "turn_completed" });
  expect(assistantTexts(next)).toEqual(["Done."]);
});

function notifications(events: Awaited<ReturnType<typeof runTurns>>[number]) {
  return events.flatMap((event) =>
    event.type === "timeline" && event.item.type === "notification" ? [event.item] : [],
  );
}

test("a rejected key fails the turn on the first retry and stops Claude retrying", async () => {
  const calls = { interrupts: 0 };
  const [rejected, next] = await runTurns(
    [
      {
        apiRetries: [{ status: 401, error: "authentication_failed" }],
        untilInterrupted: true,
        errorReply: "Failed to authenticate. API Error: 401 Invalid API key",
        isError: true,
      },
      { after: "Done.", isError: false },
    ],
    calls,
  );

  expect(terminal(rejected)).toMatchObject({
    type: "turn_failed",
    error:
      "Claude API rejected the credentials (401 authentication_failed). Check the API key or token this provider uses, in its CLAUDE_CONFIG_DIR settings.json or its runtime settings.",
  });
  expect(notifications(rejected)).toEqual([]);
  expect(calls.interrupts).toBe(1);

  // The interrupted request's own result is dropped, and the next message runs normally.
  expect(terminal(next)).toMatchObject({ type: "turn_completed" });
  expect(assistantTexts(next)).toEqual(["Done."]);
});

test("a request Claude Code retries for a passing error shows one warning, then the turn fails", async () => {
  const calls = { interrupts: 0 };
  const [overloaded] = await runTurns(
    [
      {
        apiRetries: [
          { status: 529, error: "overloaded" },
          { status: 529, error: "overloaded" },
        ],
        errorReply: "API Error: 529 Overloaded",
        isError: true,
      },
    ],
    calls,
  );

  expect(notifications(overloaded)).toEqual([
    {
      type: "notification",
      level: "warning",
      message: "Claude API request failed (529 overloaded); retrying up to 10 times.",
    },
  ]);
  expect(terminal(overloaded)).toMatchObject({
    type: "turn_failed",
    error: "API Error: 529 Overloaded",
  });
  expect(calls.interrupts).toBe(0);
});
