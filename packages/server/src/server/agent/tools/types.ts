import type { z } from "zod";
import type { ProviderZenticToolsPolicy } from "@getzentic/protocol/provider-config";

export class ZenticToolInputError extends Error {
  readonly status = 400;

  constructor(
    message: string,
    readonly issues?: z.ZodError["issues"],
  ) {
    super(message);
    this.name = "ZenticToolInputError";
  }
}

export interface ZenticToolExecutionContext {
  signal?: AbortSignal;
  sendUpdate?: (update: ZenticToolResult) => void;
}

export interface ZenticToolResult {
  content: Array<{ type: string; text?: string; [key: string]: unknown }>;
  structuredContent?: unknown;
  isError?: boolean;
}

export interface ZenticToolConfig {
  title?: string;
  description?: string;
  inputSchema?: z.ZodRawShape | z.ZodType;
  outputSchema?: z.ZodRawShape;
}

export interface ZenticToolDefinition extends ZenticToolConfig {
  name: string;
  description: string;
  handler: (input: unknown, context: ZenticToolExecutionContext) => Promise<ZenticToolResult>;
}

export interface ZenticToolCatalog {
  tools: ReadonlyMap<string, ZenticToolDefinition>;
  getTool(name: string): ZenticToolDefinition | undefined;
  executeTool(
    name: string,
    input: unknown,
    context?: ZenticToolExecutionContext,
  ): Promise<ZenticToolResult>;
}

export interface ZenticToolRuntimeContext {
  callerAgentId?: string;
  zenticToolPolicy?: ProviderZenticToolsPolicy;
  enableVoiceTools?: boolean;
  voiceOnly?: boolean;
}

export type ZenticToolCatalogFactory = (
  context: ZenticToolRuntimeContext,
) => ZenticToolCatalog | Promise<ZenticToolCatalog>;
