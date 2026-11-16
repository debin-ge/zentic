import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";

import { resolveZenticHome } from "./zentic-home.js";
describe("resolveZenticHome", () => {
  test("resolves ZENTIC_HOME without creating it", () => {
    const parent = mkdtempSync(path.join(tmpdir(), "zentic-home-parent-"));
    const zenticHome = path.join(parent, "home");
    try {
      expect(resolveZenticHome({ ZENTIC_HOME: zenticHome })).toBe(zenticHome);
      expect(existsSync(zenticHome)).toBe(false);
    } finally {
      rmSync(parent, { recursive: true, force: true });
    }
  });
});
