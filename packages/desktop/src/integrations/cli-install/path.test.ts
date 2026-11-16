import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import path from "node:path";
import { resolveCliInstallSourcePath, resolveCliShimPath } from "./path";

describe("cli-install-path", () => {
  it("uses the bundled shim for packaged macOS installs", () => {
    expect(
      resolveCliInstallSourcePath({
        platform: "darwin",
        isPackaged: true,
        executablePath: "/Applications/Zentic.app/Contents/MacOS/Zentic",
        shimPath: "/Applications/Zentic.app/Contents/Resources/bin/zentic",
      }),
    ).toBe("/Applications/Zentic.app/Contents/Resources/bin/zentic");
  });

  it("prefers the original AppImage path on linux", () => {
    expect(
      resolveCliInstallSourcePath({
        platform: "linux",
        isPackaged: true,
        executablePath: "/tmp/.mount_zentic123/zentic",
        shimPath: "/tmp/.mount_zentic123/resources/bin/zentic",
        appImagePath: "/home/user/Applications/Zentic.AppImage",
      }),
    ).toBe("/home/user/Applications/Zentic.AppImage");
  });

  it("uses the bundled shim for packaged linux installs outside an AppImage", () => {
    expect(
      resolveCliInstallSourcePath({
        platform: "linux",
        isPackaged: true,
        executablePath: "/opt/Zentic/Zentic",
        shimPath: "/opt/Zentic/resources/bin/zentic",
      }),
    ).toBe("/opt/Zentic/resources/bin/zentic");
  });

  it("falls back to the shim on windows and in development", () => {
    expect(
      resolveCliInstallSourcePath({
        platform: "win32",
        isPackaged: true,
        executablePath: "C:\\Users\\user\\AppData\\Local\\Programs\\Zentic\\Zentic.exe",
        shimPath: "C:\\Users\\user\\AppData\\Local\\Programs\\Zentic\\resources\\bin\\zentic.cmd",
      }),
    ).toBe("C:\\Users\\user\\AppData\\Local\\Programs\\Zentic\\resources\\bin\\zentic.cmd");

    expect(
      resolveCliInstallSourcePath({
        platform: "linux",
        isPackaged: false,
        executablePath: "/opt/Zentic/zentic",
        shimPath: "/opt/Zentic/resources/bin/zentic",
      }),
    ).toBe("/opt/Zentic/resources/bin/zentic");
  });
});

describe("CLI executable selection", () => {
  const resolveWorkspaceCli = () =>
    createRequire(import.meta.url).resolve("@getzentic/cli/bin/zentic");

  it("uses the workspace CLI for an unpackaged Electron launcher", () => {
    expect(
      resolveCliShimPath({
        platform: "linux",
        isPackaged: false,
        executablePath: "/nix/store/electron/bin/electron",
        resolveWorkspaceCli,
      }),
    ).toBe(resolveWorkspaceCli());
  });

  it("uses the application shim for a packaged launcher", () => {
    expect(
      resolveCliShimPath({
        platform: "linux",
        isPackaged: true,
        executablePath: "/opt/Zentic/zentic",
        resolveWorkspaceCli,
      }),
    ).toBe(path.join("/opt/Zentic", "resources", "bin", "zentic"));
    expect(
      resolveCliShimPath({
        platform: "darwin",
        isPackaged: true,
        executablePath: "/Applications/Zentic.app/Contents/MacOS/Zentic",
        resolveWorkspaceCli,
      }),
    ).toBe(path.join("/Applications/Zentic.app", "Contents", "Resources", "bin", "zentic"));
  });
});
