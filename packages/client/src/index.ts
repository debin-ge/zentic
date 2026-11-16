import { workspaceLabelKey } from "@getzentic/protocol/workspace-labels";
export type { TerminalReplayEvent, TerminalStreamEvent } from "./terminal-stream-router.js";
import type { AgentAddress } from "@getzentic/protocol/addresses";
import { parentAddressLabels } from "@getzentic/protocol/agent-labels";
export type { AgentAddress } from "@getzentic/protocol/addresses";
import { createHostActions, type ZenticHostActions } from "./hosts/index.js";
export type { ZenticHostActions } from "./hosts/index.js";
export type { HostAdd, HostUpdate, HostSummary, HostDirectory } from "@getzentic/protocol/hosts";
import type { OwnedSubscription } from "./connection/index.js";
export type { OwnedSubscription, SubscriptionObserver } from "./connection/index.js";
import type { DaemonClientConfig } from "./daemon-client.js";
import type { AgentPermissionResponse, JsonValue } from "@getzentic/protocol/agent-types";
import type {
  AgentSnapshotPayload,
  CreationSnapshot,
  CreateAgentRequestMessage,
  FetchWorkspacesRequestMessage,
  FetchWorkspacesResponseMessage,
  GetProvidersSnapshotResponseMessage,
  ListAvailableProvidersResponse,
  ListCommandsResponse,
  ListProviderFeaturesRequestMessage,
  ListProviderFeaturesResponseMessage,
  ProviderControlsListRequestMessage,
  ProviderControlsListResponseMessage,
  ListProviderModelsResponseMessage,
  ProjectListRequestMessage,
  ProjectListResponseMessage,
  ListProviderModesResponseMessage,
  MutableDaemonConfig,
  MutableDaemonConfigPatch,
  ProviderDiagnosticResponseMessage,
  ProviderUsageListResponseMessage,
  ProjectPlacementPayload,
  WorkspaceProjectDescriptorPayload,
  RefreshProvidersSnapshotResponseMessage,
  SessionOutboundMessage,
  WorkspaceDescriptorPayload,
  WorkspaceCreateRequest,
} from "@getzentic/protocol/messages";
import { DaemonClient, type CreateAgentRequestOptions } from "./daemon-client.js";
import {
  createTerminalActions,
  type ZenticTerminalActions,
  type ZenticWorkspaceTerminalActions,
} from "./terminals/index.js";
export type {
  ZenticTerminal,
  ZenticTerminalActions,
  ZenticTerminalHandle,
  ZenticTerminalCreateOptions,
  ZenticTerminalListOptions,
  ZenticTerminalListResult,
  ZenticTerminalCaptureOptions,
  ZenticTerminalCaptureResult,
  ZenticWorkspaceTerminalActions,
} from "./terminals/index.js";
import type { PluginTimelineItem } from "@getzentic/protocol/agent-types";
import type {
  AgentBackgroundWorkItem,
  FetchAgentsEntry,
  FetchAgentsOptions,
  FetchAgentsPageInfo,
  FetchAgentTimelineCursor,
  FetchAgentTimelineDirection,
  FetchAgentTimelinePayload,
  FetchAgentTimelineProjection,
  SendMessageOptions,
  WaitForFinishResult,
} from "./daemon-client.js";

/**
 * Coding turns routinely run for minutes, so the handle waits far longer than
 * the transport's own conservative default.
 */
const DEFAULT_WAIT_FOR_FINISH_MS = 10 * 60_000;

export type ConnectionState =
  | { status: "idle" }
  | { status: "connecting"; attempt: number }
  | { status: "connected" }
  | { status: "disconnected"; reason?: string }
  | { status: "disposed" };

export interface ZenticLogger {
  debug(obj: object, msg?: string): void;
  info(obj: object, msg?: string): void;
  warn(obj: object, msg?: string): void;
  error(obj: object, msg?: string): void;
}

export interface ZenticClientConfig {
  capabilities?: DaemonClientConfig["capabilities"];
  url: string;
  clientId?: string;
  appVersion?: string;
  runtimeGeneration?: number | null;
  password?: string;
  authHeader?: string;
  suppressSendErrors?: boolean;
  logger?: ZenticLogger;
  connectTimeoutMs?: number;
  e2ee?: {
    enabled?: boolean;
    daemonPublicKeyB64?: string;
  };
  reconnect?: {
    enabled?: boolean;
    baseDelayMs?: number;
    maxDelayMs?: number;
  };
  runtimeMetricsIntervalMs?: number;
  runtimeMetricsWindowMs?: number;
}

export type ZenticWorkspace = WorkspaceDescriptorPayload;
export type ZenticAgent = AgentSnapshotPayload;
export type ZenticAgentListOptions = FetchAgentsOptions;
export type ZenticProject = WorkspaceProjectDescriptorPayload;
export type ZenticProjectListOptions = Omit<ProjectListRequestMessage, "type" | "requestId"> & {
  requestId?: string;
};
export type ZenticProjectListResult = ProjectListResponseMessage["payload"];
export type ZenticProjectUpdate = Extract<
  SessionOutboundMessage,
  { type: "project.update" }
>["payload"];
export type ZenticProjectUpdateHandler = (update: ZenticProjectUpdate) => void;

export interface ZenticAgentListResult {
  subscription?: OwnedSubscription<ZenticAgentListResult>;
  requestId: string;
  subscriptionId?: string | null;
  entries: FetchAgentsEntry[];
  pageInfo: FetchAgentsPageInfo;
}
export type ZenticWorkspaceListOptions = Omit<
  FetchWorkspacesRequestMessage,
  "type" | "requestId"
> & {
  requestId?: string;
};

export interface ZenticWorkspaceListResult {
  subscription?: OwnedSubscription<ZenticWorkspaceListResult>;
  requestId: string;
  subscriptionId?: string | null;
  entries: ZenticWorkspace[];
  pageInfo: FetchWorkspacesResponseMessage["payload"]["pageInfo"];
}

export interface ZenticWorkspaceOpenOptions {
  cwd: string;
  requestId?: string;
}

export type ZenticWorkspaceCreateOptions = Omit<
  WorkspaceCreateRequest,
  "type" | "requestId" | "agent" | "subscribe"
> & {
  requestId?: string;
  agent?: Omit<
    ZenticAgentCreateOptions,
    "worktree" | "git" | "onEvent" | "idempotencyKey" | "requestId"
  >;
  onEvent?: (snapshot: CreationSnapshot) => void;
};

export interface ZenticWorkspaceArchiveResult {
  requestId: string;
  workspaceId: string;
  archivedAt: string | null;
  error: string | null;
}

export type ZenticWorkspaceUpdate = Extract<
  SessionOutboundMessage,
  { type: "workspace_update" }
>["payload"];

export type ZenticWorkspaceUpdateHandler = (update: ZenticWorkspaceUpdate) => void;

export interface ZenticWorkspaceHandle {
  readonly id: string;
  readonly projectId: string | null;
  readonly directory: string | null;
  readonly name: string | null;
  readonly status: ZenticWorkspace["status"] | null;
  /** Data plugins stored on the workspace. Zentic never reads a key. */
  readonly metadata: NonNullable<ZenticWorkspace["metadata"]> | null;
  readonly agents: {
    create(options: ZenticWorkspaceAgentCreateOptions): Promise<ZenticAgentHandle>;
  };
  readonly terminals: ZenticWorkspaceTerminalActions;
  current(): ZenticWorkspace | null;
  refresh(options?: { requestId?: string }): Promise<ZenticWorkspace | null>;
  setTitle(title: string | null, requestId?: string): Promise<{ title: string | null }>;
  /** Top-level keys replace; `null` removes the key. Needs a host with `entityMetadata`. */
  setMetadata(patch: Record<string, JsonValue>): Promise<void>;
  setPinned(pinned: boolean): Promise<{ pinnedAt: string | null }>;
  setLabel(name: string, options: { assigned: boolean }): Promise<{ labels: string[] }>;
  setBaseBranch(options: {
    baseRef: string;
    requestId?: string;
  }): Promise<{ baseRef: string | null }>;
  archive(requestId?: string): Promise<ZenticWorkspaceArchiveResult>;
  /**
   * Subscribes to already-emitted daemon workspace_update events for this id.
   * This returns a local unsubscribe function; it does not own app cache state or
   * send a daemon unsubscribe RPC. Call `workspaces.list({ subscribe: {} })` when
   * the daemon should start streaming workspace directory updates.
   */
  subscribe(handler: (update: ZenticWorkspaceUpdate) => void): () => void;
}

export interface ZenticProjectActions {
  list(options?: ZenticProjectListOptions): Promise<ZenticProjectListResult>;
  subscribe(handler: ZenticProjectUpdateHandler): () => void;
}

export interface ZenticWorkspaceActions {
  list(options: ZenticWorkspaceListOptions & { subscribe: {} }): Promise<
    ZenticWorkspaceListResult & {
      subscriptionId: string;
      subscription: OwnedSubscription<ZenticWorkspaceListResult>;
    }
  >;
  list(options?: ZenticWorkspaceListOptions): Promise<ZenticWorkspaceListResult>;
  ref(workspace: string | ZenticWorkspace): ZenticWorkspaceHandle;
  open(
    input: string | ZenticWorkspaceOpenOptions,
    requestId?: string,
  ): Promise<ZenticWorkspaceHandle>;
  create(options: ZenticWorkspaceCreateOptions): Promise<ZenticWorkspaceHandle>;
  archive(
    workspace: string | ZenticWorkspaceHandle,
    requestId?: string,
  ): Promise<ZenticWorkspaceArchiveResult>;
  /**
   * Local event subscription over the low-level driver's workspace_update stream.
   * The returned function only removes this SDK listener.
   */
  subscribe(handler: ZenticWorkspaceUpdateHandler): () => void;
}

type ZenticAgentSessionConfig = CreateAgentRequestMessage["config"];
export type ZenticAgentProvider = ZenticAgentSessionConfig["provider"];

export type ZenticProviderFeatureValues = Record<string, unknown>;

export interface ZenticAgentConfig {
  /** Provider and model in `provider/model` format. */
  provider: string;
  modeId?: ZenticAgentSessionConfig["modeId"];
  thinkingOptionId?: ZenticAgentSessionConfig["thinkingOptionId"];
  /** @deprecated Put these in `options`; they are folded into it on send. */
  featureValues?: ZenticProviderFeatureValues;
  /**
   * JSON-safe provider settings, validated by the selected provider. They include the settings the
   * provider offers a composer control for, such as `service_tier` or `fast_mode`.
   */
  options?: ZenticAgentSessionConfig["providerOptions"];
  systemPrompt?: ZenticAgentSessionConfig["systemPrompt"];
  toolPolicy?: ZenticAgentSessionConfig["toolPolicy"];
  mcpServers?: ZenticAgentSessionConfig["mcpServers"];
}

export interface ZenticAgentCreateOptions {
  idempotencyKey?: string;
  agentId?: string;
  onEvent?: (snapshot: CreationSnapshot) => void;
  config: ZenticAgentConfig;
  cwd: string;
  parent?: string | AgentAddress | ZenticAgentHandle;
  title?: ZenticAgentSessionConfig["title"];
  env?: CreateAgentRequestMessage["env"];
  prompt?: string;
  clientMessageId?: string;
  outputSchema?: Record<string, unknown>;
  images?: CreateAgentRequestMessage["images"];
  attachments?: CreateAgentRequestMessage["attachments"];
  git?: CreateAgentRequestMessage["git"];
  worktree?: CreateAgentRequestMessage["worktree"];
  autoArchive?: CreateAgentRequestMessage["autoArchive"];
  /**
   * Creates a background agent: hidden from default lists, tabs, the parent's subagent track
   * and notifications, and still addressable by id. A workspace this call creates is
   * background too. With a parent and no value, the parent's own background applies.
   */
  background?: CreateAgentRequestMessage["background"];
  requestId?: string;
  labels?: Record<string, string>;
  /** Data plugins store on the agent: JSON values under keys such as `"linear.issue"`. */
  metadata?: CreateAgentRequestMessage["metadata"];
}

export type ZenticWorkspaceAgentCreateOptions = Omit<ZenticAgentCreateOptions, "cwd">;

export interface ZenticAgentRefetchResult {
  agent: ZenticAgent;
  project: ProjectPlacementPayload | null;
}

export interface ZenticAgentTimelineRefetchOptions {
  direction?: FetchAgentTimelineDirection;
  cursor?: FetchAgentTimelineCursor;
  limit?: number;
  projection?: FetchAgentTimelineProjection;
  /**
   * Extends a `tail` or `before` page back to the start of the oldest turn it touches, so
   * `{ direction: "tail", limit: 1, wholeTurns: true }` returns the latest turn.
   */
  wholeTurns?: boolean;
  requestId?: string;
}

export type ZenticAgentSendOptions = SendMessageOptions;

export interface ZenticAgentRunOptions extends ZenticAgentSendOptions {
  timeoutMs?: number;
}

export type ZenticAgentRunResult = WaitForFinishResult;
export type ZenticAgentPermissionResponse = AgentPermissionResponse;

export interface ZenticAgentRespondToPermissionOptions {
  requestId: string;
  response: ZenticAgentPermissionResponse;
}

export interface ZenticAgentCommandsOptions {
  requestId?: string;
}

export type ZenticAgentCommandsResult = ListCommandsResponse["payload"];

export type ZenticAgentUpdate = Extract<
  SessionOutboundMessage,
  { type: "agent_update" }
>["payload"];

export type ZenticAgentStream = Extract<
  SessionOutboundMessage,
  { type: "agent_stream" }
>["payload"];

export type ZenticAgentUpdateHandler = (update: ZenticAgentUpdate) => void;

export type ZenticAgentTimelineEvent =
  | ZenticAgentStream
  | {
      agentId: string;
      event: { type: "replacement"; epoch: string };
    }
  | {
      agentId: string;
      subscriptionId: string;
      event: { type: "subscription_restored" };
    }
  | { agentId: string; event: { type: "error"; error: string } };

export type ZenticAgentTimelineSubscription = ReturnType<DaemonClient["subscribeAgentTimeline"]>;

export interface ZenticAgentTimelineHandle {
  append(item: Omit<PluginTimelineItem, "pluginId">): Promise<{ seq: number; epoch: string }>;
  /**
   * Fetches a fresh timeline page through the existing daemon RPC. If the daemon
   * includes an agent snapshot in the response, the parent handle is updated to
   * that value.
   */
  refetch(options?: ZenticAgentTimelineRefetchOptions): Promise<FetchAgentTimelinePayload>;
  /**
   * Delivers live events only. After reconnect, subscription_restored precedes
   * subsequent updates. History may have been missed; use refetch() to request
   * the range you need. No history is fetched automatically. A replacement event
   * invalidates the previous epoch. Subscription errors release this observation.
   * Await the returned unsubscribe function's `ready` promise before starting
   * work that must be observed. It rejects if establishment fails.
   */
  subscribe(handler: (event: ZenticAgentTimelineEvent) => void): ZenticAgentTimelineSubscription;
}

export type ZenticAgentBackgroundWorkItem = AgentBackgroundWorkItem;

export interface ZenticAgentBackgroundWorkHandle {
  /** Stop one item and wait for provider confirmation. */
  stop(
    item: ZenticAgentBackgroundWorkItem,
    options?: { requestId?: string; timeout?: number },
  ): Promise<void>;
  /** Reads the agent's current background work once. */
  list(options?: {
    requestId?: string;
    timeout?: number;
  }): Promise<ZenticAgentBackgroundWorkItem[]>;
  /**
   * Calls `listener` with the agent's current list once the subscription is established, again
   * after each reconnect, then with the full list each time it changes. Returns the unsubscribe
   * function.
   *
   * When reading the current list fails, `options.onError` receives the error and `listener` is
   * not called; without `onError` the error is logged. The read is not retried: the next
   * reconnect reads the list again.
   */
  subscribe(
    listener: (items: ZenticAgentBackgroundWorkItem[]) => void,
    options?: ZenticAgentBackgroundWorkSubscribeOptions,
  ): () => void;
}

export interface ZenticAgentBackgroundWorkSubscribeOptions {
  /** Receives the error when reading the agent's current list fails. */
  onError?: (error: unknown) => void;
}

export interface ZenticAgentHandle {
  readonly id: string;
  readonly address: AgentAddress;
  /**
   * `workspaceId` through `archivedAt` mirror the last snapshot this handle
   * observed. A handle from `ref()` reads `null` for all of them until
   * `refresh()`, `run()`, `waitForFinish()`, a timeline refetch, or
   * `subscribe()` delivers a snapshot. Optional snapshot values also read as
   * `null`; use `current()` when you need to distinguish those states.
   */
  readonly workspaceId: string | null;
  readonly cwd: string | null;
  readonly status: ZenticAgent["status"] | null;
  readonly capabilities: ZenticAgent["capabilities"] | null;
  readonly availableModes: ZenticAgent["availableModes"] | null;
  readonly pendingPermissions: ZenticAgent["pendingPermissions"] | null;
  readonly activeTurn: NonNullable<ZenticAgent["activeTurn"]> | null;
  readonly lastUsage: NonNullable<ZenticAgent["lastUsage"]> | null;
  readonly lastError: NonNullable<ZenticAgent["lastError"]> | null;
  /** @deprecated Use `controls` and `options`. */
  readonly features: NonNullable<ZenticAgent["features"]> | null;
  /** The provider options the agent runs with: `config.json` defaults merged with its own. */
  readonly options: NonNullable<ZenticAgent["options"]> | null;
  /** How the provider wants its options drawn. Controls hold no value; read `options`. */
  readonly controls: NonNullable<ZenticAgent["controls"]> | null;
  /** Data plugins stored on the agent. Zentic never reads a key. */
  readonly metadata: NonNullable<ZenticAgent["metadata"]> | null;
  readonly runtimeInfo: NonNullable<ZenticAgent["runtimeInfo"]> | null;
  readonly archivedAt: NonNullable<ZenticAgent["archivedAt"]> | null;
  readonly timeline: ZenticAgentTimelineHandle;
  readonly backgroundWork: ZenticAgentBackgroundWorkHandle;
  current(): ZenticAgent | null;
  refresh(requestId?: string): Promise<ZenticAgentRefetchResult | null>;
  /**
   * Reopens the provider session with current configuration, rerunning session-open hooks.
   * Interrupts a running turn and returns the refreshed snapshot.
   */
  reload(options?: { requestId?: string }): Promise<ZenticAgentRefetchResult | null>;
  send(text: string, options?: ZenticAgentSendOptions): Promise<void>;
  respondToPermission(options: ZenticAgentRespondToPermissionOptions): Promise<void>;
  /**
   * Changes the agent's own options: top-level keys replace, `null` removes the key so the
   * `config.json` default (or the provider's own default) applies again. Resolves once the
   * provider has applied the patch; a provider that cannot apply a key live rejects it.
   */
  setOptions(patch: Record<string, unknown>): Promise<void>;
  /** Top-level keys replace; `null` removes the key. Needs a host with `entityMetadata`. */
  setMetadata(patch: Record<string, JsonValue>): Promise<void>;
  /** Sends a prompt and resolves when that turn finishes or needs attention. */
  run(text: string, options?: ZenticAgentRunOptions): Promise<ZenticAgentRunResult>;
  /** Waits for the current turn, including one started with `prompt`. */
  waitForFinish(timeoutMs?: number): Promise<ZenticAgentRunResult>;
  /**
   * Asks the running session for the slash commands and skills it actually
   * loaded. Providers answer from the live session, so this sees built-in and
   * bundled entries that no directory scan can find. The payload carries its own
   * `error` string; a provider that cannot answer reports it there rather than
   * rejecting.
   */
  commands(options?: ZenticAgentCommandsOptions): Promise<ZenticAgentCommandsResult>;
  archive(): Promise<{ archivedAt: string }>;
  detach(): Promise<void>;
  subscribe(handler: (update: ZenticAgentUpdate) => void): () => void;
}

export interface ZenticAgentActions {
  list(options: ZenticAgentListOptions & { subscribe: {} }): Promise<
    ZenticAgentListResult & {
      subscriptionId: string;
      subscription: OwnedSubscription<ZenticAgentListResult>;
    }
  >;
  list(options?: ZenticAgentListOptions): Promise<ZenticAgentListResult>;
  ref(agent: string | ZenticAgent): ZenticAgentHandle;
  create(options: ZenticAgentCreateOptions): Promise<ZenticAgentHandle>;
  /**
   * Local event subscription over the low-level driver's agent_update stream.
   * The returned function only removes this SDK listener.
   */
  subscribe(handler: ZenticAgentUpdateHandler): () => void;
}

export type ZenticProviderModelsResult = ListProviderModelsResponseMessage["payload"];
export type ZenticProviderModesResult = ListProviderModesResponseMessage["payload"];
type ZenticProviderControlsDraft = ProviderControlsListRequestMessage["draftConfig"];
export interface ZenticProviderControlsInput extends Omit<
  ZenticProviderControlsDraft,
  "provider" | "model"
> {
  /** Provider and model in `provider/model` format. */
  provider: string;
}
export type ZenticProviderControlsResult = ProviderControlsListResponseMessage["payload"];
/** @deprecated Use `ZenticProviderControlsInput`. */
export type ZenticProviderFeaturesInput = Omit<
  ListProviderFeaturesRequestMessage["draftConfig"],
  "provider" | "model"
> & { provider: string };
/** @deprecated Use `ZenticProviderControlsResult`. */
export type ZenticProviderFeaturesResult = ListProviderFeaturesResponseMessage["payload"];
export type ZenticProviderAvailabilityResult = ListAvailableProvidersResponse["payload"];
export type ZenticProviderSnapshotResult = GetProvidersSnapshotResponseMessage["payload"];
export type ZenticProviderSnapshotUpdate = Extract<
  SessionOutboundMessage,
  { type: "providers_snapshot_update" }
>["payload"];
export type ZenticProviderRefreshResult = RefreshProvidersSnapshotResponseMessage["payload"];
export type ZenticProviderDiagnosticResult = ProviderDiagnosticResponseMessage["payload"];
export type ZenticProviderUsageResult = ProviderUsageListResponseMessage["payload"];
export interface ZenticProviderUsageOptions {
  requestId?: string;
}

export interface ZenticProviderListOptions {
  cwd?: string;
  requestId?: string;
}

export interface ZenticProviderRefreshOptions {
  cwd?: string;
  providers?: ZenticAgentProvider[];
  requestId?: string;
}

export interface ZenticProviderWaitOptions extends ZenticProviderListOptions {
  timeoutMs?: number;
}

export interface ZenticProviderActions {
  listModels(
    provider: ZenticAgentProvider,
    options?: ZenticProviderListOptions,
  ): Promise<ZenticProviderModelsResult>;
  listModes(
    provider: ZenticAgentProvider,
    options?: ZenticProviderListOptions,
  ): Promise<ZenticProviderModesResult>;
  /**
   * The controls a draft agent would show and the options it would run with, resolved by the
   * daemon from `config.json` defaults and the draft's own `providerOptions`.
   */
  listControls(
    draftConfig: ZenticProviderControlsInput,
    options?: { requestId?: string },
  ): Promise<ZenticProviderControlsResult>;
  /** @deprecated Use `listControls`. */
  listFeatures(
    draftConfig: ZenticProviderFeaturesInput,
    options?: { requestId?: string },
  ): Promise<ZenticProviderFeaturesResult>;
  listAvailable(options?: { requestId?: string }): Promise<ZenticProviderAvailabilityResult>;
  snapshot(options?: ZenticProviderListOptions): Promise<ZenticProviderSnapshotResult>;
  /** Resolves after the daemon's lazy provider discovery has finished. */
  waitForReady(options?: ZenticProviderWaitOptions): Promise<ZenticProviderSnapshotResult>;
  refresh(options?: ZenticProviderRefreshOptions): Promise<ZenticProviderRefreshResult>;
  diagnostic(
    provider: ZenticAgentProvider,
    options?: { requestId?: string },
  ): Promise<ZenticProviderDiagnosticResult>;
  listUsage(options?: ZenticProviderUsageOptions): Promise<ZenticProviderUsageResult>;
  subscribe(handler: (update: ZenticProviderSnapshotUpdate) => void): () => void;
}

export interface ZenticConfigActions {
  /**
   * Reads daemon config through the existing config RPC. Provider profiles,
   * custom provider entries, keys/env, custom binaries, and provider enablement
   * are currently config-file-shaped daemon state, so the SDK exposes this raw
   * typed surface instead of pretending there are higher-level provider-settings
   * RPCs.
   */
  get(requestId?: string): Promise<{ requestId: string; config: MutableDaemonConfig }>;
  /**
   * Patches daemon config through the existing config RPC. The daemon validates
   * and persists supported fields; unsupported provider/settings workflows remain
   * daemon gaps until first-class RPCs exist.
   */
  patch(
    config: MutableDaemonConfigPatch,
    requestId?: string,
  ): Promise<{ requestId: string; config: MutableDaemonConfig }>;
}

export interface ZenticApi {
  readonly hosts: ZenticHostActions;
  dispose(): Promise<void>;
  observeEvents: DaemonClient["observeEvents"];
  readonly terminals: ZenticTerminalActions;
  readonly workspaces: ZenticWorkspaceActions;
  readonly projects: ZenticProjectActions;
  readonly agents: ZenticAgentActions;
  readonly providers: ZenticProviderActions;
  readonly config: ZenticConfigActions;
}

export interface ZenticClient extends ZenticApi {
  connect(): Promise<void>;
  close(): Promise<void>;
  ensureConnected(): void;
  getConnectionState(): ConnectionState;
}

export function createZenticClient(config: ZenticClientConfig): ZenticClient {
  const daemonClient = new DaemonClient({
    ...config,
    clientId: config.clientId ?? createGeneratedClientId(),
    clientType: "cli",
  });
  const api = createZenticApi(daemonClient);
  return {
    ...api,
    connect: () => daemonClient.connect(),
    close: async () => {
      try {
        await api.dispose();
      } finally {
        await daemonClient.close();
      }
    },
    ensureConnected: () => daemonClient.ensureConnected(),
    getConnectionState: () => daemonClient.getConnectionState(),
  };
}

function toDaemonAgentCreateOptions(
  options: ZenticAgentCreateOptions,
  placement?: { workspaceId: string; cwd: string },
  serverId?: string,
): CreateAgentRequestOptions {
  const { config: agentConfig, cwd, parent, title, prompt, ...requestOptions } = options;
  const {
    provider: providerModel,
    options: ownOptions,
    featureValues,
    ...runtimeConfig
  } = agentConfig;
  // COMPAT(featureValues): added in v0.15.0, remove after 2027-05-01. An explicit option wins.
  const providerOptions = featureValues ? { ...featureValues, ...ownOptions } : ownOptions;
  const { provider, model } = parseProviderModel(providerModel);
  const relationship = parent ? encodeParent(parent, serverId) : {};
  return {
    ...requestOptions,
    config: {
      ...runtimeConfig,
      provider,
      model,
      cwd: placement?.cwd ?? cwd,
      ...(title !== undefined ? { title } : {}),
      ...(providerOptions !== undefined ? { providerOptions } : {}),
    },
    ...(placement ? { workspaceId: placement.workspaceId } : {}),
    ...(parent
      ? {
          ...relationship,
          labels: { ...requestOptions.labels, ...relationship.labels },
        }
      : {}),
    ...(prompt !== undefined ? { initialPrompt: prompt } : {}),
  };
}

export function createZenticApi(
  daemonClient: DaemonClient,
  scopeOptions?: { signal?: AbortSignal },
): ZenticApi {
  const handles = new Set<{ release(): Promise<void> }>();
  const agentListeners = new Set<ZenticAgentUpdateHandler>();
  const workspaceListeners = new Set<ZenticWorkspaceUpdateHandler>();
  const lifetime = new AbortController();
  const own = <T extends { release(): Promise<void> }>(create: () => T): T => {
    if (lifetime.signal.aborted) throw new Error("Zentic API is disposed");
    const handle = create();
    handles.add(handle);
    const release = handle.release.bind(handle);
    handle.release = async () => {
      await release();
      handles.delete(handle);
    };
    return handle;
  };
  const listenAgents = (handler: ZenticAgentUpdateHandler) => {
    if (lifetime.signal.aborted) throw new Error("Zentic API is disposed");
    agentListeners.add(handler);
    return () => {
      agentListeners.delete(handler);
    };
  };
  const listenWorkspaces = (handler: ZenticWorkspaceUpdateHandler) => {
    if (lifetime.signal.aborted) throw new Error("Zentic API is disposed");
    workspaceListeners.add(handler);
    return () => {
      workspaceListeners.delete(handler);
    };
  };
  const createAgentHandle = createAgentHandleFactory(
    daemonClient,
    listenAgents,
    (agentId, handler) => own(() => daemonClient.subscribeAgentTimeline(agentId, handler)),
    () => own(() => daemonClient.observeAgentBackgroundWork()),
  );
  const createAgent = async (
    options: ZenticAgentCreateOptions,
    placement?: { workspaceId: string; cwd: string },
  ) => {
    const serverId = daemonClient.getLastServerInfoMessage()?.serverId;
    const foreignParent =
      options.background === undefined ? foreignParentHandle(options.parent, serverId) : null;
    const resolved = foreignParent
      ? await inheritParentBackground(options, foreignParent)
      : options;
    const agent = await daemonClient.createAgent(
      toDaemonAgentCreateOptions(resolved, placement, serverId),
    );
    return createAgentHandle(agent);
  };
  const terminals = createTerminalActions(daemonClient, async (workspaceId) => {
    const workspace = await createWorkspaceHandle(workspaceId).refresh();
    if (!workspace?.workspaceDirectory) {
      throw new Error(`Workspace ${workspaceId} is not active or has no available directory`);
    }
    return workspace.workspaceDirectory;
  });
  const createWorkspaceHandle = createWorkspaceHandleFactory(
    daemonClient,
    createAgent,
    terminals,
    listenWorkspaces,
  );

  let disposal: Promise<void> | null = null;
  const dispose = (): Promise<void> => {
    if (disposal) return disposal;
    lifetime.abort();
    scopeOptions?.signal?.removeEventListener("abort", abort);
    agentListeners.clear();
    workspaceListeners.clear();
    disposal = Promise.allSettled([...handles].map((handle) => handle.release())).then(
      (results) => {
        handles.clear();
        const failures = results.flatMap((result) =>
          result.status === "rejected" ? [result.reason] : [],
        );
        if (failures.length)
          throw new AggregateError(failures, "Failed to release API subscriptions");
        return undefined;
      },
    );
    return disposal;
  };
  const abort = () => {
    void dispose().catch((error) => console.error("API subscription cleanup failed", error));
  };
  if (scopeOptions?.signal?.aborted) abort();
  else scopeOptions?.signal?.addEventListener("abort", abort, { once: true });

  const observeEvents: DaemonClient["observeEvents"] = (events, options) =>
    own(() => daemonClient.observeEvents(events, options));

  const subscribeEvent = (
    event: "project.update" | "providers_snapshot_update",
    update: (message: SessionOutboundMessage) => void,
  ): (() => void) => {
    const observation = observeEvents([event]);
    observation.subscribe({ snapshot: () => {}, update });
    return () => {
      void observation
        .release()
        .catch((error) => console.error("Event subscription cleanup failed", error));
    };
  };

  function listWorkspaces(options: ZenticWorkspaceListOptions & { subscribe: {} }): Promise<
    ZenticWorkspaceListResult & {
      subscriptionId: string;
      subscription: OwnedSubscription<ZenticWorkspaceListResult>;
    }
  >;
  function listWorkspaces(options?: ZenticWorkspaceListOptions): Promise<ZenticWorkspaceListResult>;
  async function listWorkspaces(
    options?: ZenticWorkspaceListOptions,
  ): Promise<ZenticWorkspaceListResult> {
    if (!options?.subscribe) return daemonClient.fetchWorkspaces(options);
    if (options.subscribe.subscriptionId !== undefined)
      throw new Error("Subscription IDs are assigned by the host");
    const subscription = own(() => daemonClient.observeWorkspaces(options));
    subscription.subscribe({
      snapshot: () => {},
      update: (message) => {
        if (message.type === "workspace_update")
          for (const listener of workspaceListeners) listener(message.payload);
      },
    });
    return { ...(await subscription.ready), subscription };
  }

  function listAgents(options: ZenticAgentListOptions & { subscribe: {} }): Promise<
    ZenticAgentListResult & {
      subscriptionId: string;
      subscription: OwnedSubscription<ZenticAgentListResult>;
    }
  >;
  function listAgents(options?: ZenticAgentListOptions): Promise<ZenticAgentListResult>;
  async function listAgents(options?: ZenticAgentListOptions): Promise<ZenticAgentListResult> {
    if (!options?.subscribe) return daemonClient.fetchAgents(options);
    if (options.subscribe.subscriptionId !== undefined)
      throw new Error("Subscription IDs are assigned by the host");
    const subscription = own(() => daemonClient.observeAgents(options));
    subscription.subscribe({
      snapshot: () => {},
      update: (message) => {
        if (message.type === "agent_update")
          for (const listener of agentListeners) listener(message.payload);
      },
    });
    return { ...(await subscription.ready), subscription };
  }

  return {
    dispose,
    hosts: createHostActions(daemonClient, { own, signal: lifetime.signal, api: createZenticApi }),
    observeEvents,
    terminals,
    projects: {
      list: (options) => daemonClient.listProjects(options),
      subscribe: (handler) => {
        return subscribeEvent("project.update", (message) => {
          if (message.type === "project.update") handler(message.payload);
        });
      },
    },
    workspaces: {
      list: listWorkspaces,
      ref: (workspace) => createWorkspaceHandle(workspace),
      open: (input, requestId) =>
        openWorkspace(daemonClient, createWorkspaceHandle, input, requestId),
      create: async ({ requestId, agent, ...options }) => {
        const result = await daemonClient.createWorkspace(
          {
            ...options,
            ...(agent
              ? {
                  agent: toDaemonAgentCreateOptions(
                    agent,
                    undefined,
                    daemonClient.getLastServerInfoMessage()?.serverId,
                  ),
                }
              : {}),
          },
          requestId,
        );
        if (result.error || !result.workspace) {
          throw new Error(result.error ?? "The daemon did not create a workspace");
        }
        return createWorkspaceHandle(result.workspace);
      },
      archive: (workspace, requestId) =>
        daemonClient.archiveWorkspace(resolveWorkspaceId(workspace), requestId),
      subscribe: listenWorkspaces,
    },
    agents: {
      list: listAgents,
      ref: (agent) => createAgentHandle(agent),
      create: (options) => createAgent(options),
      subscribe: listenAgents,
    },
    providers: {
      listModels: (provider, options) => daemonClient.listProviderModels(provider, options),
      listModes: (provider, options) => daemonClient.listProviderModes(provider, options),
      listFeatures: ({ provider: providerModel, ...draftConfig }, options) => {
        const { provider, model } = parseProviderModel(providerModel);
        return daemonClient.listProviderFeatures({ ...draftConfig, provider, model }, options);
      },
      listControls: ({ provider: providerModel, ...draftConfig }, options) => {
        const { provider, model } = parseProviderModel(providerModel);
        return daemonClient.listProviderControls({ ...draftConfig, provider, model }, options);
      },
      listAvailable: (options) => daemonClient.listAvailableProviders(options),
      snapshot: (options) => daemonClient.getProvidersSnapshot(options),
      waitForReady: (options) =>
        waitForProvidersReady(
          daemonClient,
          observeEvents(["providers_snapshot_update"]),
          lifetime.signal,
          options,
        ),
      refresh: (options) => daemonClient.refreshProvidersSnapshot(options),
      diagnostic: (provider, options) => daemonClient.getProviderDiagnostic(provider, options),
      listUsage: (options) => listProviderUsage(daemonClient, options),
      subscribe: (handler) => {
        return subscribeEvent("providers_snapshot_update", (message) => {
          if (message.type === "providers_snapshot_update") handler(message.payload);
        });
      },
    },
    config: {
      get: (requestId) => daemonClient.getDaemonConfig(requestId),
      patch: (patch, requestId) => daemonClient.patchDaemonConfig(patch, requestId),
    },
  };
}

type WorkspaceHandleFactory = (workspace: string | ZenticWorkspace) => ZenticWorkspaceHandle;
type AgentHandleFactory = (agent: string | ZenticAgent) => ZenticAgentHandle;
type CreateAgent = (
  options: ZenticAgentCreateOptions,
  placement?: { workspaceId: string; cwd: string },
) => Promise<ZenticAgentHandle>;

function createWorkspaceHandleFactory(
  daemonClient: DaemonClient,
  createAgent: CreateAgent,
  terminals: ZenticTerminalActions,
  listen: (handler: ZenticWorkspaceUpdateHandler) => () => void,
): WorkspaceHandleFactory {
  return (workspace) => {
    const id = typeof workspace === "string" ? workspace : workspace.id;
    let current = typeof workspace === "string" ? null : workspace;

    const refresh = async (options?: { requestId?: string }) => {
      current = await daemonClient.findWorkspace(id, options);
      return current;
    };

    return {
      id,
      get projectId() {
        return current?.projectId ?? null;
      },
      get directory() {
        return current?.workspaceDirectory ?? null;
      },
      get name() {
        return current?.name ?? null;
      },
      get status() {
        return current?.status ?? null;
      },
      get metadata() {
        return current?.metadata ?? null;
      },
      agents: {
        create: async (options) => {
          const snapshot = current ?? (await refresh());
          if (!snapshot?.workspaceDirectory) {
            throw new Error(`Workspace ${id} has no available directory`);
          }
          return createAgent(
            { ...options, cwd: snapshot.workspaceDirectory },
            { workspaceId: id, cwd: snapshot.workspaceDirectory },
          );
        },
      },
      terminals: {
        create: (options) => terminals.create({ ...options, workspaceId: id }),
        list: (options) => terminals.list({ ...options, workspaceId: id }),
      },
      current: () => current,
      refresh,
      setTitle: (title, requestId) => daemonClient.setWorkspaceTitle(id, title, requestId),
      setMetadata: async (patch) => {
        const metadata = await daemonClient.setWorkspaceMetadata(id, patch);
        if (current) current = { ...current, metadata };
      },
      setPinned: (pinned) => daemonClient.setWorkspacePinned(id, pinned),
      setLabel: (name, options) =>
        assignWorkspaceLabel({
          client: daemonClient,
          workspaceId: id,
          name,
          assigned: options.assigned,
        }),
      setBaseBranch: (options) =>
        daemonClient.setWorkspaceBaseBranch({ ...options, workspaceId: id }),
      archive: async (requestId) => {
        const result = await daemonClient.archiveWorkspace(id, requestId);
        if (current) {
          current = { ...current, archivingAt: result.archivedAt };
        }
        return result;
      },
      subscribe: (handler) =>
        listen((update) => {
          if (update.kind === "upsert" && update.workspace.id === id) {
            current = update.workspace;
            handler(update);
          }
          if (update.kind === "remove" && update.id === id) {
            handler(update);
          }
        }),
    };
  };
}

function createAgentHandleFactory(
  daemonClient: DaemonClient,
  listen: (handler: ZenticAgentUpdateHandler) => () => void,
  subscribeTimeline: DaemonClient["subscribeAgentTimeline"],
  observeBackgroundWork: () => ReturnType<DaemonClient["observeAgentBackgroundWork"]>,
): AgentHandleFactory {
  return (agent) => {
    const id = typeof agent === "string" ? agent : agent.id;
    let current = typeof agent === "string" ? null : agent;

    let serverId = daemonClient.getLastServerInfoMessage()?.serverId;
    const handle: ZenticAgentHandle = {
      id,
      get address() {
        serverId ??= daemonClient.getLastServerInfoMessage()?.serverId;
        if (!serverId) throw new Error("Connect to a host before obtaining an agent address");
        return { serverId, agentId: id };
      },
      timeline: {
        append: (item) => daemonClient.appendAgentTimelineItem(id, item),
        refetch: async (options) => {
          const result = await daemonClient.fetchAgentTimeline(id, options);
          if (result.agent) {
            current = result.agent;
          }
          return result;
        },
        subscribe: (handler) =>
          subscribeTimeline(id, (message) => {
            switch (message.type) {
              case "agent_stream":
                return handler(message.payload);
              case "agent.timeline.subscription_restored":
                return handler({
                  agentId: id,
                  subscriptionId: message.payload.subscriptionId,
                  event: { type: "subscription_restored" },
                });
              case "agent.timeline.error":
                return handler({
                  agentId: id,
                  event: { type: "error", error: message.payload.error },
                });
              case "agent.timeline.replacement":
                return handler({
                  agentId: id,
                  event: { type: "replacement", epoch: message.payload.epoch },
                });
            }
          }),
      },
      backgroundWork: {
        stop: (item, options) => daemonClient.stopAgentBackgroundWork(id, item, options),
        list: (options) => daemonClient.listAgentBackgroundWork(id, options),
        subscribe: (listener, options) => {
          const observation = observeBackgroundWork();
          // Bumped by every delivery so a list answered after a newer update is dropped.
          let sequence = 0;
          let released = false;
          const reportError = (error: unknown) => {
            if (released) return;
            if (options?.onError) options.onError(error);
            else console.error("Background work subscription failed", error);
          };
          observation.subscribe({
            error: reportError,
            snapshot: () => {
              const listed = ++sequence;
              void daemonClient
                .listAgentBackgroundWork(id)
                .then((items) => {
                  if (!released && listed === sequence) listener(items);
                  return undefined;
                })
                .catch(reportError);
            },
            update: (message) => {
              if (message.type !== "agent.background_work.update") return;
              if (message.payload.agentId !== id) return;
              sequence++;
              listener(message.payload.items);
            },
          });
          return () => {
            released = true;
            void observation
              .release()
              .catch((error) =>
                console.error("Background work subscription cleanup failed", error),
              );
          };
        },
      },
      get workspaceId() {
        return current?.workspaceId ?? null;
      },
      get cwd() {
        return current?.cwd ?? null;
      },
      get status() {
        return current?.status ?? null;
      },
      get capabilities() {
        return current?.capabilities ?? null;
      },
      get availableModes() {
        return current?.availableModes ?? null;
      },
      get pendingPermissions() {
        return current?.pendingPermissions ?? null;
      },
      get activeTurn() {
        return current?.activeTurn ?? null;
      },
      get lastUsage() {
        return current?.lastUsage ?? null;
      },
      get lastError() {
        return current?.lastError ?? null;
      },
      get features() {
        return current?.features ?? null;
      },
      get options() {
        return current?.options ?? null;
      },
      get controls() {
        return current?.controls ?? null;
      },
      get metadata() {
        return current?.metadata ?? null;
      },
      get runtimeInfo() {
        return current?.runtimeInfo ?? null;
      },
      get archivedAt() {
        return current?.archivedAt ?? null;
      },
      current: () => current,
      refresh: async (requestId) => {
        const result = await daemonClient.fetchAgent({ agentId: id, requestId });
        current = result?.agent ?? null;
        return result;
      },
      reload: async (options) => {
        await daemonClient.refreshAgent(id, options?.requestId);
        const result = await daemonClient.fetchAgent({ agentId: id });
        current = result?.agent ?? null;
        return result;
      },
      send: async (text, options) => {
        await daemonClient.sendAgentMessage(id, text, options);
      },
      setOptions: async (patch) => {
        await daemonClient.setAgentOptions(id, patch);
      },
      setMetadata: async (patch) => {
        const metadata = await daemonClient.setAgentMetadata(id, patch);
        if (current) current = { ...current, metadata };
      },
      respondToPermission: async ({ requestId, response }) => {
        await daemonClient.respondToPermission(id, requestId, response);
      },
      run: async (text, options) => {
        const { timeoutMs, ...sendOptions } = options ?? {};
        await daemonClient.sendAgentMessage(id, text, sendOptions);
        const result = await daemonClient.waitForFinish(
          id,
          timeoutMs ?? DEFAULT_WAIT_FOR_FINISH_MS,
        );
        if (result.final) {
          current = result.final;
        }
        return result;
      },
      waitForFinish: async (timeoutMs) => {
        const result = await daemonClient.waitForFinish(
          id,
          timeoutMs ?? DEFAULT_WAIT_FOR_FINISH_MS,
        );
        if (result.final) {
          current = result.final;
        }
        return result;
      },
      commands: (options) => daemonClient.listCommands({ agentId: id, ...options }),
      archive: async () => {
        const result = await daemonClient.archiveAgent(id);
        if (current) {
          current = { ...current, archivedAt: result.archivedAt };
        }
        return result;
      },
      detach: async () => {
        await daemonClient.detachAgent(id);
      },
      subscribe: (handler) =>
        listen((update) => {
          if (update.kind === "upsert" && update.agent.id === id) {
            current = update.agent;
            handler(update);
          }
          if (update.kind === "remove" && update.agentId === id) {
            handler(update);
          }
        }),
    };

    return handle;
  };
}

async function openWorkspace(
  daemonClient: DaemonClient,
  createWorkspaceHandle: WorkspaceHandleFactory,
  input: string | ZenticWorkspaceOpenOptions,
  requestId?: string,
): Promise<ZenticWorkspaceHandle> {
  const options = typeof input === "string" ? { cwd: input, requestId } : input;
  const result = await daemonClient.openProject(options.cwd, options.requestId);
  if (result.error || !result.workspace) {
    throw new Error(result.error ?? `The daemon did not open a workspace for ${options.cwd}`);
  }
  return createWorkspaceHandle(result.workspace);
}

function resolveWorkspaceId(workspace: string | ZenticWorkspaceHandle): string {
  return typeof workspace === "string" ? workspace : workspace.id;
}

function foreignParentHandle(
  parent: ZenticAgentCreateOptions["parent"],
  serverId: string | undefined,
): ZenticAgentHandle | null {
  if (!parent || typeof parent === "string" || !("address" in parent)) return null;
  return parent.address.serverId === serverId ? null : parent;
}

// A host inherits background from a caller it can see. A parent on another host is invisible to
// it, so a handle passes its own value on. A bare foreign address can't; pass background then.
async function inheritParentBackground(
  options: ZenticAgentCreateOptions,
  parent: ZenticAgentHandle,
): Promise<ZenticAgentCreateOptions> {
  const snapshot = parent.current() ?? (await parent.refresh())?.agent;
  return snapshot?.background ? { ...options, background: true } : options;
}

function encodeParent(
  parent: string | AgentAddress | ZenticAgentHandle,
  serverId?: string,
): Pick<CreateAgentRequestOptions, "callerAgentId" | "labels"> {
  if (typeof parent === "string") return { callerAgentId: parent };
  const address = "address" in parent ? parent.address : parent;
  if (!serverId) throw new Error("Connect to a host before creating a child");
  return address.serverId === serverId
    ? { callerAgentId: address.agentId, labels: parentAddressLabels(address) }
    : { labels: parentAddressLabels(address) };
}

function parseProviderModel(selection: string): { provider: string; model: string } {
  const separator = selection.indexOf("/");
  if (separator <= 0 || separator === selection.length - 1) {
    throw new Error('Expected config.provider in "provider/model" format');
  }
  return {
    provider: selection.slice(0, separator),
    model: selection.slice(separator + 1),
  };
}

function listProviderUsage(
  daemonClient: DaemonClient,
  options?: ZenticProviderUsageOptions,
): Promise<ZenticProviderUsageResult> {
  daemonClient.ensureConnected();
  // COMPAT(providerUsageList): added in v0.1.98, remove after 2027-02-28 once daemon floor >= v0.1.98.
  if (daemonClient.getLastServerInfoMessage()?.features?.providerUsageList !== true) {
    return Promise.reject(new Error("Update the host to list provider usage."));
  }
  return daemonClient.listProviderUsage(options);
}

async function waitForProvidersReady(
  daemonClient: DaemonClient,
  observation: ReturnType<DaemonClient["observeEvents"]>,
  signal: AbortSignal,
  options: ZenticProviderWaitOptions = {},
): Promise<ZenticProviderSnapshotResult> {
  const { timeoutMs = 60_000, ...snapshotOptions } = options;

  try {
    await observation.ready;
    if (signal.aborted) throw new Error("Zentic API is disposed");
    return await new Promise<ZenticProviderSnapshotResult>((resolve, reject) => {
      let settled = false;
      let requestId: string | null = null;
      let snapshotCwd: string | undefined;
      const pendingUpdates = new Map<string | undefined, ZenticProviderSnapshotUpdate>();
      let latestEntries: ZenticProviderSnapshotResult["entries"] = [];

      const cleanup = () => {
        clearTimeout(timeout);
        unsubscribe();
        signal.removeEventListener("abort", abort);
      };
      const finish = (snapshot: ZenticProviderSnapshotResult) => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(snapshot);
      };
      const fail = (error: unknown) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(error instanceof Error ? error : new Error(String(error)));
      };
      const updateMatches = (update: ZenticProviderSnapshotUpdate) => update.cwd === snapshotCwd;

      const unsubscribe = observation.subscribe({
        snapshot: () => {},
        update: (message) => {
          if (message.type !== "providers_snapshot_update") return;
          const update = message.payload;
          if (!requestId) {
            pendingUpdates.set(update.cwd, update);
            return;
          }
          if (!updateMatches(update)) return;
          latestEntries = update.entries;
          if (update.entries.some((entry) => entry.status === "loading")) return;
          finish({ ...update, requestId });
        },
      });
      const abort = () => fail(new Error("Zentic API is disposed"));
      signal.addEventListener("abort", abort, { once: true });

      const timeout = setTimeout(() => {
        const loading = latestEntries
          .filter((entry) => entry.status === "loading")
          .map((entry) => entry.provider)
          .join(", ");
        fail(
          new Error(
            loading
              ? `Timed out waiting for providers: ${loading}`
              : "Timed out waiting for provider discovery",
          ),
        );
      }, timeoutMs);

      void daemonClient
        .getProvidersSnapshot(snapshotOptions)
        .then((snapshot) => {
          requestId = snapshot.requestId;
          snapshotCwd = snapshot.cwd;
          latestEntries = snapshot.entries;
          if (!snapshot.entries.some((entry) => entry.status === "loading")) {
            finish(snapshot);
            return;
          }
          const pendingUpdate = pendingUpdates.get(snapshotCwd);
          if (pendingUpdate && !pendingUpdate.entries.some((entry) => entry.status === "loading")) {
            finish({ ...pendingUpdate, requestId });
          }
          return undefined;
        })
        .catch(fail);
    });
  } finally {
    await observation.release();
  }
}

function createGeneratedClientId(): string {
  const randomId =
    typeof globalThis.crypto?.randomUUID === "function"
      ? globalThis.crypto.randomUUID()
      : Math.random().toString(36).slice(2);
  return `zentic-sdk-${randomId}`;
}

export type { DiffCompare, DiffState, DiffEntry, ResolvedShas } from "./diff/index.js";

interface WorkspaceLabelAssignment {
  client: DaemonClient;
  workspaceId: string;
  name: string;
  assigned: boolean;
}
async function assignWorkspaceLabel(
  input: WorkspaceLabelAssignment,
): Promise<{ labels: string[] }> {
  input.client.ensureConnected();
  // COMPAT(workspaceLabels): added in v0.5.0, remove gate after 2027-08-14.
  if (input.client.getLastServerInfoMessage()?.features?.workspaceLabels !== true)
    throw new Error("Update the host to assign workspace labels.");
  const catalog = await input.client.listWorkspaceLabels();
  const key = workspaceLabelKey(input.name);
  const existing = catalog.labels.find((label) => workspaceLabelKey(label.name) === key);
  const label = existing ?? { name: input.name, color: "violet" as const };
  const result = await input.client.setWorkspaceLabel({
    workspaceId: input.workspaceId,
    label,
    assigned: input.assigned,
  });
  return { labels: result.workspaceLabels };
}
