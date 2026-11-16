import { PluginTranslationRuntime } from "@getzentic/plugin/client/host";
import { useZentic, useRpc } from "@getzentic/plugin/client";
import { defineRpc } from "@getzentic/plugin";
import { createZenticApi, type ZenticApi } from "@getzentic/client";
import { DaemonClient } from "@getzentic/client/internal/daemon-client";
import { QueryClient } from "@tanstack/react-query";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { z } from "zod";
import { PluginInstallationProvider } from "./installation-provider";
import type { InstalledPlugin } from "./types";

const status = defineRpc({
  name: "deploys.status",
  input: z.object({}),
  output: z.object({ state: z.string() }),
});

function installation(invoked: string[]): InstalledPlugin {
  return {
    id: "deploys",
    serverId: "host",
    clientBundle: "",
    lifetime: new AbortController(),
    locale: "en",
    i18n: new PluginTranslationRuntime({ getLocale: () => "en", subscribe: () => () => {} }),
    zentic: createZenticApi(
      new DaemonClient({
        url: "ws://127.0.0.1:1",
        clientId: "installation-provider",
        reconnect: { enabled: false },
      }),
    ),
    invoke: async (method) => {
      invoked.push(method);
      return { state: "green" };
    },
    subscribe: () => {
      throw new Error("Subscriptions are not used here");
    },
    queryClient: new QueryClient(),
    cleanup: () => undefined,
    settingsScreens: [],
    surfaces: [],
    sidebarViews: [],
    sidebarItems: { header: [], footer: [] },
    legacySidebarItems: [],
    workspaceRowBadgeItems: [],
    filePanels: [],
    composerItems: [],
    newWorkspaceItems: [],
    workspacePanels: [],
    commandCenterItems: [],
    clientSlashCommands: [],
    attachmentSources: [],
    themes: [],
    timelineTransformers: [],
    timelineRenderers: [],
  };
}

it("gives every surface the installation's client and RPCs on its first frame", async () => {
  const invoked: string[] = [];
  const plugin = installation(invoked);
  const received: ZenticApi[] = [];
  let rpc: ((input: Record<string, never>) => Promise<unknown>) | null = null;
  function Surface({ name }: { name: string }) {
    received.push(useZentic());
    rpc = useRpc(status);
    return <span>{name}</span>;
  }

  const markup = ["Screen", "Sidebar item", "Popover"]
    .map((name) =>
      renderToStaticMarkup(
        <PluginInstallationProvider plugin={plugin}>
          <Surface name={name} />
        </PluginInstallationProvider>,
      ),
    )
    .join("");

  expect(markup).toBe("<span>Screen</span><span>Sidebar item</span><span>Popover</span>");
  expect(received).toEqual([plugin.zentic, plugin.zentic, plugin.zentic]);
  expect(received.every((zentic) => zentic === plugin.zentic)).toBe(true);
  await expect(rpc!({})).resolves.toEqual({ state: "green" });
  expect(invoked).toEqual(["deploys.status"]);
  plugin.lifetime.abort();
  await plugin.zentic.dispose();
});
