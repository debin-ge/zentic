import type { MutableDaemonConfigPatch } from "@getzentic/protocol/messages";
import { listRuntimeFields, type ProviderRuntimeSpec, type RuntimeField } from "./fields";

type ProviderPatch = NonNullable<MutableDaemonConfigPatch["providers"]>[string];

/** The slice of a stored provider entry the runtime form reads. */
export interface ProviderRuntimeOverride {
  command?: string[];
  env?: Record<string, string>;
  options?: Record<string, unknown>;
}

export interface ProviderRuntimeFormSnapshot {
  provider: string;
  spec: ProviderRuntimeSpec;
  override: ProviderRuntimeOverride | undefined;
}

export interface CustomEnvRow {
  rowId: string;
  key: string;
  value: string;
}

export type RuntimeFieldError =
  | { code: "invalidInteger"; min: number; max: number }
  | { code: "invalidUrl" }
  | { code: "invalidJson" }
  | { code: "invalidEnvKey" }
  | { code: "duplicateEnvKey" }
  | { code: "commandRequired" }
  | { code: "unclosedQuote" };

export interface ProviderRuntimeFormErrors {
  binaryPath: RuntimeFieldError | null;
  launchArgs: RuntimeFieldError | null;
  fields: Partial<Record<string, RuntimeFieldError>>;
  customEnv: Partial<Record<string, RuntimeFieldError>>;
}

export type ProviderRuntimeSaveStatus =
  | { status: "idle" }
  | { status: "saving" }
  | { status: "error"; message: string };

export interface ProviderRuntimeFormState {
  binaryPath: string;
  launchArgs: string;
  /** Field id → raw input text; toggles hold "1" when on and "" when off. */
  values: Record<string, string>;
  customEnv: CustomEnvRow[];
  errors: ProviderRuntimeFormErrors;
  /** The patch a save would send, or null when nothing changed. */
  patch: ProviderPatch | null;
  canSave: boolean;
  save: ProviderRuntimeSaveStatus;
}

export interface ProviderRuntimeFormModel {
  getState: () => ProviderRuntimeFormState;
  subscribe: (listener: () => void) => () => void;
  close: () => void;
  setBinaryPath: (value: string) => void;
  setLaunchArgs: (value: string) => void;
  setFieldValue: (fieldId: string, value: string) => void;
  addCustomEnv: () => void;
  setCustomEnvKey: (rowId: string, key: string) => void;
  setCustomEnvValue: (rowId: string, value: string) => void;
  removeCustomEnv: (rowId: string) => void;
  setSaveStatus: (save: ProviderRuntimeSaveStatus) => void;
}

const ENV_KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
const FALSE_TOGGLE_VALUES = new Set(["", "0", "false", "no", "off"]);

export function openProviderRuntimeForm(
  snapshot: ProviderRuntimeFormSnapshot,
): ProviderRuntimeFormModel {
  const listeners = new Set<() => void>();
  const fields = listRuntimeFields(snapshot.spec);
  const typedEnvKeys = new Set(
    fields.flatMap((field) => (field.target.kind === "env" ? [field.target.key] : [])),
  );
  let nextRowId = 0;
  function createRowId(): string {
    nextRowId += 1;
    return `env-${nextRowId}`;
  }

  const override = snapshot.override ?? {};
  const [storedBinary, ...storedArgs] = override.command ?? [];
  const seeded: Omit<ProviderRuntimeFormState, "errors" | "patch" | "canSave"> = {
    binaryPath: storedBinary ?? "",
    launchArgs: joinLaunchArgs(storedArgs),
    values: Object.fromEntries(fields.map((field) => [field.id, readFieldValue(field, override)])),
    customEnv: Object.entries(override.env ?? {})
      .filter(([key]) => !typedEnvKeys.has(key))
      .map(([key, value]) => ({ rowId: createRowId(), key, value })),
    save: { status: "idle" },
  };

  function derive(
    input: Omit<ProviderRuntimeFormState, "errors" | "patch" | "canSave">,
  ): ProviderRuntimeFormState {
    const errors = validate(input, { fields, typedEnvKeys, spec: snapshot.spec });
    const hasErrors =
      errors.binaryPath !== null ||
      errors.launchArgs !== null ||
      Object.keys(errors.fields).length > 0 ||
      Object.keys(errors.customEnv).length > 0;
    const patch = hasErrors ? null : buildPatch(input, { fields, override, spec: snapshot.spec });
    return {
      ...input,
      errors,
      patch,
      canSave: !hasErrors && patch !== null && input.save.status !== "saving",
    };
  }

  let state = derive(seeded);
  let closed = false;

  function publish(next: Omit<ProviderRuntimeFormState, "errors" | "patch" | "canSave">): void {
    if (closed) return;
    state = derive(next);
    for (const listener of listeners) listener();
  }

  function editable(): Omit<ProviderRuntimeFormState, "errors" | "patch" | "canSave"> {
    const { errors: _errors, patch: _patch, canSave: _canSave, ...rest } = state;
    // An edit after a failed save clears the stale error.
    return rest.save.status === "error" ? { ...rest, save: { status: "idle" } } : rest;
  }

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    close() {
      closed = true;
      listeners.clear();
    },
    setBinaryPath(value) {
      publish({ ...editable(), binaryPath: value });
    },
    setLaunchArgs(value) {
      publish({ ...editable(), launchArgs: value });
    },
    setFieldValue(fieldId, value) {
      const current = editable();
      publish({ ...current, values: { ...current.values, [fieldId]: value } });
    },
    addCustomEnv() {
      const current = editable();
      publish({
        ...current,
        customEnv: [...current.customEnv, { rowId: createRowId(), key: "", value: "" }],
      });
    },
    setCustomEnvKey(rowId, key) {
      const current = editable();
      publish({ ...current, customEnv: updateEnvRow(current.customEnv, rowId, { key }) });
    },
    setCustomEnvValue(rowId, value) {
      const current = editable();
      publish({ ...current, customEnv: updateEnvRow(current.customEnv, rowId, { value }) });
    },
    removeCustomEnv(rowId) {
      const current = editable();
      publish({ ...current, customEnv: current.customEnv.filter((row) => row.rowId !== rowId) });
    },
    setSaveStatus(save) {
      const { errors: _errors, patch: _patch, canSave: _canSave, ...rest } = state;
      publish({ ...rest, save });
    },
  };
}

function readFieldValue(field: RuntimeField, override: ProviderRuntimeOverride): string {
  if (field.target.kind === "env") {
    const value = override.env?.[field.target.key] ?? "";
    if (field.type === "toggle") {
      return isToggleOn(value) ? "1" : "";
    }
    return value;
  }
  const value = override.options?.[field.target.key];
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return "";
}

function isToggleOn(value: string): boolean {
  return !FALSE_TOGGLE_VALUES.has(value.trim().toLowerCase());
}

function validate(
  input: RuntimeFormInput,
  context: { fields: RuntimeField[]; typedEnvKeys: Set<string>; spec: ProviderRuntimeSpec },
): ProviderRuntimeFormErrors {
  const errors: ProviderRuntimeFormErrors = {
    binaryPath: null,
    launchArgs: null,
    fields: {},
    customEnv: {},
  };
  const args = splitLaunchArgs(input.launchArgs);
  if (args === null) {
    errors.launchArgs = { code: "unclosedQuote" };
  }
  if (context.spec.defaultCommand === null && input.binaryPath.trim() === "") {
    errors.binaryPath = { code: "commandRequired" };
  }
  for (const field of context.fields) {
    const error = validateFieldValue(field, (input.values[field.id] ?? "").trim());
    if (error) errors.fields[field.id] = error;
  }
  const seenKeys = new Set<string>();
  for (const row of input.customEnv) {
    const key = row.key.trim();
    if (key === "") {
      if (row.value.trim() !== "") errors.customEnv[row.rowId] = { code: "invalidEnvKey" };
      continue;
    }
    if (!ENV_KEY_PATTERN.test(key)) {
      errors.customEnv[row.rowId] = { code: "invalidEnvKey" };
    } else if (seenKeys.has(key) || context.typedEnvKeys.has(key)) {
      errors.customEnv[row.rowId] = { code: "duplicateEnvKey" };
    }
    seenKeys.add(key);
  }
  return errors;
}

function validateFieldValue(field: RuntimeField, value: string): RuntimeFieldError | null {
  if (value === "") return null;
  switch (field.type) {
    case "int": {
      const min = field.min ?? 0;
      const max = field.max ?? Number.MAX_SAFE_INTEGER;
      const parsed = /^\d+$/.test(value) ? Number(value) : Number.NaN;
      return Number.isSafeInteger(parsed) && parsed >= min && parsed <= max
        ? null
        : { code: "invalidInteger", min, max };
    }
    case "url":
      return isHttpUrl(value) ? null : { code: "invalidUrl" };
    case "json":
      return isJsonObject(value) ? null : { code: "invalidJson" };
    default:
      return null;
  }
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function isJsonObject(value: string): boolean {
  try {
    const parsed: unknown = JSON.parse(value);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed);
  } catch {
    return false;
  }
}

type RuntimeFormInput = Pick<
  ProviderRuntimeFormState,
  "binaryPath" | "launchArgs" | "values" | "customEnv"
>;

interface RuntimePatchContext {
  fields: RuntimeField[];
  override: ProviderRuntimeOverride;
  spec: ProviderRuntimeSpec;
}

function updateEnvRow(
  rows: CustomEnvRow[],
  rowId: string,
  change: Partial<Pick<CustomEnvRow, "key" | "value">>,
): CustomEnvRow[] {
  const index = rows.findIndex((row) => row.rowId === rowId);
  if (index === -1) return rows;
  const next = rows.slice();
  next[index] = Object.assign({}, rows[index], change);
  return next;
}

function buildPatch(input: RuntimeFormInput, context: RuntimePatchContext): ProviderPatch | null {
  const patch: ProviderPatch = {};
  const command = buildCommandPatch(input, context);
  if (command !== undefined) patch.command = command;
  const env = buildEnvPatch(input, context);
  if (env) patch.env = env;
  const options = buildOptionsPatch(input, context);
  if (options) patch.options = options;
  return Object.keys(patch).length > 0 ? patch : null;
}

/** The new argv, null to clear the stored one, or undefined when it did not change. */
function buildCommandPatch(
  input: RuntimeFormInput,
  context: RuntimePatchContext,
): string[] | null | undefined {
  const binary = input.binaryPath.trim() || context.spec.defaultCommand;
  const args = splitLaunchArgs(input.launchArgs) ?? [];
  const wantsCommand = input.binaryPath.trim() !== "" || args.length > 0;
  const previous = context.override.command;
  if (!wantsCommand || binary === null) {
    return previous ? null : undefined;
  }
  const next = [binary, ...args];
  return sameStrings(next, previous) ? undefined : next;
}

function nextFieldEnvValue(field: RuntimeField, raw: string, stored: string | undefined): string {
  if (field.type !== "toggle") return raw;
  // A toggle stored as "true" or "yes" stays as written while it remains on.
  return stored !== undefined && isToggleOn(stored) ? stored : "1";
}

function buildEnvPatch(
  input: RuntimeFormInput,
  context: RuntimePatchContext,
): Record<string, string | null> | null {
  const previousEnv = context.override.env ?? {};
  const nextEnv: Record<string, string> = {};
  for (const field of context.fields) {
    const raw = (input.values[field.id] ?? "").trim();
    if (raw === "" || field.target.kind !== "env") continue;
    nextEnv[field.target.key] = nextFieldEnvValue(field, raw, previousEnv[field.target.key]);
  }
  for (const row of input.customEnv) {
    const key = row.key.trim();
    if (key !== "") nextEnv[key] = row.value;
  }
  const envPatch: Record<string, string | null> = {};
  for (const key of Object.keys(previousEnv)) {
    if (!(key in nextEnv)) envPatch[key] = null;
  }
  for (const [key, value] of Object.entries(nextEnv)) {
    if (previousEnv[key] !== value) envPatch[key] = value;
  }
  return Object.keys(envPatch).length > 0 ? envPatch : null;
}

function buildOptionsPatch(
  input: RuntimeFormInput,
  context: RuntimePatchContext,
): Record<string, unknown> | null {
  const previousOptions = context.override.options ?? {};
  const optionsPatch: Record<string, unknown> = {};
  for (const field of context.fields) {
    if (field.target.kind !== "option") continue;
    const key = field.target.key;
    const raw = (input.values[field.id] ?? "").trim();
    if (raw === "") {
      if (previousOptions[key] !== undefined) optionsPatch[key] = null;
      continue;
    }
    const next = field.type === "int" ? Number(raw) : raw;
    if (previousOptions[key] !== next) optionsPatch[key] = next;
  }
  return Object.keys(optionsPatch).length > 0 ? optionsPatch : null;
}

function sameStrings(a: string[], b: string[] | undefined): boolean {
  return b !== undefined && a.length === b.length && a.every((value, index) => value === b[index]);
}

/**
 * Splits launch arguments the way a POSIX shell splits words: whitespace separates, single
 * quotes are literal, double quotes allow `\"` and `\\`, a backslash outside quotes escapes the
 * next character. Returns null for an unclosed quote.
 */
export function splitLaunchArgs(input: string): string[] | null {
  const args: string[] = [];
  let current = "";
  let inWord = false;
  let quote: "'" | '"' | null = null;
  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    if (quote === "'") {
      if (char === "'") quote = null;
      else current += char;
      continue;
    }
    if (quote === '"') {
      if (char === '"') quote = null;
      else if (char === "\\" && (input[index + 1] === '"' || input[index + 1] === "\\")) {
        current += input[index + 1];
        index += 1;
      } else current += char;
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      inWord = true;
    } else if (char === "\\" && index + 1 < input.length) {
      current += input[index + 1];
      index += 1;
      inWord = true;
    } else if (/\s/.test(char)) {
      if (inWord) args.push(current);
      current = "";
      inWord = false;
    } else {
      current += char;
      inWord = true;
    }
  }
  if (quote !== null) return null;
  if (inWord) args.push(current);
  return args;
}

/** Inverse of splitLaunchArgs: quotes any argument that would not survive a split as is. */
export function joinLaunchArgs(args: string[]): string {
  return args
    .map((arg) =>
      arg !== "" && /^[^\s'"\\]+$/.test(arg) ? arg : `"${arg.replace(/(["\\])/g, "\\$1")}"`,
    )
    .join(" ");
}
