import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, onTestFinished, test } from "vitest";

import {
  describeCredentialRejection,
  findMissingSessionFile,
  isProviderAuthFailureMessage,
} from "./provider-notices.js";

describe("isProviderAuthFailureMessage", () => {
  test.each([
    '401 {"type":"error","error":{"type":"authentication_error","message":"invalid x-api-key"}}',
    "403 Forbidden",
    "HTTP 401: Unauthorized",
    "Incorrect API key provided: sk-abc. You can find your API key at platform.openai.com.",
    "Invalid API key",
    "API key not valid. Please pass a valid API key.",
    "Authentication failed for provider openrouter",
  ])("treats %j as rejected credentials", (message) => {
    expect(isProviderAuthFailureMessage(message)).toBe(true);
  });

  test.each([
    "Request timed out.",
    "429 Too Many Requests",
    "503 Service Unavailable",
    "overloaded_error: Overloaded",
    "403 rate limit exceeded",
    "403 CONCURRENT_LIMIT: too many concurrent requests",
    "Retrying after 4013 tokens",
    "connection error: other side closed",
  ])("keeps retrying %j", (message) => {
    expect(isProviderAuthFailureMessage(message)).toBe(false);
  });
});

test("describes a credential rejection with a single-line, bounded detail", () => {
  expect(describeCredentialRejection({ label: "Pi", errorMessage: "401\n  Unauthorized " })).toBe(
    "Pi rejected the provider credentials (401 Unauthorized). Check the API key this provider uses.",
  );
  const long = describeCredentialRejection({
    label: "OMP",
    errorMessage: `401 ${"x".repeat(500)}`,
  });
  expect(long).toContain("…). Check the API key this provider uses.");
  expect(long.length).toBeLessThan(400);
});

describe("findMissingSessionFile", () => {
  test("reports a missing session file resolved against the working directory", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "zentic-provider-notices-"));
    onTestFinished(() => rmSync(dir, { recursive: true, force: true }));
    const existing = path.join(dir, "existing.jsonl");
    writeFileSync(existing, "");

    await expect(findMissingSessionFile({ sessionFile: existing, cwd: "/" })).resolves.toBeNull();
    await expect(findMissingSessionFile({ sessionFile: "gone.jsonl", cwd: dir })).resolves.toBe(
      path.join(dir, "gone.jsonl"),
    );
  });

  test("leaves a session id for the provider to look up", async () => {
    await expect(
      findMissingSessionFile({ sessionFile: "0193b7c2", cwd: tmpdir() }),
    ).resolves.toBeNull();
  });
});
