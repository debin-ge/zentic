import { describe, expect, test } from "vitest";

import { isOmpAuthRetry } from "./auth-retry.js";

describe("isOmpAuthRetry", () => {
  test("trusts OMP's error classification over the message", () => {
    // AuthFailed | Class
    expect(isOmpAuthRetry({ errorMessage: "provider error", errorId: 0x0100_1000 })).toBe(true);
    // Transient | Class: a classified retry without AuthFailed keeps retrying.
    expect(isOmpAuthRetry({ errorMessage: "401 Unauthorized", errorId: 135168 })).toBe(false);
    // AuthFailed | AccountPolicy | Class: OMP retries to rotate the credential.
    expect(isOmpAuthRetry({ errorMessage: "403 Forbidden", errorId: 0x0100_5000 })).toBe(false);
    // AuthFailed | OAuthExpiry | Class: OMP retries after refreshing the grant.
    expect(isOmpAuthRetry({ errorMessage: "401", errorId: 0x4100_1000 })).toBe(false);
  });

  test("reads the message when OMP left the error unclassified", () => {
    expect(isOmpAuthRetry({ errorMessage: "401 Unauthorized", errorId: 401 })).toBe(true);
    expect(isOmpAuthRetry({ errorMessage: "Incorrect API key provided" })).toBe(true);
    expect(isOmpAuthRetry({ errorMessage: "503 Service Unavailable", errorId: 503 })).toBe(false);
    expect(isOmpAuthRetry({ errorMessage: "Request timed out." })).toBe(false);
  });
});
