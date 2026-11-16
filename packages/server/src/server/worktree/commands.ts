import { basename } from "node:path";

import { isZenticOwnedWorktreeCwd } from "../../utils/worktree.js";
import {
  archiveByScope,
  resolveWorkspaceIdAtPath,
  type ArchiveDependencies,
  type ArchiveScope,
} from "../workspace-archive-service.js";
import type {
  CreateZenticWorktreeInput,
  CreateZenticWorktreeResult,
} from "../zentic-worktree-service.js";
import { toWorktreeWireError, type WorktreeWireError } from "../worktree-errors.js";
import type { WorkspaceGitService, WorkspaceGitWorktreeInfo } from "../workspace-git-service.js";

export interface ListZenticWorktreesCommandDependencies {
  workspaceGitService: Pick<WorkspaceGitService, "listWorktrees">;
}

export interface ListZenticWorktreesCommandInput {
  cwd: string;
  reason?: string;
}

export async function listZenticWorktreesCommand(
  dependencies: ListZenticWorktreesCommandDependencies,
  input: ListZenticWorktreesCommandInput,
): Promise<WorkspaceGitWorktreeInfo[]> {
  if (input.reason) {
    return dependencies.workspaceGitService.listWorktrees(input.cwd, { reason: input.reason });
  }
  return dependencies.workspaceGitService.listWorktrees(input.cwd);
}

type CreateZenticWorktreeWorkflow<Result extends CreateZenticWorktreeResult> = (
  input: CreateZenticWorktreeInput,
) => Promise<Result>;

export interface CreateZenticWorktreeCommandDependencies<
  Result extends CreateZenticWorktreeResult = CreateZenticWorktreeResult,
> {
  zenticHome?: string;
  worktreesRoot?: string;
  createZenticWorktreeWorkflow?: CreateZenticWorktreeWorkflow<Result>;
}

export type CreateZenticWorktreeCommandInput = Omit<CreateZenticWorktreeInput, "zenticHome"> & {
  zenticHome?: string;
  worktreesRoot?: string;
};

export type CreateZenticWorktreeCommandResult<Result extends CreateZenticWorktreeResult> =
  | {
      ok: true;
      createdWorktree: Result;
    }
  | {
      ok: false;
      error: WorktreeWireError;
      cause: unknown;
    };

export async function createZenticWorktreeCommand<Result extends CreateZenticWorktreeResult>(
  dependencies: CreateZenticWorktreeCommandDependencies<Result>,
  input: CreateZenticWorktreeCommandInput,
): Promise<CreateZenticWorktreeCommandResult<Result>> {
  try {
    if (!dependencies.createZenticWorktreeWorkflow) {
      throw new Error("Zentic worktree service is not configured");
    }

    const createdWorktree = await dependencies.createZenticWorktreeWorkflow({
      ...input,

      zenticHome: input.zenticHome ?? dependencies.zenticHome,
      worktreesRoot: input.worktreesRoot ?? dependencies.worktreesRoot,
    });
    return { ok: true, createdWorktree };
  } catch (error) {
    return {
      ok: false,
      error: toWorktreeWireError(error),
      cause: error,
    };
  }
}

export interface ArchiveCommandDependencies extends Omit<
  ArchiveDependencies,
  "workspaceGitService"
> {
  workspaceGitService: Pick<
    WorkspaceGitService,
    "getSnapshot" | "listWorktrees" | "invalidateWorktrees"
  >;
}

export interface ArchiveCommandInput {
  requestId: string;
  repoRoot?: string | null;
  worktreePath?: string;
  worktreeSlug?: string;
  branchName?: string;
  workspaceId?: string;
  scope?: ArchiveScope["kind"];
}

export type ArchiveCommandResult =
  | {
      ok: true;
      removedAgents: string[];
    }
  | {
      ok: false;
      code: "NOT_ALLOWED";
      message: string;
      removedAgents: [];
    };

export async function archiveCommand(
  dependencies: ArchiveCommandDependencies,
  input: ArchiveCommandInput,
): Promise<ArchiveCommandResult> {
  const targetPath = await resolveArchiveTarget(dependencies, input);
  const scope = input.scope ?? "workspace";
  const ownership = await isZenticOwnedWorktreeCwd(targetPath, {
    zenticHome: dependencies.zenticHome,
    worktreesRoot: dependencies.zenticWorktreesBaseRoot,
  });

  if (scope === "worktree") {
    if (!ownership.allowed) {
      return {
        ok: false,
        code: "NOT_ALLOWED",
        message: "Worktree is not a Zentic-owned worktree",
        removedAgents: [],
      };
    }

    const result = await archiveByScope(dependencies, {
      scope: { kind: "worktree", targetPath },
      requestId: input.requestId,
    });

    return {
      ok: true,
      removedAgents: result.archivedAgentIds,
    };
  }

  const workspaceId =
    input.workspaceId ?? (await resolveWorkspaceIdAtPath(dependencies, targetPath));

  if (!workspaceId) {
    dependencies.sessionLogger?.warn(
      { targetPath },
      "Could not resolve workspace for archive; skipping",
    );
    return {
      ok: true,
      removedAgents: [],
    };
  }

  const result = await archiveByScope(dependencies, {
    scope: { kind: "workspace", workspaceId },
    requestId: input.requestId,
  });

  return {
    ok: true,
    removedAgents: result.archivedAgentIds,
  };
}

async function resolveArchiveTarget(
  dependencies: ArchiveCommandDependencies,
  input: ArchiveCommandInput,
): Promise<string> {
  const repoRoot = input.repoRoot ?? null;
  if (input.worktreePath) {
    return input.worktreePath;
  }

  if (input.worktreeSlug) {
    if (!repoRoot) {
      throw new Error("repoRoot is required when worktreeSlug is supplied");
    }
    return resolveWorktreeSlugPath(dependencies, repoRoot, input.worktreeSlug);
  }

  if (repoRoot && input.branchName) {
    const worktrees = await dependencies.workspaceGitService.listWorktrees(repoRoot);
    const match = worktrees.find((entry) => entry.branchName === input.branchName);
    if (!match) {
      throw new Error(`Zentic worktree not found for branch ${input.branchName}`);
    }
    return match.path;
  }

  throw new Error("worktreePath, worktreeSlug, or repoRoot+branchName is required");
}

async function resolveWorktreeSlugPath(
  dependencies: ArchiveCommandDependencies,
  repoRoot: string,
  worktreeSlug: string,
): Promise<string> {
  // Worktrees can live anywhere (legacy root or wherever
  // a plugin placed them), so a slug resolves against the
  // discovered worktree list for the repo, never a guessed path.
  const worktrees = await dependencies.workspaceGitService.listWorktrees(repoRoot);
  const match = worktrees.find((entry) => basename(entry.path) === worktreeSlug);
  if (!match) {
    const found = worktrees.map((entry) => basename(entry.path));
    throw new Error(
      found.length > 0
        ? `Zentic worktree not found for slug ${worktreeSlug}: found ${found.join(", ")}`
        : `Zentic worktree not found for slug ${worktreeSlug}`,
    );
  }
  return match.path;
}
