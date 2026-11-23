import { access } from "node:fs/promises";
import path from "node:path";

// Shared by the Pi and OMP providers: OMP is a Pi fork with the same retry and session-file shapes.

const AUTH_FAILURE_PATTERN =
  /\b40[13]\b|unauthori[sz]ed|invalid[ _-]?(?:x-)?api[ _-]?key|incorrect[ _-]?api[ _-]?key|api[ _-]?key not valid|authentication[ _-]?(?:error|failed|failure|required)/i;
// A 403 can also report a rate or concurrency cap, which a retry can outlast.
const TRANSIENT_FAILURE_PATTERN = /rate.?limit|too many requests|quota|concurren|overloaded/i;
const MAX_FAILURE_DETAIL_LENGTH = 300;

/** True when a provider error says its credentials were rejected, which no retry can fix. */
export function isProviderAuthFailureMessage(message: string): boolean {
  return AUTH_FAILURE_PATTERN.test(message) && !TRANSIENT_FAILURE_PATTERN.test(message);
}

export function describeCredentialRejection(input: {
  label: string;
  errorMessage: string;
}): string {
  return `${input.label} rejected the provider credentials (${summarizeFailureDetail(input.errorMessage)}). Check the API key this provider uses.`;
}

export function describeMissingSessionFile(input: { label: string; sessionFile: string }): string {
  return `${input.label} couldn't find the previous session file ${input.sessionFile}. Its config directory probably changed. This conversation continues in a new session without the earlier context.`;
}

/**
 * The resolved path of a resumed session file that no longer exists, or null when it exists or
 * cannot be checked. Pi and OMP read a `--session` value with a slash or a `.jsonl` suffix as a
 * path relative to their working directory, and anything else as a session id they look up.
 */
export async function findMissingSessionFile(input: {
  sessionFile: string;
  cwd: string;
}): Promise<string | null> {
  const { sessionFile } = input;
  const isPath =
    sessionFile.includes("/") || sessionFile.includes("\\") || sessionFile.endsWith(".jsonl");
  if (!isPath) return null;
  const resolved = path.resolve(input.cwd, sessionFile);
  try {
    await access(resolved);
    return null;
  } catch (error) {
    return isNodeErrorCode(error, "ENOENT") ? resolved : null;
  }
}

function summarizeFailureDetail(message: string): string {
  const detail = message.replace(/\s+/g, " ").trim() || "no details";
  return detail.length > MAX_FAILURE_DETAIL_LENGTH
    ? `${detail.slice(0, MAX_FAILURE_DETAIL_LENGTH - 1)}…`
    : detail;
}

function isNodeErrorCode(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}
