import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve as resolvePath } from "node:path";

// Where the Zentic CLI lives, for the PATH entry and ZENTIC_HOOK_CLI every terminal gets. Kept
// apart from terminal.ts so the daemon can resolve it without loading node-pty.

const require = createRequire(import.meta.url);
const ZENTIC_CLI_BIN_ENTRY = "@getzentic/cli/bin/zentic";

export function resolveExternalProcessPath(filePath: string): string {
  return filePath.replace(/\.asar(?=[/\\]|$)/, ".asar.unpacked");
}

export function resolveZenticCliBinDir(): string | null {
  const cliExecutable = resolveZenticCliExecutablePath();
  return cliExecutable ? dirname(cliExecutable) : null;
}

export function resolveZenticCliExecutablePath(): string | null {
  const configuredCli = process.env.ZENTIC_CLI?.trim();
  if (configuredCli) {
    return resolvePath(configuredCli);
  }

  const cliEntrypoint = resolveZenticCliBinEntrypoint();
  if (!cliEntrypoint) {
    return null;
  }

  const externalCliEntrypoint = resolveExternalProcessPath(cliEntrypoint);
  const npmBinDir = findNpmBinDir(dirname(externalCliEntrypoint));
  if (npmBinDir) {
    const shim = resolveZenticCliShim(npmBinDir);
    if (shim) {
      return shim;
    }
  }

  return externalCliEntrypoint;
}

function resolveZenticCliBinEntrypoint(): string | null {
  try {
    return require.resolve(ZENTIC_CLI_BIN_ENTRY);
  } catch {
    return null;
  }
}

function findNpmBinDir(startPath: string): string | null {
  let current = startPath;
  while (true) {
    const candidate = join(current, "node_modules", ".bin");
    if (hasZenticCliShim(candidate)) {
      return candidate;
    }

    const parent = dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
}

function hasZenticCliShim(binDir: string): boolean {
  return resolveZenticCliShim(binDir) !== null;
}

function resolveZenticCliShim(binDir: string): string | null {
  for (const name of zenticCliShimNames()) {
    const candidate = join(binDir, name);
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

function zenticCliShimNames(): string[] {
  return process.platform === "win32" ? ["zentic.cmd", "zentic.exe", "zentic"] : ["zentic"];
}
