import type { PluginServerContext } from "@getzentic/plugin/server";
import { createFxProvider } from "./server/provider.js";

export default function contribute(server: PluginServerContext) {
  server.registerProvider(createFxProvider());
  return () => {};
}
