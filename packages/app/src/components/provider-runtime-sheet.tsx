import type { TFunction } from "i18next";
import { ChevronDown, ChevronRight, Eye, EyeOff, Plus, Trash2 } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { AdaptiveModalSheet, type SheetHeader } from "@/components/adaptive-modal-sheet";
import { Button } from "@/components/ui/button";
import { Field, FormTextInput } from "@/components/ui/form-field";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { ToolbarButton } from "@/components/ui/pane-content-toolbar";
import { Switch } from "@/components/ui/switch";
import { useIsCompactFormFactor } from "@/constants/layout";
import { useDaemonConfig } from "@/hooks/use-daemon-config";
import {
  resolveProviderRuntimeSpec,
  type ProviderRuntimeSpec,
  type RuntimeField,
  type RuntimeFieldGroup,
} from "@/provider-runtime/fields";
import {
  openProviderRuntimeForm,
  splitLaunchArgs,
  type CustomEnvRow,
  type ProviderRuntimeFormModel,
  type ProviderRuntimeFormState,
  type ProviderRuntimeOverride,
  type RuntimeFieldError,
} from "@/provider-runtime/runtime-form-model";
import type { AgentProvider } from "@getzentic/protocol/agent-types";

const RUNTIME_SNAP_POINTS = ["92%"];

const ThemedLoadingSpinner = withUnistyles(LoadingSpinner, (theme) => ({
  color: theme.colors.foregroundMuted,
}));
const ThemedTrash = withUnistyles(Trash2, (theme) => ({
  color: theme.colors.foregroundMuted,
  size: theme.iconSize.sm,
}));
const ThemedEye = withUnistyles(Eye, (theme) => ({
  color: theme.colors.foregroundMuted,
  size: theme.iconSize.sm,
}));
const ThemedEyeOff = withUnistyles(EyeOff, (theme) => ({
  color: theme.colors.foregroundMuted,
  size: theme.iconSize.sm,
}));

interface StoredProviderEntry extends ProviderRuntimeOverride {
  extends?: string;
}

/** Whether the runtime settings sheet applies to a provider at all. */
export function useProviderRuntimeSpec(
  serverId: string,
  provider: string,
): ProviderRuntimeSpec | null {
  const { config } = useDaemonConfig(serverId);
  const entry = config?.providers?.[provider] as StoredProviderEntry | undefined;
  return useMemo(
    () => resolveProviderRuntimeSpec({ provider, extendsProvider: entry?.extends }),
    [entry?.extends, provider],
  );
}

export function ProviderRuntimeSubSheet({
  provider,
  providerLabel,
  serverId,
  spec,
  visible,
  onClose,
  refresh,
}: {
  provider: string;
  providerLabel: string;
  serverId: string;
  spec: ProviderRuntimeSpec;
  visible: boolean;
  onClose: () => void;
  refresh: (providers?: AgentProvider[]) => Promise<void>;
}) {
  const { t } = useTranslation();
  const { config, patchConfig } = useDaemonConfig(serverId);
  const [openCount, setOpenCount] = useState(0);

  // Every open seeds a fresh form from the stored entry, so an abandoned edit never carries over.
  useEffect(() => {
    if (visible) setOpenCount((count) => count + 1);
  }, [visible]);

  const header = useMemo<SheetHeader>(
    () => ({ title: t("settings.providers.runtime.title", { provider: providerLabel }) }),
    [providerLabel, t],
  );
  const entry = config?.providers?.[provider] as StoredProviderEntry | undefined;
  const handleSave = useCallback(
    async (patch: ProviderPatch) => {
      await patchConfig({ providers: { [provider]: patch } });
      await refresh([provider]);
      onClose();
    },
    [onClose, patchConfig, provider, refresh],
  );

  return (
    <AdaptiveModalSheet
      header={header}
      visible={visible}
      onClose={onClose}
      desktopMaxWidth={560}
      snapPoints={RUNTIME_SNAP_POINTS}
      testID="provider-runtime-sheet"
    >
      {config ? (
        <RuntimeForm
          key={openCount}
          provider={provider}
          spec={spec}
          override={entry}
          onCancel={onClose}
          onSave={handleSave}
        />
      ) : (
        <View style={styles.loading}>
          <ThemedLoadingSpinner size="small" />
        </View>
      )}
    </AdaptiveModalSheet>
  );
}

type ProviderPatch = NonNullable<ProviderRuntimeFormState["patch"]>;

function RuntimeForm({
  provider,
  spec,
  override,
  onCancel,
  onSave,
}: {
  provider: string;
  spec: ProviderRuntimeSpec;
  override: ProviderRuntimeOverride | undefined;
  onCancel: () => void;
  onSave: (patch: ProviderPatch) => Promise<void>;
}) {
  const { t } = useTranslation();
  const isCompact = useIsCompactFormFactor();
  const size = isCompact ? "md" : "sm";
  const [model] = useState(() => openProviderRuntimeForm({ provider, spec, override }));
  useEffect(() => () => model.close(), [model]);
  const state = useSyncExternalStore(model.subscribe, model.getState, model.getState);

  const handleSave = useCallback(() => {
    const { patch } = model.getState();
    if (!patch) return;
    model.setSaveStatus({ status: "saving" });
    onSave(patch).catch((error: unknown) => {
      model.setSaveStatus({
        status: "error",
        message:
          error instanceof Error ? error.message : t("settings.providers.runtime.failedToSave"),
      });
    });
  }, [model, onSave, t]);

  const previewArgs = splitLaunchArgs(state.launchArgs);
  const primaryGroups = spec.groups.filter((group) => !group.overridesConfigFile);
  const overrideGroups = spec.groups.filter((group) => group.overridesConfigFile);
  // Overrides start open only when one is already set or invalid, so it stays visible.
  const [overridesOpen, setOverridesOpen] = useState(() =>
    overrideGroups.some((group) =>
      group.fields.some((field) => (model.getState().values[field.id] ?? "") !== ""),
    ),
  );
  const toggleOverrides = useCallback(() => setOverridesOpen((open) => !open), []);
  // A collapsed field with an error would block Save with nothing on screen to explain it.
  const overridesVisible =
    overridesOpen ||
    overrideGroups.some((group) => group.fields.some((field) => state.errors.fields[field.id]));

  return (
    <View style={styles.form}>
      <Text style={styles.notice}>{t("settings.providers.runtime.notice")}</Text>

      <Text style={styles.groupTitle}>{t("settings.providers.runtime.groups.launch")}</Text>
      <Field
        label={t("settings.providers.runtime.binaryPath")}
        hint={
          spec.defaultCommand
            ? t("settings.providers.runtime.binaryPathHint", { command: spec.defaultCommand })
            : undefined
        }
        error={formatError(t, state.errors.binaryPath)}
      >
        <FormTextInput
          size={size}
          testID="provider-runtime-binary-path"
          accessibilityLabel={t("settings.providers.runtime.binaryPath")}
          initialValue={state.binaryPath}
          onChangeText={model.setBinaryPath}
          placeholder={spec.defaultCommand ?? "/path/to/agent"}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </Field>
      <Field
        label={t("settings.providers.runtime.launchArgs")}
        hint={
          previewArgs && previewArgs.length > 0
            ? t("settings.providers.runtime.launchArgsPreview", {
                args: JSON.stringify(previewArgs),
              })
            : t("settings.providers.runtime.launchArgsHint")
        }
        error={formatError(t, state.errors.launchArgs)}
      >
        <FormTextInput
          size={size}
          testID="provider-runtime-launch-args"
          accessibilityLabel={t("settings.providers.runtime.launchArgs")}
          initialValue={state.launchArgs}
          onChangeText={model.setLaunchArgs}
          placeholder="--verbose"
          autoCapitalize="none"
          autoCorrect={false}
        />
      </Field>

      {primaryGroups.map((group) => (
        <RuntimeFieldGroupView
          key={group.id}
          group={group}
          state={state}
          model={model}
          size={size}
        />
      ))}

      {overrideGroups.length > 0 ? (
        <View style={styles.group}>
          <Button
            variant="ghost"
            size="sm"
            leftIcon={overridesVisible ? ChevronDown : ChevronRight}
            onPress={toggleOverrides}
            style={styles.disclosure}
            testID="provider-runtime-overrides-toggle"
          >
            {t("settings.providers.runtime.overridesTitle")}
          </Button>
          <Text style={styles.notice}>{t("settings.providers.runtime.overridesHint")}</Text>
          {overridesVisible
            ? overrideGroups.map((group) => (
                <RuntimeFieldGroupView
                  key={group.id}
                  group={group}
                  state={state}
                  model={model}
                  size={size}
                />
              ))
            : null}
        </View>
      ) : null}

      <View style={styles.group}>
        <View style={styles.groupHeader}>
          <Text style={styles.groupTitle}>{t("settings.providers.runtime.groups.customEnv")}</Text>
          <Button
            variant="ghost"
            size="sm"
            leftIcon={Plus}
            onPress={model.addCustomEnv}
            testID="provider-runtime-add-env"
          >
            {t("settings.providers.runtime.addEnv")}
          </Button>
        </View>
        {state.customEnv.length === 0 ? (
          <Text style={styles.notice}>{t("settings.providers.runtime.noCustomEnv")}</Text>
        ) : null}
        {state.customEnv.map((row) => (
          <CustomEnvRowInput
            key={row.rowId}
            row={row}
            error={formatError(t, state.errors.customEnv[row.rowId] ?? null)}
            model={model}
            size={size}
          />
        ))}
      </View>

      {state.save.status === "error" ? (
        <Text style={styles.errorText}>{state.save.message}</Text>
      ) : null}
      <View style={styles.actions}>
        <Button variant="secondary" onPress={onCancel} disabled={state.save.status === "saving"}>
          {t("common.actions.cancel")}
        </Button>
        <Button
          variant="default"
          onPress={handleSave}
          disabled={!state.canSave}
          loading={state.save.status === "saving"}
          testID="provider-runtime-save"
        >
          {t("settings.providers.runtime.save")}
        </Button>
      </View>
    </View>
  );
}

function RuntimeFieldGroupView({
  group,
  state,
  model,
  size,
}: {
  group: RuntimeFieldGroup;
  state: ProviderRuntimeFormState;
  model: ProviderRuntimeFormModel;
  size: "sm" | "md";
}) {
  const { t } = useTranslation();
  return (
    <View style={styles.group}>
      <Text style={styles.groupTitle}>{t(`settings.providers.runtime.groups.${group.id}`)}</Text>
      {group.fields.map((field) => (
        <RuntimeFieldInput
          key={field.id}
          field={field}
          value={state.values[field.id] ?? ""}
          error={formatError(t, state.errors.fields[field.id] ?? null)}
          model={model}
          size={size}
        />
      ))}
    </View>
  );
}

function CustomEnvRowInput({
  row,
  error,
  model,
  size,
}: {
  row: CustomEnvRow;
  error: string | null;
  model: ProviderRuntimeFormModel;
  size: "sm" | "md";
}) {
  const { t } = useTranslation();
  const { rowId } = row;
  const handleKey = useCallback(
    (value: string) => model.setCustomEnvKey(rowId, value),
    [model, rowId],
  );
  const handleValue = useCallback(
    (value: string) => model.setCustomEnvValue(rowId, value),
    [model, rowId],
  );
  const handleRemove = useCallback(() => model.removeCustomEnv(rowId), [model, rowId]);
  return (
    <View style={styles.envRow}>
      <View style={styles.inlineRow}>
        <View style={styles.envKey}>
          <FormTextInput
            size={size}
            accessibilityLabel={t("settings.providers.runtime.envKey")}
            initialValue={row.key}
            onChangeText={handleKey}
            placeholder="NAME"
            autoCapitalize="characters"
            autoCorrect={false}
          />
        </View>
        <View style={styles.envValue}>
          <FormTextInput
            size={size}
            accessibilityLabel={t("settings.providers.runtime.envValue")}
            initialValue={row.value}
            onChangeText={handleValue}
            placeholder={t("settings.providers.runtime.envValue")}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>
        <ToolbarButton
          label={t("settings.providers.runtime.removeEnv", { key: row.key })}
          onPress={handleRemove}
          testID={`provider-runtime-remove-env-${rowId}`}
        >
          <ThemedTrash />
        </ToolbarButton>
      </View>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );
}

function RuntimeFieldInput({
  field,
  value,
  error,
  model,
  size,
}: {
  field: RuntimeField;
  value: string;
  error: string | null;
  model: ProviderRuntimeFormModel;
  size: "sm" | "md";
}) {
  const { t } = useTranslation();
  const [revealed, setRevealed] = useState(false);
  const label = t(`settings.providers.runtime.fields.${field.id}.label`);
  const hint = field.hasHint ? t(`settings.providers.runtime.fields.${field.id}.hint`) : undefined;
  const target = field.target.kind === "env" ? field.target.key : `options.${field.target.key}`;
  const handleChange = useCallback(
    (next: string) => model.setFieldValue(field.id, next),
    [field.id, model],
  );
  const handleToggle = useCallback(
    (on: boolean) => model.setFieldValue(field.id, on ? "1" : ""),
    [field.id, model],
  );
  const handleReveal = useCallback(() => setRevealed((current) => !current), []);

  if (field.type === "toggle") {
    return (
      <Field label={label} hint={hint ? `${hint} (${target})` : target}>
        <Switch
          value={value !== ""}
          onValueChange={handleToggle}
          accessibilityLabel={label}
          testID={`provider-runtime-${field.id}`}
        />
      </Field>
    );
  }

  const secret = field.type === "secret";
  const multiline = field.type === "json";
  const input = (
    <FormTextInput
      size={size}
      testID={`provider-runtime-${field.id}`}
      accessibilityLabel={label}
      initialValue={value}
      onChangeText={handleChange}
      placeholder={placeholderFor(field)}
      autoCapitalize="none"
      autoCorrect={false}
      secureTextEntry={secret && !revealed}
      keyboardType={field.type === "int" ? "number-pad" : "default"}
      multiline={multiline}
      numberOfLines={multiline ? 4 : undefined}
      textAlignVertical={multiline ? "top" : undefined}
      style={multiline ? styles.multilineInput : undefined}
    />
  );
  return (
    <Field label={label} hint={hint ? `${hint} (${target})` : target} error={error}>
      {secret ? (
        <View style={styles.inlineRow}>
          <View style={styles.grow}>{input}</View>
          <ToolbarButton
            label={
              revealed
                ? t("settings.providers.runtime.hideSecret")
                : t("settings.providers.runtime.showSecret")
            }
            onPress={handleReveal}
            testID={`provider-runtime-${field.id}-reveal`}
          >
            {revealed ? <ThemedEyeOff /> : <ThemedEye />}
          </ToolbarButton>
        </View>
      ) : (
        input
      )}
    </Field>
  );
}

function placeholderFor(field: RuntimeField): string | undefined {
  switch (field.type) {
    case "url":
      return "https://";
    case "int":
      return field.min !== undefined && field.max !== undefined
        ? `${field.min} – ${field.max}`
        : undefined;
    case "json":
      return "{ }";
    case "path":
      return "~/";
    default:
      return undefined;
  }
}

function formatError(t: TFunction, error: RuntimeFieldError | null): string | null {
  if (!error) return null;
  switch (error.code) {
    case "invalidInteger":
      return t("settings.providers.runtime.errors.invalidInteger", {
        min: error.min,
        max: error.max,
      });
    default:
      return t(`settings.providers.runtime.errors.${error.code}`);
  }
}

const styles = StyleSheet.create((theme) => ({
  loading: {
    alignItems: "center",
    paddingVertical: theme.spacing[6],
  },
  form: {
    gap: theme.spacing[4],
    paddingBottom: theme.spacing[4],
  },
  group: {
    gap: theme.spacing[3],
  },
  groupHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  groupTitle: {
    marginTop: theme.spacing[2],
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.medium,
    color: theme.colors.foreground,
  },
  notice: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.foregroundMuted,
  },
  envRow: {
    gap: theme.spacing[1],
  },
  inlineRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  envKey: {
    flex: 2,
  },
  envValue: {
    flex: 3,
  },
  disclosure: {
    alignSelf: "flex-start",
    marginTop: theme.spacing[2],
    marginLeft: -theme.spacing[2],
  },
  grow: {
    flex: 1,
  },
  multilineInput: {
    minHeight: 96,
  },
  errorText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.destructive,
  },
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: theme.spacing[2],
  },
}));
