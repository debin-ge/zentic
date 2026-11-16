import { z } from "zod";

const TCP_PORT_RANGE_PATTERN = /^(\d{1,5})-(\d{1,5})$/;

export const ZenticServicePortAllocationSchema = z
  .object({
    range: z.string().trim().regex(TCP_PORT_RANGE_PATTERN).optional(),
    portScript: z.string().trim().min(1).optional(),
  })
  .strict()
  .refine(
    (value) => value.range !== undefined || value.portScript !== undefined,
    "Expected range or portScript",
  )
  .refine((value) => {
    if (!value.range) return true;
    const match = TCP_PORT_RANGE_PATTERN.exec(value.range);
    if (!match) return false;
    const start = Number(match[1]);
    const end = Number(match[2]);
    return start >= 1 && end <= 65_535 && start <= end;
  }, "Expected an inclusive TCP port range from 1-65535");

export function normalizeLifecycleCommands(commands: unknown): string[] {
  if (typeof commands === "string") {
    return commands.trim().length > 0 ? [commands] : [];
  }
  if (!Array.isArray(commands)) {
    return [];
  }
  return commands.filter((command): command is string => {
    return typeof command === "string" && command.trim().length > 0;
  });
}

export const ZenticLifecycleCommandRawSchema = z.union([z.string(), z.array(z.string())]);

export const ZenticScriptEntryRawSchema = z
  .object({
    type: z.unknown().optional(),
    command: z.unknown().optional(),
    port: z.unknown().optional(),
  })
  .passthrough();

export const ZenticWorktreeConfigRawSchema = z
  .object({
    setup: ZenticLifecycleCommandRawSchema.optional(),
    teardown: ZenticLifecycleCommandRawSchema.optional(),
    terminals: z.unknown().optional(),
    servicePorts: ZenticServicePortAllocationSchema.optional(),
  })
  .passthrough();

export const ZenticMetadataGenerationEntrySchema = z
  .object({
    instructions: z.string().optional(),
  })
  .passthrough()
  .catch({});

export const ZenticMetadataGenerationSchema = z
  .object({
    title: ZenticMetadataGenerationEntrySchema.optional(),
    branchName: ZenticMetadataGenerationEntrySchema.optional(),
    commitMessage: ZenticMetadataGenerationEntrySchema.optional(),
    pullRequest: ZenticMetadataGenerationEntrySchema.optional(),
  })
  // COMPAT(projectMetadataAgentTitle): `agentTitle` project metadata prompts were removed
  // in v0.1.96; keep legacy zentic.json parseable until 2026-12-16.
  .passthrough()
  .catch({});

export const ZenticConfigRawSchema = z
  .object({
    worktree: ZenticWorktreeConfigRawSchema.optional(),
    scripts: z.record(z.string(), ZenticScriptEntryRawSchema).optional(),
    metadataGeneration: ZenticMetadataGenerationSchema.optional(),
  })
  .passthrough();

export const WorktreeConfigSchema = ZenticWorktreeConfigRawSchema.extend({
  setup: z.unknown().optional().transform(normalizeLifecycleCommands),
  teardown: z.unknown().optional().transform(normalizeLifecycleCommands),
})
  .passthrough()
  .catch({ setup: [], teardown: [] });

export const ScriptEntrySchema = ZenticScriptEntryRawSchema.catch({});

export const ZenticConfigSchema = ZenticConfigRawSchema.extend({
  worktree: WorktreeConfigSchema.optional(),
  scripts: z.record(z.string(), ScriptEntrySchema).optional().catch({}),
  metadataGeneration: ZenticMetadataGenerationSchema.optional(),
})
  .passthrough()
  .catch({});

export const ZenticConfigRevisionSchema = z.object({
  mtimeMs: z.number(),
  size: z.number(),
});

export const ProjectConfigRpcErrorSchema = z.discriminatedUnion("code", [
  z.object({ code: z.literal("project_not_found") }),
  z.object({ code: z.literal("invalid_project_config") }),
  z.object({
    code: z.literal("stale_project_config"),
    currentRevision: ZenticConfigRevisionSchema.nullable(),
  }),
  z.object({ code: z.literal("write_failed") }),
]);

export type ZenticScriptEntryRaw = z.infer<typeof ZenticScriptEntryRawSchema>;
export type ZenticMetadataGenerationEntry = z.infer<typeof ZenticMetadataGenerationEntrySchema>;
export type ZenticMetadataGeneration = z.infer<typeof ZenticMetadataGenerationSchema>;
export type ZenticServicePortAllocation = z.infer<typeof ZenticServicePortAllocationSchema>;
export type ZenticConfigRaw = z.infer<typeof ZenticConfigRawSchema>;
export type ZenticConfig = z.infer<typeof ZenticConfigSchema>;
export type ZenticConfigRevision = z.infer<typeof ZenticConfigRevisionSchema>;
export type ProjectConfigRpcError = z.infer<typeof ProjectConfigRpcErrorSchema>;
