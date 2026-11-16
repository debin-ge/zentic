import type {
  ZenticApi,
  ZenticAgent,
  ZenticAgentHandle,
  ZenticWorkspace,
  ZenticWorkspaceHandle,
  ZenticWorkspaceCreateOptions,
} from "@getzentic/client";
import type { ZenticTerminal, ZenticTerminalHandle } from "@getzentic/client";
import type { PluginProjectSnapshot } from "../contracts.js";
import type { AgentRef, ProjectRef, TerminalRef, WorkspaceRef } from "../refs.js";
import type { PluginSidebarViewProps } from "./contracts.js";

export interface PluginProjectHandle {
  readonly ref: ProjectRef;
  open(): void;
  createWorkspace(
    input?: Omit<ZenticWorkspaceCreateOptions, "source"> & {
      source?: ZenticWorkspaceCreateOptions["source"];
    },
  ): Promise<ZenticWorkspaceHandle>;
}
export interface PluginTerminalHandle extends ZenticTerminalHandle {
  focus(): void;
}
export interface PluginZenticApi extends ZenticApi {
  workspaces: Omit<ZenticApi["workspaces"], "ref"> & {
    ref(workspace: string | ZenticWorkspace | WorkspaceRef): ZenticWorkspaceHandle;
  };
  agents: Omit<ZenticApi["agents"], "ref"> & {
    ref(agent: string | ZenticAgent | AgentRef): ZenticAgentHandle;
  };
  projects: ZenticApi["projects"] & { ref(project: ProjectRef): PluginProjectHandle };
  terminals: Omit<ZenticApi["terminals"], "ref"> & {
    ref(terminal: TerminalRef): PluginTerminalHandle;
    ref(terminal: string | ZenticTerminal): ZenticTerminalHandle;
  };
}

/** Host adapter; the installation retains its single API identity across every surface. */
export function createPluginReferenceApi(input: {
  zentic: ZenticApi;
  resolveHost(hostId: string): ZenticApi;
  readProject(ref: ProjectRef): PluginProjectSnapshot | null;
  navigation: PluginSidebarViewProps["navigation"];
}): PluginZenticApi {
  const { zentic } = input;
  const workspaceRef = zentic.workspaces.ref;
  const agentRef = zentic.agents.ref;
  const terminalRef = zentic.terminals.ref;
  function refWorkspace(workspace: string | ZenticWorkspace | WorkspaceRef) {
    if (typeof workspace !== "string" && "hostId" in workspace)
      return input.resolveHost(workspace.hostId).workspaces.ref(workspace.id);
    return workspaceRef(workspace);
  }
  function refAgent(agent: string | ZenticAgent | AgentRef) {
    if (typeof agent !== "string" && "hostId" in agent)
      return input.resolveHost(agent.hostId).agents.ref(agent.id);
    return agentRef(agent);
  }
  function terminal(ref: TerminalRef): PluginTerminalHandle;
  function terminal(ref: string | ZenticTerminal): ZenticTerminalHandle;
  function terminal(ref: TerminalRef | string | ZenticTerminal): ZenticTerminalHandle {
    if (typeof ref !== "string" && "hostId" in ref) {
      const handle = input.resolveHost(ref.hostId).terminals.ref(ref.id);
      return Object.assign(handle, { focus: () => input.navigation.openTerminal(ref) });
    }
    return terminalRef(ref);
  }
  function project(ref: ProjectRef): PluginProjectHandle {
    return {
      ref,
      open: () => input.navigation.openProject(ref),
      async createWorkspace(options = {}) {
        const snapshot = input.readProject(ref);
        if (!snapshot) throw new Error("Project is no longer available");
        const source = options.source ?? { kind: "directory", path: snapshot.rootPath };
        return input.resolveHost(ref.hostId).workspaces.create({ ...options, source });
      },
    };
  }
  return Object.assign(zentic, {
    workspaces: Object.assign(zentic.workspaces, { ref: refWorkspace }),
    agents: Object.assign(zentic.agents, { ref: refAgent }),
    projects: Object.assign(zentic.projects, { ref: project }),
    terminals: Object.assign(zentic.terminals, { ref: terminal }),
  });
}
