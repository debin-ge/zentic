import { mkdir, open, realpath, rename, stat, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import pLimit from "p-limit";
import { dirname, isAbsolute, join, resolve } from "path";
import { z } from "zod";

const MAX_WORKTREE_METADATA_BYTES = 64 * 1024;

const ChangeRequestLookupTargetSchema = z.object({
  headRef: z.string().min(1),
  headRepositoryOwner: z.string().min(1).optional(),
  changeRequestNumber: z.number().int().positive().optional(),
  localBranchName: z.string().min(1).optional(),
});

// baseRefName is the display name; baseRef is the checkout's current exact base
// ("refs/remotes/upstream/main"). baseRef is optional because worktrees written before it
// existed only have the name — there are no migrations, so readers fall back.
const ZenticWorktreeMetadataV1Schema = z.object({
  version: z.literal(1),
  baseRefName: z.string().min(1),
  baseRef: z.string().min(1).optional(),
  changeRequestLookupTarget: ChangeRequestLookupTargetSchema.optional(),
});

const ZenticWorktreeMetadataV2Schema = z.object({
  version: z.literal(2),
  baseRefName: z.string().min(1),
  baseRef: z.string().min(1).optional(),
  changeRequestLookupTarget: ChangeRequestLookupTargetSchema.optional(),
  firstAgentBranchAutoName: z
    .discriminatedUnion("status", [
      z.object({
        status: z.literal("pending"),
        placeholderBranchName: z.string().min(1),
      }),
      z.object({
        status: z.literal("attempted"),
        placeholderBranchName: z.string().min(1),
        attemptedAt: z.string().min(1),
      }),
    ])
    .optional(),
  runtime: z
    .object({
      worktreePort: z.number().int().positive(),
    })
    .optional(),
});

const ZenticWorktreeMetadataSchema = z.union([
  ZenticWorktreeMetadataV1Schema,
  ZenticWorktreeMetadataV2Schema,
]);

export type ZenticWorktreeMetadata = z.infer<typeof ZenticWorktreeMetadataSchema>;
export type ZenticWorktreeChangeRequestHint = z.infer<typeof ChangeRequestLookupTargetSchema>;

export function createZenticWorktreeChangeRequestHint(
  input: ZenticWorktreeChangeRequestHint,
): ZenticWorktreeChangeRequestHint {
  return ChangeRequestLookupTargetSchema.parse(input);
}

export function getZenticWorktreeChangeRequestHintForBranch(
  metadata: ZenticWorktreeMetadata | null,
  currentBranch: string,
): ZenticWorktreeChangeRequestHint | null {
  const target = metadata?.changeRequestLookupTarget;
  if (!target) {
    return null;
  }
  if (target.localBranchName) {
    return target.localBranchName === currentBranch ? target : null;
  }

  // COMPAT(change-request-local-branch): metadata before v0.2.5 omitted the
  // local binding; remove after 2027-07-31.
  const canonicalBranches = new Set<string>();
  if (target.headRepositoryOwner) {
    canonicalBranches.add(`${target.headRepositoryOwner}/${target.headRef}`);
    const normalizedOwner = normalizeLegacyGitHubOwnerForBranch(target.headRepositoryOwner);
    if (normalizedOwner) {
      canonicalBranches.add(`${normalizedOwner}/${target.headRef}`);
    }
  } else {
    canonicalBranches.add(target.headRef);
  }
  return canonicalBranches.has(currentBranch) ? target : null;
}

function normalizeLegacyGitHubOwnerForBranch(owner: string): string | null {
  const normalized = owner.trim().toLowerCase();
  return /^[a-z0-9-]+$/.test(normalized) ? normalized : null;
}

export async function rebindZenticWorktreeChangeRequestHint(
  worktreeRoot: string,
  previousBranch: string,
  currentBranch: string,
): Promise<boolean> {
  return mutateMetadata(worktreeRoot, async (root) => {
    const metadata = await readMetadataFile(root);
    const target = getZenticWorktreeChangeRequestHintForBranch(metadata, previousBranch);
    if (!metadata || !target) {
      return false;
    }

    await writeZenticWorktreeMetadataFile(root, {
      ...metadata,
      changeRequestLookupTarget: {
        ...target,
        ...(target.headRef === previousBranch &&
        !target.headRepositoryOwner &&
        target.changeRequestNumber === undefined
          ? { headRef: currentBranch }
          : {}),
        localBranchName: currentBranch,
      },
    });
    return true;
  });
}

export async function pinZenticWorktreeBranchIdentityIfMissing(
  worktreeRoot: string,
  branch: string,
): Promise<boolean> {
  return mutateMetadata(worktreeRoot, async (root) => {
    const metadata = await readMetadataFile(root);
    if (!metadata || metadata.changeRequestLookupTarget) {
      return false;
    }
    const target = createZenticWorktreeChangeRequestHint({
      headRef: branch,
      localBranchName: branch,
    });
    await writeZenticWorktreeMetadataFile(root, {
      ...metadata,
      changeRequestLookupTarget: target,
    });
    return true;
  });
}

async function getGitDirForWorktreeRoot(worktreeRoot: string): Promise<string> {
  const gitPath = join(worktreeRoot, ".git");
  let info;
  try {
    info = await stat(gitPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT")
      throw new Error(`Not a git repository: ${worktreeRoot}`, { cause: error });
    throw error;
  }
  if (info.isDirectory()) return gitPath;
  const gitFileContent = await readBoundedFile(gitPath);
  const match = gitFileContent.match(/gitdir:\s*(.+)/);
  if (match?.[1]) {
    const raw = match[1].trim();
    return isAbsolute(raw) ? raw : resolve(worktreeRoot, raw);
  }

  return gitPath;
}

export async function getZenticWorktreeMetadataPath(worktreeRoot: string): Promise<string> {
  const gitDir = await getGitDirForWorktreeRoot(worktreeRoot);
  return join(gitDir, "zentic", "worktree.json");
}

export function isQualifiedRef(ref: string): boolean {
  return ref.trim().startsWith("refs/");
}

const REMOTE_TRACKING_PREFIX = "refs/remotes/";

/**
 * The human-readable branch name behind a ref. Display and legacy identity only — it cannot
 * round-trip, so anything that has to resolve to a commit keeps the exact ref instead.
 *
 * refs/remotes/<remote>/<branch> works for any remote, not just origin. Git allows slashes in
 * remote names, so refs/remotes/a/b/c is ambiguous and the first segment is read as the
 * remote: slashes are everywhere in branch names and rare in remote names. A remote genuinely
 * named "team/upstream" therefore displays as "upstream/main" rather than "main"; the exact
 * ref is unaffected, which is why this is display-only.
 */
export function branchNameFromRef(ref: string): string {
  const trimmed = ref.trim();
  if (trimmed.startsWith("refs/heads/")) {
    return trimmed.slice("refs/heads/".length);
  }
  if (trimmed.startsWith(REMOTE_TRACKING_PREFIX)) {
    const remainder = trimmed.slice(REMOTE_TRACKING_PREFIX.length);
    const separator = remainder.indexOf("/");
    return separator === -1 ? remainder : remainder.slice(separator + 1);
  }
  // Short form. It cannot be generalized to any remote the way the qualified form can:
  // without the remote list, "feature/x" is indistinguishable from "<remote>/x".
  if (trimmed.startsWith("origin/")) {
    return trimmed.slice("origin/".length);
  }
  return trimmed;
}

export function normalizeBaseRefName(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error("Base branch is required");
  }
  return branchNameFromRef(trimmed);
}

function assertValidBaseRef(value: string): void {
  if (value === "HEAD") {
    throw new Error("Base branch cannot be HEAD");
  }
  if (value.includes("..") || value.includes("@{")) {
    throw new Error(`Invalid base branch: ${value}`);
  }
}

export async function writeZenticWorktreeMetadata(
  worktreeRoot: string,
  options: {
    baseRefName: string;
    baseRef?: string;
    changeRequestLookupTarget?: ZenticWorktreeChangeRequestHint;
  },
): Promise<void> {
  return mutateMetadata(worktreeRoot, async (root) => {
    const baseRefName = normalizeBaseRefName(options.baseRefName);
    assertValidBaseRef(baseRefName);
    const baseRef = options.baseRef?.trim();
    if (baseRef) {
      assertValidBaseRef(baseRef);
    }

    const metadata: ZenticWorktreeMetadata = {
      version: 1,
      baseRefName,
      ...(baseRef ? { baseRef } : {}),
      ...(options.changeRequestLookupTarget
        ? { changeRequestLookupTarget: options.changeRequestLookupTarget }
        : {}),
    };
    await writeZenticWorktreeMetadataFile(root, metadata);
  });
}

export async function setZenticWorktreeBaseRef(input: {
  worktreeRoot: string;
  baseRef: string;
}): Promise<void> {
  return mutateMetadata(input.worktreeRoot, async (root) => {
    const current = await readMetadataFile(root);
    if (!current) throw new Error("Cannot change base: missing worktree metadata");
    await writeZenticWorktreeMetadataFile(root, {
      ...current,
      baseRefName: branchNameFromRef(input.baseRef),
      baseRef: input.baseRef,
    });
  });
}

export async function writeZenticWorktreeRuntimeMetadata(
  worktreeRoot: string,
  options: { worktreePort: number },
): Promise<void> {
  return mutateMetadata(worktreeRoot, async (root) => {
    if (!Number.isInteger(options.worktreePort) || options.worktreePort <= 0) {
      throw new Error(`Invalid worktree runtime port: ${options.worktreePort}`);
    }

    const current = await readMetadataFile(root);
    if (!current) {
      throw new Error("Cannot persist worktree runtime metadata: missing base metadata");
    }

    const next: ZenticWorktreeMetadata = {
      ...current,
      version: 2,
      runtime: {
        worktreePort: options.worktreePort,
      },
    };
    await writeZenticWorktreeMetadataFile(root, next);
  });
}

export async function writeZenticWorktreeFirstAgentBranchAutoNameMetadata(
  worktreeRoot: string,
  options: { placeholderBranchName: string },
): Promise<void> {
  return mutateMetadata(worktreeRoot, async (root) => {
    const placeholderBranchName = options.placeholderBranchName.trim();
    if (!placeholderBranchName) {
      throw new Error("Placeholder branch name is required");
    }

    const current = await readMetadataFile(root);
    if (!current) {
      throw new Error(
        "Cannot persist first-agent branch auto-name metadata: missing base metadata",
      );
    }

    await writeZenticWorktreeMetadataFile(root, {
      ...current,
      version: 2,
      firstAgentBranchAutoName: {
        status: "pending",
        placeholderBranchName,
      },
    });
  });
}

export async function markZenticWorktreeFirstAgentBranchAutoNameAttempted(
  worktreeRoot: string,
  options: { attemptedAt?: string } = {},
): Promise<ZenticWorktreeMetadata | null> {
  return mutateMetadata(worktreeRoot, async (root) => {
    const current = await readMetadataFile(root);
    if (
      !current ||
      current.version !== 2 ||
      current.firstAgentBranchAutoName?.status !== "pending"
    ) {
      return current;
    }

    const next: ZenticWorktreeMetadata = {
      ...current,
      firstAgentBranchAutoName: {
        status: "attempted",
        placeholderBranchName: current.firstAgentBranchAutoName.placeholderBranchName,
        attemptedAt: options.attemptedAt ?? new Date().toISOString(),
      },
    };
    await writeZenticWorktreeMetadataFile(root, next);
    return next;
  });
}

export async function hasZenticWorktreeMetadata(worktreeRoot: string): Promise<boolean> {
  try {
    return (await readZenticWorktreeMetadata(worktreeRoot)) !== null;
  } catch {
    return false;
  }
}

/**
 * Filesystem-only search for a Zentic worktree root at or above cwd: the
 * first directory containing a .git entry wins, and it only counts when
 * its git admin dir holds the zentic/worktree.json marker. Lets callers
 * cheaply rule out plain directories before running git ownership checks.
 */
export async function findZenticWorktreeRootForCwd(cwd: string): Promise<string | null> {
  let current = resolve(cwd);
  for (;;) {
    if (
      await stat(join(current, ".git")).then(
        () => true,
        () => false,
      )
    ) {
      return (await hasZenticWorktreeMetadata(current)) ? current : null;
    }
    const parent = dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
}

export async function readZenticWorktreeMetadata(
  worktreeRoot: string,
): Promise<ZenticWorktreeMetadata | null> {
  const key = await resolveMetadataIdentity(worktreeRoot);
  await metadataMutations.get(key)?.catch(() => {});
  return metadataIo(() => readMetadataFile(key));
}

async function readMetadataFile(worktreeRoot: string): Promise<ZenticWorktreeMetadata | null> {
  const metadataPath = await getZenticWorktreeMetadataPath(worktreeRoot);
  try {
    return ZenticWorktreeMetadataSchema.parse(JSON.parse(await readBoundedFile(metadataPath)));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

// O_NONBLOCK lets us reject FIFOs by kind without hanging in open(). A fixed read also
// caps a regular file that grows between stat and read; readFile's whole-file loop does not.
async function readBoundedFile(path: string): Promise<string> {
  const file = await open(path, constants.O_RDONLY | constants.O_NONBLOCK);
  try {
    const info = await file.stat();
    const limit = MAX_WORKTREE_METADATA_BYTES;
    if (!info.isFile() || info.size > limit)
      throw new Error(`Invalid Zentic worktree metadata file: ${path}`);
    const buffer = Buffer.alloc(limit + 1);
    let length = 0;
    while (length < buffer.length) {
      const { bytesRead } = await file.read(buffer, length, buffer.length - length);
      if (bytesRead === 0) break;
      length += bytesRead;
    }
    if (length > limit) throw new Error(`Invalid Zentic worktree metadata file: ${path}`);
    return buffer.toString("utf8", 0, length);
  } finally {
    await file.close();
  }
}

export async function requireZenticWorktreeBaseRefName(worktreeRoot: string): Promise<string> {
  const metadataPath = await getZenticWorktreeMetadataPath(worktreeRoot);
  const metadata = await readZenticWorktreeMetadata(worktreeRoot);
  if (!metadata) {
    throw new Error(`Missing Zentic worktree base metadata: ${metadataPath}`);
  }
  return metadata.baseRefName;
}

export async function readZenticWorktreeRuntimePort(worktreeRoot: string): Promise<number | null> {
  const metadata = await readZenticWorktreeMetadata(worktreeRoot);
  if (!metadata) {
    return null;
  }
  if (metadata.version === 2 && metadata.runtime?.worktreePort) {
    return metadata.runtime.worktreePort;
  }
  return null;
}

async function writeZenticWorktreeMetadataFile(
  worktreeRoot: string,
  metadata: ZenticWorktreeMetadata,
): Promise<void> {
  const metadataPath = await getZenticWorktreeMetadataPath(worktreeRoot);
  const contents = `${JSON.stringify(metadata, null, 2)}\n`;
  if (Buffer.byteLength(contents) > MAX_WORKTREE_METADATA_BYTES) {
    throw new Error(`Invalid Zentic worktree metadata file: ${metadataPath}`);
  }
  // Never recreate an archived Git directory while a queued mutation is pending.
  try {
    await mkdir(join(await getGitDirForWorktreeRoot(worktreeRoot), "zentic"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }
  const tempPath = `${metadataPath}.${randomUUID()}.tmp`;
  await writeFile(tempPath, contents, "utf8");
  await rename(tempPath, metadataPath);
}

const metadataIo = pLimit(2);
const metadataMutations = new Map<string, Promise<unknown>>();

// Only share in-flight identity resolution: a replaced symlink must not retain an old owner.
const metadataIdentities = new Map<string, Promise<string>>();

function resolveMetadataIdentity(worktreeRoot: string): Promise<string> {
  const path = resolve(worktreeRoot);
  const existing = metadataIdentities.get(path);
  if (existing) return existing;
  const identity = metadataIo(async () => {
    try {
      return await realpath(path);
    } catch {
      return path;
    }
  }).finally(() => {
    if (metadataIdentities.get(path) === identity) metadataIdentities.delete(path);
  });
  metadataIdentities.set(path, identity);
  return identity;
}

async function mutateMetadata<T>(
  worktreeRoot: string,
  mutation: (root: string) => Promise<T>,
): Promise<T> {
  const key = await resolveMetadataIdentity(worktreeRoot);
  const previous = metadataMutations.get(key) ?? Promise.resolve();
  const pending = previous.catch(() => {}).then(() => metadataIo(() => mutation(key)));
  metadataMutations.set(key, pending);
  void pending
    .finally(() => {
      if (metadataMutations.get(key) === pending) metadataMutations.delete(key);
    })
    .catch(() => {});
  return pending;
}
