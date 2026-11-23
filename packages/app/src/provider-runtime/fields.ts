/**
 * Runtime settings the provider settings sheet edits, per provider. Each field names the
 * env var or provider option the daemon (or the provider CLI it launches) actually reads;
 * keep this list to values that are read somewhere, not values a provider might accept.
 */

export type RuntimeFieldTarget = { kind: "env"; key: string } | { kind: "option"; key: string };

export type RuntimeFieldType = "text" | "path" | "url" | "secret" | "int" | "toggle" | "json";

export interface RuntimeField {
  /** Stable id, also the i18n key under `settings.providers.runtime.fields`. */
  id: RuntimeFieldId;
  type: RuntimeFieldType;
  target: RuntimeFieldTarget;
  hasHint?: boolean;
  min?: number;
  max?: number;
}

export interface RuntimeFieldGroup {
  /** i18n key under `settings.providers.runtime.groups`. */
  id: RuntimeFieldGroupId;
  fields: RuntimeField[];
  /**
   * The provider already reads these values from the config file in its config directory
   * (Claude's settings.json, Codex's config.toml). The sheet tucks them away as optional
   * overrides so a configured directory needs nothing else.
   */
  overridesConfigFile?: boolean;
}

export type RuntimeFieldGroupId =
  | "configDir"
  | "endpoint"
  | "models"
  | "context"
  | "network"
  | "server"
  | "bridge"
  | "session"
  | "modelRoles";

export type RuntimeFieldId =
  | "claudeConfigDir"
  | "anthropicBaseUrl"
  | "anthropicAuthToken"
  | "anthropicApiKey"
  | "apiTimeoutMs"
  | "anthropicModel"
  | "anthropicOpusModel"
  | "anthropicSonnetModel"
  | "anthropicHaikuModel"
  | "autoCompactWindow"
  | "disableAutoCompact"
  | "maxOutputTokens"
  | "disableNonessentialTraffic"
  | "codexHome"
  | "openaiBaseUrl"
  | "openaiApiKey"
  | "opencodeConfigDir"
  | "opencodeConfigContent"
  | "opencodeServerUrl"
  | "opencodeServerPassword"
  | "opencodeBridgePort"
  | "opencodeBridgeUrl"
  | "piAgentDir"
  | "piConfigDir"
  | "ompProfile"
  | "xdgConfigHome"
  | "xdgStateHome"
  | "sessionDir"
  | "rpcTimeoutMs"
  | "smolModel"
  | "slowModel"
  | "planModel";

function env(key: string): RuntimeFieldTarget {
  return { kind: "env", key };
}

function option(key: string): RuntimeFieldTarget {
  return { kind: "option", key };
}

const PI_SESSION_GROUP: RuntimeFieldGroup = {
  id: "session",
  fields: [
    { id: "sessionDir", type: "path", target: option("sessionDir"), hasHint: true },
    {
      id: "rpcTimeoutMs",
      type: "int",
      target: option("rpcTimeoutMs"),
      hasHint: true,
      min: 1000,
      max: 3_600_000,
    },
  ],
};

const RUNTIME_FIELD_GROUPS: Record<string, RuntimeFieldGroup[]> = {
  claude: [
    {
      id: "configDir",
      fields: [
        { id: "claudeConfigDir", type: "path", target: env("CLAUDE_CONFIG_DIR"), hasHint: true },
      ],
    },
    {
      id: "endpoint",
      overridesConfigFile: true,
      fields: [
        { id: "anthropicBaseUrl", type: "url", target: env("ANTHROPIC_BASE_URL") },
        {
          id: "anthropicAuthToken",
          type: "secret",
          target: env("ANTHROPIC_AUTH_TOKEN"),
          hasHint: true,
        },
        { id: "anthropicApiKey", type: "secret", target: env("ANTHROPIC_API_KEY"), hasHint: true },
        {
          id: "apiTimeoutMs",
          type: "int",
          target: env("API_TIMEOUT_MS"),
          min: 1000,
          max: 3_600_000,
        },
      ],
    },
    {
      id: "models",
      overridesConfigFile: true,
      fields: [
        { id: "anthropicModel", type: "text", target: env("ANTHROPIC_MODEL") },
        { id: "anthropicOpusModel", type: "text", target: env("ANTHROPIC_DEFAULT_OPUS_MODEL") },
        {
          id: "anthropicSonnetModel",
          type: "text",
          target: env("ANTHROPIC_DEFAULT_SONNET_MODEL"),
        },
        { id: "anthropicHaikuModel", type: "text", target: env("ANTHROPIC_DEFAULT_HAIKU_MODEL") },
      ],
    },
    {
      id: "context",
      fields: [
        {
          id: "autoCompactWindow",
          type: "int",
          target: env("CLAUDE_CODE_AUTO_COMPACT_WINDOW"),
          hasHint: true,
          min: 100_000,
          max: 1_000_000,
        },
        { id: "disableAutoCompact", type: "toggle", target: env("DISABLE_AUTO_COMPACT") },
        {
          id: "maxOutputTokens",
          type: "int",
          target: env("CLAUDE_CODE_MAX_OUTPUT_TOKENS"),
          min: 1,
          max: 1_000_000,
        },
      ],
    },
    {
      id: "network",
      fields: [
        {
          id: "disableNonessentialTraffic",
          type: "toggle",
          target: env("CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC"),
          hasHint: true,
        },
      ],
    },
  ],
  codex: [
    {
      id: "configDir",
      fields: [{ id: "codexHome", type: "path", target: env("CODEX_HOME"), hasHint: true }],
    },
    {
      id: "endpoint",
      overridesConfigFile: true,
      fields: [
        { id: "openaiBaseUrl", type: "url", target: env("OPENAI_BASE_URL"), hasHint: true },
        { id: "openaiApiKey", type: "secret", target: env("OPENAI_API_KEY") },
      ],
    },
  ],
  opencode: [
    {
      id: "configDir",
      fields: [
        { id: "opencodeConfigDir", type: "path", target: env("OPENCODE_CONFIG_DIR") },
        {
          id: "opencodeConfigContent",
          type: "json",
          target: env("OPENCODE_CONFIG_CONTENT"),
          hasHint: true,
        },
      ],
    },
    {
      id: "server",
      fields: [
        {
          id: "opencodeServerUrl",
          type: "url",
          target: env("ZENTIC_OPENCODE_SERVER_URL"),
          hasHint: true,
        },
        {
          id: "opencodeServerPassword",
          type: "secret",
          target: env("ZENTIC_OPENCODE_SERVER_PASSWORD"),
        },
      ],
    },
    {
      id: "bridge",
      fields: [
        {
          id: "opencodeBridgePort",
          type: "int",
          target: env("ZENTIC_OPENCODE_BRIDGE_PORT"),
          min: 1,
          max: 65_535,
        },
        {
          id: "opencodeBridgeUrl",
          type: "url",
          target: env("ZENTIC_OPENCODE_BRIDGE_URL"),
          hasHint: true,
        },
      ],
    },
  ],
  pi: [
    {
      id: "configDir",
      fields: [
        { id: "piAgentDir", type: "path", target: env("PI_CODING_AGENT_DIR"), hasHint: true },
      ],
    },
    PI_SESSION_GROUP,
  ],
  omp: [
    {
      id: "configDir",
      fields: [
        { id: "ompProfile", type: "text", target: env("OMP_PROFILE"), hasHint: true },
        { id: "piConfigDir", type: "text", target: env("PI_CONFIG_DIR"), hasHint: true },
        { id: "piAgentDir", type: "path", target: env("PI_CODING_AGENT_DIR"), hasHint: true },
        { id: "xdgConfigHome", type: "path", target: env("XDG_CONFIG_HOME") },
        { id: "xdgStateHome", type: "path", target: env("XDG_STATE_HOME") },
      ],
    },
    PI_SESSION_GROUP,
    {
      id: "modelRoles",
      fields: [
        { id: "smolModel", type: "text", target: option("smolModel") },
        { id: "slowModel", type: "text", target: option("slowModel") },
        { id: "planModel", type: "text", target: option("planModel") },
      ],
    },
  ],
};

/** Built-in providers whose launch the daemon owns; each launches a command of the same name. */
const BUILTIN_RUNTIME_PROVIDERS = new Set(["claude", "codex", "copilot", "opencode", "pi", "omp"]);

export interface ProviderRuntimeSpec {
  groups: RuntimeFieldGroup[];
  /**
   * The command a launch uses when the binary path is left empty, or null when the provider
   * has no default and the command is required (ACP entries).
   */
  defaultCommand: string | null;
}

/**
 * Resolves what the runtime sheet shows for a provider, or null when Zentic does not own its
 * launch (plugin providers). A derived entry edits the fields of the provider it extends.
 */
export function resolveProviderRuntimeSpec(input: {
  provider: string;
  extendsProvider: string | undefined;
}): ProviderRuntimeSpec | null {
  const base = input.extendsProvider ?? input.provider;
  if (base === "acp") {
    return { groups: [], defaultCommand: null };
  }
  if (!BUILTIN_RUNTIME_PROVIDERS.has(base)) {
    return null;
  }
  return { groups: RUNTIME_FIELD_GROUPS[base] ?? [], defaultCommand: base };
}

export function listRuntimeFields(spec: ProviderRuntimeSpec): RuntimeField[] {
  return spec.groups.flatMap((group) => group.fields);
}
