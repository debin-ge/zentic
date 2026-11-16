import { z } from "zod";
import type { ProviderZenticToolsPolicy } from "@getzentic/protocol/provider-config";
import type { AgentManager } from "../agent-manager.js";
import { isZenticToolEnabled } from "../zentic-tool-policy.js";
import type { ZenticToolDefinition } from "./types.js";
import { addModelVisibleStructuredContent } from "./zentic-tool-serialization.js";

export function registerPluginTools(options: {
  agentManager: AgentManager;
  callerAgentId?: string;
  scope: "agent" | "top-level";
  tools: Map<string, ZenticToolDefinition>;
  builtinNames: Set<string>;
  policy?: ProviderZenticToolsPolicy;
}): void {
  const { agentManager, callerAgentId, scope, tools, builtinNames, policy } = options;
  if (scope !== "agent" || !callerAgentId) return;
  for (const tool of agentManager.getPluginTools(callerAgentId)) {
    if (builtinNames.has(tool.name)) {
      throw new Error(
        `Agent tool ${tool.name} from plugin ${tool.pluginId} collides with Zentic tool ${tool.name}`,
      );
    }
    if (!isZenticToolEnabled(policy, tool.name)) continue;
    tools.set(tool.name, {
      name: tool.name,
      title: tool.title,
      description: tool.description,
      inputSchema: z.fromJSONSchema(tool.inputSchema),
      async handler(input, { signal }) {
        const result = await agentManager.executePluginTool(tool, callerAgentId, input, signal);
        return addModelVisibleStructuredContent({
          content: result.text === undefined ? [] : [{ type: "text", text: result.text }],
          structuredContent: result.structuredContent,
          isError: result.isError,
        });
      },
    });
  }
}
