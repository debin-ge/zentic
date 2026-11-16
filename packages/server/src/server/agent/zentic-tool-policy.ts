import type { ProviderZenticToolsPolicy } from "@getzentic/protocol/provider-config";

interface ProviderZenticToolSettings {
  zenticTools?: ProviderZenticToolsPolicy;
}

export function resolveZenticToolPolicy(
  providerId: string,
  providerSettings: Readonly<Record<string, ProviderZenticToolSettings>> | undefined,
): ProviderZenticToolsPolicy | undefined {
  return providerSettings?.[providerId]?.zenticTools;
}

export function isZenticToolEnabled(
  policy: ProviderZenticToolsPolicy | undefined,
  toolName: string,
): boolean {
  if (toolName === "speak") {
    return true;
  }
  if (!isZenticToolPolicyEnabled(policy)) {
    return false;
  }
  return !policy?.disabledTools?.includes(toolName);
}

export function isZenticToolPolicyEnabled(policy: ProviderZenticToolsPolicy | undefined): boolean {
  return policy?.enabled !== false;
}
