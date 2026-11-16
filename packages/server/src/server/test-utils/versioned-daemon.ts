// Browser compatibility tests run a real daemon in a separate Node runtime.
//
// argv: <daemonVersion> [port] [zenticHomeRoot]
// env: ZENTIC_PLUGIN_REGISTRY, read as the real daemon reads it.
// A fixed port and a caller-owned home let a test stop this daemon and start a
// replacement under the same endpoint and serverId.
import path from "node:path";
import { createTestZenticDaemon } from "./zentic-daemon.js";

const [, , daemonVersion, portArg, zenticHomeRoot] = process.argv;
const listenPort = portArg ? Number(portArg) : 0;
if (!Number.isInteger(listenPort) || listenPort < 0) {
  throw new Error(`Invalid versioned daemon port: ${portArg ?? ""}`);
}

const daemon = await createTestZenticDaemon({
  daemonVersion,
  ...(listenPort > 0 ? { listenPort } : {}),
  ...(zenticHomeRoot
    ? {
        zenticHomeRoot,
        staticDir: path.join(zenticHomeRoot, "static"),
        // The caller removes the home so a replacement daemon keeps the same serverId.
        cleanup: false,
      }
    : {}),
  pluginsEnabled: true,
  pluginRegistryUrl: process.env.ZENTIC_PLUGIN_REGISTRY,
  mcpEnabled: false,
  corsAllowedOrigins: ["*"],
});
const response = await fetch(`http://127.0.0.1:${daemon.port}/api/status`);
const { serverId } = await response.json();
process.send?.({ port: daemon.port, serverId });
process.once("SIGTERM", async () => {
  await daemon.close();
  process.exit(0);
});
