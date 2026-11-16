import type { ToolCallDetail } from "@getzentic/protocol/agent-types";
import { getZenticToolTargetAgentId } from "@getzentic/protocol/zentic-tool-presentation/index";
import { useSessionStore } from "@/stores/session-store";

/** Title of the agent a Zentic tool call acts on, when this host knows it. */
export function useTargetAgentTitle(input: {
  serverId: string | undefined;
  toolName: string;
  detail: ToolCallDetail | undefined;
}): string | undefined {
  const agentId = getZenticToolTargetAgentId(input.toolName, input.detail);
  const { serverId } = input;
  return useSessionStore((state) => {
    if (!serverId || !agentId) return undefined;
    const session = state.sessions[serverId];
    const agent = session?.agents.get(agentId) ?? session?.agentDetails.get(agentId);
    return agent?.title ?? undefined;
  });
}
