import { isProviderAuthFailureMessage } from "../pi/provider-notices.js";

// OMP's AIError ids (packages/ai/src/error/flags.ts): a classified id carries the Class marker and
// one bit per error kind; an unclassified id is the raw HTTP status, or 0.
const OMP_ERROR_CLASSIFIED = 0x1000;
const OMP_ERROR_AUTH_FAILED = 0x0100_0000;
// Kinds OMP retries to rotate or refresh a credential, which can still succeed.
const OMP_ERROR_RECOVERABLE_AUTH = 0x0000_4000 | 0x4000_0000; // AccountPolicy | OAuthExpiry

export interface OmpRetryFailure {
  errorMessage: string;
  errorId?: number;
}

/** True when an OMP retry is for rejected credentials, which no retry can fix. */
export function isOmpAuthRetry(failure: OmpRetryFailure): boolean {
  const { errorId } = failure;
  if (errorId !== undefined && (errorId & OMP_ERROR_CLASSIFIED) !== 0) {
    return (errorId & OMP_ERROR_AUTH_FAILED) !== 0 && (errorId & OMP_ERROR_RECOVERABLE_AUTH) === 0;
  }
  return isProviderAuthFailureMessage(failure.errorMessage);
}
