/**
 * A failed provider request OpenCode is about to retry. OpenCode 1.x reports only the message
 * (and sometimes an action) through `session.status`; OpenCode 2.x also reports the error type and
 * HTTP status through `session.retry.scheduled`.
 */
export interface OpenCodeRetryFailure {
  message: string;
  type?: string;
  status?: number;
  action?: { label: string; link?: string };
}

const AUTH_STATUSES = new Set([401, 403]);
const AUTH_ERROR_TYPE =
  /^(?:provider_?auth(?:_?error)?|auth(?:entication)?_?error|unauthori[sz]ed(?:_?error)?)$/i;
// Conservative on purpose: a false match fails a turn OpenCode might still have completed.
const AUTH_MESSAGE =
  /\bunauthori[sz]ed\b|\binvalid[ _-]?api[ _-]?key\b|\bincorrect api key\b|\bauthentication[ _](?:failed|error)\b|\binvalid (?:x-api-key|authentication credentials|credentials)\b/i;

/** A rejected key stays rejected, so OpenCode's retries only keep the turn spinning. */
export function isOpenCodeAuthFailure(failure: OpenCodeRetryFailure): boolean {
  return (
    (failure.status !== undefined && AUTH_STATUSES.has(failure.status)) ||
    (failure.type !== undefined && AUTH_ERROR_TYPE.test(failure.type)) ||
    AUTH_MESSAGE.test(failure.message)
  );
}

function describeFailureDetail(failure: OpenCodeRetryFailure): string {
  const message = failure.message.trim() || failure.type?.trim() || "";
  const detail = [failure.status, message].filter((part) => part !== undefined && part !== "");
  return detail.length > 0 ? detail.join(" ") : "no details";
}

export function describeOpenCodeRetry(failure: OpenCodeRetryFailure): string {
  const base = `OpenCode request failed (${describeFailureDetail(failure)}); retrying.`;
  const action = failure.action;
  if (!action) return base;
  const label = action.label.trim();
  const link = action.link?.trim();
  const hint = [label, link].filter(Boolean).join(": ");
  return hint ? `${base} ${hint}` : base;
}

export function describeOpenCodeAuthFailure(failure: OpenCodeRetryFailure): string {
  return `OpenCode rejected the provider credentials (${describeFailureDetail(failure)}). Check the API key for this model provider (opencode auth login, or the provider env in Zentic's runtime settings).`;
}

export function describeMissingOpenCodeSession(sessionId: string): string {
  return `OpenCode couldn't find the previous session ${sessionId}. Its data directory probably changed. This conversation continues in a new OpenCode session without the earlier context.`;
}

/**
 * Says once per failing request, not once per attempt. OpenCode numbers the attempts of one
 * request from 1, so an attempt lower than the last one seen starts a new failing request. Both
 * retry events OpenCode 2.x publishes carry the same attempt number, so the second is a repeat.
 */
export class OpenCodeRetryNotices {
  private lastAttempt: number | undefined;

  shouldNotify(attempt: number): boolean {
    const isNewRequest = this.lastAttempt === undefined || attempt < this.lastAttempt;
    this.lastAttempt = attempt;
    return isNewRequest;
  }

  reset(): void {
    this.lastAttempt = undefined;
  }
}
