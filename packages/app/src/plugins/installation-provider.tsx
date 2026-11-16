import { getPluginClientApi } from "./client-state/api";
import { QueryClientProvider } from "@tanstack/react-query";
import {
  ZenticApiProvider,
  PluginComposersProvider,
  PluginRpcProvider,
  PluginTranslationProvider,
} from "@getzentic/plugin/client/host";
import React, { type ReactNode } from "react";
import { pluginComposersSource } from "./composer-items/source";
import type { InstalledPlugin } from "./types";

/** Every plugin surface renders under its installation: one query cache, one Zentic client, RPCs. */
export function PluginInstallationProvider({
  plugin,
  children,
}: {
  plugin: InstalledPlugin;
  children: ReactNode;
}) {
  return (
    <QueryClientProvider client={plugin.queryClient}>
      <ZenticApiProvider zentic={getPluginClientApi(plugin).zentic}>
        <PluginRpcProvider invoke={plugin.invoke} subscribe={plugin.subscribe}>
          <PluginTranslationProvider runtime={plugin.i18n}>
            <PluginComposersProvider source={pluginComposersSource(plugin)}>
              {children}
            </PluginComposersProvider>
          </PluginTranslationProvider>
        </PluginRpcProvider>
      </ZenticApiProvider>
    </QueryClientProvider>
  );
}
