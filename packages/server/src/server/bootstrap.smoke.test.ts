import { resolveDaemonVersion } from "./daemon-version.js";
import os from "node:os";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import type { ChildProcess } from "node:child_process";
import type { Query } from "@anthropic-ai/claude-agent-sdk";
import { ClaudeAgentClient } from "./agent/providers/claude/agent.js";
import http from "node:http";
import path from "node:path";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import pino from "pino";
import { afterEach, describe, expect, test, vi } from "vitest";
import { WebSocket } from "ws";

import { createZenticDaemon, parseListenString, type ZenticDaemonConfig } from "./bootstrap.js";
import { loadConfig } from "./config.js";
import {
  FileBackedProjectRegistry,
  FileBackedWorkspaceRegistry,
  createPersistedProjectRecord,
  createPersistedWorkspaceRecord,
} from "./workspace-registry.js";
import { AgentStorage, type StoredAgentRecord } from "./agent/agent-storage.js";
import { ensureAgentLoaded } from "./agent/agent-loading.js";
import { AgentManagerShuttingDownError } from "./agent/agent-manager.js";
import { hashDaemonPassword } from "./auth.js";
import { generateLocalPairingOffer } from "./pairing-offer.js";
import { createTestZenticDaemon } from "./test-utils/zentic-daemon.js";
import { createTestAgentClients } from "./test-utils/fake-agent-client.js";
import { DaemonClient } from "./test-utils/daemon-client.js";
import { isPlatform } from "../test-utils/platform.js";
import { findFreePort } from "./service-proxy.js";
import {
  configureGitProcessPolicy,
  snapshotGitCommandRuntimeMetrics,
} from "../utils/run-git-command.js";
import { DEFAULT_GIT_PROCESS_POLICY } from "../utils/git-process-scheduler.js";
import type {
  HubEnrollment,
  HubEnrollmentResult,
  HubRelationshipRemote,
  HubRevocation,
  HubSocketConnection,
  HubSocketCredentials,
  HubSocketEvents,
} from "./hub/relationship-remote.js";

interface HeldAgentClose {
  started: Promise<void>;
  arm(): void;
  closeSession(): Promise<void>;
  finish(): void;
}

interface BlockedDaemonShutdown {
  probeReconnect(): Promise<WebSocketProbeResult>;
  tryCreateAgent(): Promise<"created" | "rejected">;
  finish(): Promise<void>;
}

type WebSocketProbeResult =
  | { status: "connected" }
  | { status: "rejected"; statusCode: number | null };

describe("zentic daemon bootstrap", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("starts and serves health endpoint", async () => {
    const daemonHandle = await createTestZenticDaemon({
      openai: { stt: { apiKey: "test-openai-api-key" }, tts: { apiKey: "test-openai-api-key" } },
      speech: {
        providers: {
          dictationStt: { provider: "openai", explicit: true },
          voiceStt: { provider: "openai", explicit: true },
          voiceTts: { provider: "openai", explicit: true },
        },
      },
    });
    try {
      const response = await fetch(`http://127.0.0.1:${daemonHandle.port}/api/health`, {
        headers: daemonHandle.agentMcpAuthHeader
          ? { Authorization: daemonHandle.agentMcpAuthHeader }
          : undefined,
      });
      expect(response.ok).toBe(true);
      const payload = await response.json();
      expect(payload.status).toBe("ok");
      expect(typeof payload.timestamp).toBe("string");
    } finally {
      await daemonHandle.close();
    }
  });

  test("keeps timeline activity in memory and removes obsolete timeline files at startup", async () => {
    const zenticHomeRoot = await mkdtemp(path.join(os.tmpdir(), "zentic-timeline-cleanup-"));
    const zenticHome = path.join(zenticHomeRoot, ".zentic");
    const obsoleteTimelineDirectory = path.join(zenticHome, "agent-timelines");
    const agentCwd = await mkdtemp(path.join(os.tmpdir(), "zentic-timeline-agent-"));
    await mkdir(obsoleteTimelineDirectory, { recursive: true });
    await writeFile(path.join(obsoleteTimelineDirectory, "obsolete.json"), "{}\n", "utf-8");

    const daemonHandle = await createTestZenticDaemon({ zenticHomeRoot, cleanup: false });
    try {
      await expect(access(obsoleteTimelineDirectory)).rejects.toMatchObject({ code: "ENOENT" });

      const agent = await daemonHandle.daemon.agentManager.createAgent(
        { provider: "codex", cwd: agentCwd },
        undefined,
        { workspaceId: undefined },
      );
      await daemonHandle.daemon.agentManager.appendTimelineItem(agent.id, {
        type: "assistant_message",
        text: "timeline stays in memory",
      });
      await daemonHandle.daemon.agentManager.flush();

      await expect(access(obsoleteTimelineDirectory)).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      await daemonHandle.close();
      await Promise.all([
        rm(zenticHomeRoot, { recursive: true, force: true }),
        rm(agentCwd, { recursive: true, force: true }),
      ]);
    }
  });

  test("does not create a timeline directory for live timeline activity", async () => {
    const zenticHomeRoot = await mkdtemp(path.join(os.tmpdir(), "zentic-timeline-memory-"));
    const agentCwd = await mkdtemp(path.join(os.tmpdir(), "zentic-timeline-agent-"));
    const daemonHandle = await createTestZenticDaemon({ zenticHomeRoot, cleanup: false });
    const timelineDirectory = path.join(daemonHandle.zenticHome, "agent-timelines");
    try {
      const agent = await daemonHandle.daemon.agentManager.createAgent(
        { provider: "codex", cwd: agentCwd },
        undefined,
        { workspaceId: undefined },
      );
      await daemonHandle.daemon.agentManager.appendTimelineItem(agent.id, {
        type: "assistant_message",
        text: "timeline stays in memory",
      });
      await daemonHandle.daemon.agentManager.flush();

      await expect(access(timelineDirectory)).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      await daemonHandle.close();
      await Promise.all([
        rm(zenticHomeRoot, { recursive: true, force: true }),
        rm(agentCwd, { recursive: true, force: true }),
      ]);
    }
  });

  test("reload applies live HTTP, MCP, Git, provider, relay, and app policies", async () => {
    const zenticHomeRoot = await mkdtemp(path.join(os.tmpdir(), "zentic-config-reload-runtime-"));
    const zenticHome = path.join(zenticHomeRoot, ".zentic");
    const staticDir = await mkdtemp(path.join(os.tmpdir(), "zentic-static-"));
    const agentCwd = await mkdtemp(path.join(os.tmpdir(), "zentic-config-reload-agent-"));
    await mkdir(zenticHome, { recursive: true });
    const configPath = path.join(zenticHome, "config.json");
    const initialPersisted = {
      version: 1 as const,
      daemon: {
        listen: "127.0.0.1:0",
        hostnames: ["127.0.0.1", "before.example.test"],
        cors: { allowedOrigins: ["https://before.example.test"] },
        trustedProxies: [],
        mcp: { enabled: true, injectIntoAgents: false },
        git: { maxProcessesPerSecond: 64, maxProcessConcurrency: 8 },
        relay: {
          enabled: false,
          endpoint: "127.0.0.1:9",
          publicEndpoint: "127.0.0.1:9",
          useTls: false,
          publicUseTls: false,
        },
      },
      app: { baseUrl: "https://before.example.test" },
    };
    await writeFile(configPath, `${JSON.stringify(initialPersisted, null, 2)}\n`, "utf-8");
    const config = loadConfig(zenticHome, { env: {} });
    config.staticDir = staticDir;
    config.agentClients = createTestAgentClients();
    config.agentStoragePath = path.join(zenticHome, "agents");
    config.isDev = true;
    config.speech = {
      providers: {
        dictationStt: { provider: "local", explicit: true, enabled: false },
        voiceTurnDetection: { provider: "local", explicit: true, enabled: false },
        voiceStt: { provider: "local", explicit: true, enabled: false },
        voiceTts: { provider: "local", explicit: true, enabled: false },
      },
    };
    const daemon = await createZenticDaemon(config, pino({ level: "silent" }));
    let client: DaemonClient | null = null;
    let proxyUpstream: http.Server | null = null;

    try {
      await daemon.start();
      const target = daemon.getListenTarget();
      if (!target || target.type !== "tcp") throw new Error("Expected a TCP listener");
      client = new DaemonClient({
        url: `ws://127.0.0.1:${target.port}/ws`,
        appVersion: "0.4.0",
      });
      await client.connect();

      proxyUpstream = http.createServer((req, res) => {
        res.end(String(req.headers["x-forwarded-proto"] ?? "missing"));
      });
      await new Promise<void>((resolve) => proxyUpstream?.listen(0, "127.0.0.1", resolve));
      const proxyAddress = proxyUpstream.address();
      if (!proxyAddress || typeof proxyAddress === "string") {
        throw new Error("Expected proxy upstream TCP address");
      }
      const proxyRoute = daemon.serviceProxy.registerWorkspaceService({
        workspaceId: "workspace-config-reload",
        projectSlug: "reload",
        branchName: "main",
        scriptName: "proxy",
        port: proxyAddress.port,
      });
      const proxyHost = `${proxyRoute.hostname}:${target.port}`;

      expect(
        (await httpGetWithHost(target.port, "before.example.test", "/api/health")).status,
      ).toBe(200);
      expect((await httpGetWithHost(target.port, "after.example.test", "/api/health")).status).toBe(
        403,
      );
      const beforeCors = await fetch(`http://127.0.0.1:${target.port}/api/health`, {
        headers: { Origin: "https://before.example.test" },
      });
      expect(beforeCors.headers.get("access-control-allow-origin")).toBe(
        "https://before.example.test",
      );
      const beforeMcp = await fetch(`http://127.0.0.1:${target.port}/mcp/agents`, {
        method: "POST",
      });
      expect(beforeMcp.status).toBe(406);
      const beforeProxyReload = await httpGetWithHost(target.port, proxyHost, "/", {
        "x-forwarded-proto": "https",
      });
      expect(await beforeProxyReload.text()).toBe("http");

      const reloadedPersisted = {
        ...initialPersisted,
        daemon: {
          ...initialPersisted.daemon,
          hostnames: ["127.0.0.1", "after.example.test"],
          cors: { allowedOrigins: ["https://after.example.test"] },
          trustedProxies: true as const,
          mcp: { enabled: false, injectIntoAgents: false },
          git: { maxProcessesPerSecond: 5, maxProcessConcurrency: 1 },
          relay: { ...initialPersisted.daemon.relay, enabled: true },
        },
        app: { baseUrl: "https://after.example.test" },
        agents: {
          catalogRefreshTimeoutMs: 5_000,
          providers: { codex: { enabled: false } },
        },
      };
      await writeFile(configPath, `${JSON.stringify(reloadedPersisted, null, 2)}\n`, "utf-8");

      const result = await client.reloadDaemonConfig("runtime-policies");

      expect(result).toEqual({
        requestId: "runtime-policies",
        appliedPaths: [
          "agents.catalogRefreshTimeoutMs",
          "agents.providers",
          "app.baseUrl",
          "daemon.cors.allowedOrigins",
          "daemon.git.maxProcessConcurrency",
          "daemon.git.maxProcessesPerSecond",
          "daemon.hostnames",
          "daemon.mcp.enabled",
          "daemon.relay.enabled",
          "daemon.trustedProxies",
        ],
        restartRequiredPaths: [],
        overrideControlledPaths: [],
      });
      expect(
        (await httpGetWithHost(target.port, "before.example.test", "/api/health")).status,
      ).toBe(403);
      expect((await httpGetWithHost(target.port, "after.example.test", "/api/health")).status).toBe(
        200,
      );
      const afterCors = await fetch(`http://127.0.0.1:${target.port}/api/health`, {
        headers: { Origin: "https://after.example.test" },
      });
      expect(afterCors.headers.get("access-control-allow-origin")).toBe(
        "https://after.example.test",
      );
      const afterProxyReload = await httpGetWithHost(target.port, proxyHost, "/", {
        "x-forwarded-proto": "https",
      });
      expect(await afterProxyReload.text()).toBe("https");
      await expect(
        probeWebSocketConnection(`ws://127.0.0.1:${target.port}/ws`, {
          host: "after.example.test",
          origin: "https://after.example.test",
        }),
      ).resolves.toEqual({ status: "connected" });
      await expect(
        probeWebSocketConnection(`ws://127.0.0.1:${target.port}/ws`, {
          host: "after.example.test",
          origin: "https://before.example.test",
        }),
      ).resolves.toEqual({ status: "rejected", statusCode: 403 });
      expect(
        (
          await fetch(`http://127.0.0.1:${target.port}/mcp/agents`, {
            method: "POST",
          })
        ).status,
      ).toBe(404);
      expect(snapshotGitCommandRuntimeMetrics()).toMatchObject({
        concurrencyLimit: 1,
        maxProcessesPerSecond: 5,
      });
      await expect(
        daemon.agentManager.createAgent({ provider: "codex", cwd: agentCwd }, undefined, {
          workspaceId: undefined,
        }),
      ).rejects.toThrow(/disabled/i);
      expect((await client.getDaemonStatus()).relay?.enabled).toBe(true);
      expect((await client.getDaemonPairingOffer()).url).toContain(
        "https://after.example.test/#offer=",
      );
    } finally {
      configureGitProcessPolicy(DEFAULT_GIT_PROCESS_POLICY);
      await client?.close().catch(() => undefined);
      await daemon.stop().catch(() => undefined);
      if (proxyUpstream) {
        await new Promise<void>((resolve) => proxyUpstream?.close(() => resolve()));
      }
      await Promise.all([
        rm(zenticHomeRoot, { recursive: true, force: true }),
        rm(staticDir, { recursive: true, force: true }),
        rm(agentCwd, { recursive: true, force: true }),
      ]);
    }
  });

  function httpGetWithHost(
    port: number,
    host: string,
    requestPath: string,
    headers: Record<string, string> = {},
  ): Promise<Response> {
    return new Promise((resolve, reject) => {
      const req = http.get(
        { hostname: "127.0.0.1", port, path: requestPath, headers: { host, ...headers } },
        (res) => {
          const chunks: Buffer[] = [];
          res.on("data", (chunk: Buffer) => chunks.push(chunk));
          res.on("end", () => {
            resolve(
              new Response(Buffer.concat(chunks), {
                status: res.statusCode ?? 0,
                headers: res.headers as HeadersInit,
              }),
            );
          });
        },
      );
      req.on("error", reject);
    });
  }

  test("proxies registered service hosts before daemon auth while daemon APIs stay protected", async () => {
    const upstream = http.createServer((_req, res) => {
      res.writeHead(200, { "content-type": "text/plain" });
      res.end("service-ok");
    });
    await new Promise<void>((resolve) => upstream.listen(0, "127.0.0.1", resolve));
    const address = upstream.address();
    if (!address || typeof address === "string") {
      throw new Error("Expected upstream TCP address");
    }

    const daemonHandle = await createTestZenticDaemon({
      auth: { password: hashDaemonPassword("secret") },
    });
    try {
      daemonHandle.daemon.serviceProxy.registerWorkspaceService({
        workspaceId: "workspace-service-auth",
        projectSlug: "repo",
        branchName: "main",
        scriptName: "web",
        port: address.port,
      });

      const serviceResponse = await httpGetWithHost(
        daemonHandle.port,
        `web--repo.localhost:${daemonHandle.port}`,
        "/",
      );
      expect(serviceResponse.status).toBe(200);
      expect(await serviceResponse.text()).toBe("service-ok");

      const daemonResponse = await httpGetWithHost(
        daemonHandle.port,
        `daemon.localhost:${daemonHandle.port}`,
        "/api/status",
      );
      expect(daemonResponse.status).toBe(401);
    } finally {
      await daemonHandle.close();
      await new Promise<void>((resolve) => upstream.close(() => resolve()));
    }
  });

  test("configured public service namespace misses never reach daemon APIs", async () => {
    const daemonHandle = await createTestZenticDaemon({
      serviceProxy: {
        publicBaseUrl: "https://services.example.com",
        standaloneListen: null,
      },
    });
    try {
      const response = await httpGetWithHost(
        daemonHandle.port,
        `missing.services.example.com:${daemonHandle.port}`,
        "/api/status",
      );
      expect(response.status).toBe(404);
      expect(await response.text()).toBe("404 Not Found");
    } finally {
      await daemonHandle.close();
    }
  });

  test("rolls back daemon listener when standalone service proxy startup fails", async () => {
    const occupiedServer = http.createServer((_req, res) => {
      res.end("occupied");
    });
    await new Promise<void>((resolve) => occupiedServer.listen(0, "127.0.0.1", resolve));
    const address = occupiedServer.address();
    if (!address || typeof address === "string") {
      throw new Error("Expected occupied TCP address");
    }

    const zenticHomeRoot = await mkdtemp(path.join(os.tmpdir(), "zentic-standalone-rollback-"));
    const zenticHome = path.join(zenticHomeRoot, ".zentic");
    const staticDir = await mkdtemp(path.join(os.tmpdir(), "zentic-static-"));
    await mkdir(zenticHome, { recursive: true });
    const config: ZenticDaemonConfig = {
      listen: "127.0.0.1:0",
      zenticHome,
      corsAllowedOrigins: [],
      hostnames: true,
      mcpEnabled: false,
      staticDir,
      mcpDebug: false,
      agentClients: createTestAgentClients(),
      agentStoragePath: path.join(zenticHome, "agents"),
      relayEnabled: false,
      appBaseUrl: "https://app.zentic.sh",
      openai: undefined,
      speech: undefined,
      serviceProxy: {
        standaloneListen: `127.0.0.1:${address.port}`,
      },
    };
    const daemon = await createZenticDaemon(config, pino({ level: "silent" }));

    try {
      await expect(daemon.start()).rejects.toThrow();
      await expect(fetch(`http://127.0.0.1:${daemon.port}/api/health`)).rejects.toThrow();
    } finally {
      await daemon.stop().catch(() => undefined);
      await new Promise<void>((resolve) => occupiedServer.close(() => resolve()));
      await rm(zenticHomeRoot, { recursive: true, force: true });
      await rm(staticDir, { recursive: true, force: true });
    }
  });

  test("local service namespace misses never reach daemon APIs", async () => {
    const daemonHandle = await createTestZenticDaemon({
      auth: { password: hashDaemonPassword("secret") },
    });
    try {
      const response = await httpGetWithHost(
        daemonHandle.port,
        `missing--repo.localhost:${daemonHandle.port}`,
        "/api/status",
      );
      expect(response.status).toBe(404);
      expect(await response.text()).toBe("404 Not Found");
    } finally {
      await daemonHandle.close();
    }
  });

  test("daemon websocket still upgrades when service proxy upgrade handler is mounted", async () => {
    const daemonHandle = await createTestZenticDaemon();
    const ws = new WebSocket(`ws://127.0.0.1:${daemonHandle.port}/ws`);
    try {
      await new Promise<void>((resolve, reject) => {
        ws.once("open", resolve);
        ws.once("error", reject);
      });
      expect(ws.readyState).toBe(WebSocket.OPEN);
    } finally {
      ws.close();
      await daemonHandle.close();
    }
  });

  test("relay config changes during Hub enrollment reach the live runtime", async () => {
    const zenticHomeRoot = await mkdtemp(path.join(os.tmpdir(), "zentic-relay-startup-"));
    const zenticHome = path.join(zenticHomeRoot, ".zentic");
    const staticDir = await mkdtemp(path.join(os.tmpdir(), "zentic-static-"));
    await mkdir(zenticHome, { recursive: true });
    await writeFile(
      path.join(zenticHome, "hub-relationship.json"),
      `${JSON.stringify({
        version: 1,
        state: "pending",
        relationship: {
          daemonId: "daemon-startup-race",
          idempotencyKey: "enrollment-startup-race",
          hubOrigin: "https://hub.test",
          createdAt: "2026-07-31T00:00:00.000Z",
          scopes: ["hub.execution.*"],
        },
        credential: { secret: "credential" },
        enrollment: { token: "enrollment-token" },
        identity: { serverId: "server-startup-race", daemonPublicKey: "public-key" },
      })}\n`,
      "utf-8",
    );

    let markEnrollmentStarted: () => void = () => undefined;
    const enrollmentStarted = new Promise<void>((resolve) => {
      markEnrollmentStarted = resolve;
    });
    let releaseEnrollment: () => void = () => undefined;
    const enrollmentReleased = new Promise<void>((resolve) => {
      releaseEnrollment = resolve;
    });
    const remote: HubRelationshipRemote = {
      async enroll(input: HubEnrollment): Promise<HubEnrollmentResult> {
        markEnrollmentStarted();
        await enrollmentReleased;
        return {
          daemonId: input.daemonId,
          permissions: input.permissions,
          webSocketUrl: "wss://hub.test/daemon",
        };
      },
      async updatePermissions(input) {
        return { permissions: input.permissions };
      },
      async revoke(_input: HubRevocation): Promise<void> {},
      openSocket(_input: HubSocketCredentials, _events: HubSocketEvents): HubSocketConnection {
        return { close: () => undefined };
      },
    };
    const config: ZenticDaemonConfig = {
      listen: "127.0.0.1:0",
      zenticHome,
      corsAllowedOrigins: [],
      hostnames: true,
      mcpEnabled: false,
      staticDir,
      mcpDebug: false,
      agentClients: createTestAgentClients(),
      agentStoragePath: path.join(zenticHome, "agents"),
      relayEnabled: false,
      relayEndpoint: "127.0.0.1:9",
      relayUseTls: false,
      appBaseUrl: "https://app.zentic.sh",
      openai: undefined,
      speech: undefined,
    };
    const daemon = await createZenticDaemon(config, pino({ level: "silent" }), {
      hubRelationshipRemote: remote,
    });
    const starting = daemon.start();
    let client: DaemonClient | null = null;

    try {
      await enrollmentStarted;
      const listenTarget = daemon.getListenTarget();
      if (!listenTarget || listenTarget.type !== "tcp") {
        throw new Error("Expected daemon TCP listener during Hub enrollment");
      }
      client = new DaemonClient({
        url: `ws://127.0.0.1:${listenTarget.port}/ws`,
        appVersion: "0.1.82",
      });
      await client.connect();
      await client.patchDaemonConfig({ relay: { enabled: true } });
      releaseEnrollment();
      await starting;

      const status = await client.getDaemonStatus();
      expect(status.relay?.enabled).toBe(true);
    } finally {
      releaseEnrollment();
      await starting.catch(() => undefined);
      await client?.close().catch(() => undefined);
      await daemon.stop().catch(() => undefined);
      await rm(zenticHomeRoot, { recursive: true, force: true });
      await rm(staticDir, { recursive: true, force: true });
    }
  });

  test("stops new connections and agent registrations before closing agents", async () => {
    const shutdown = await beginDaemonShutdownWithAgentClosing();
    try {
      await expect(
        Promise.all([shutdown.probeReconnect(), shutdown.tryCreateAgent()]),
      ).resolves.toEqual([{ status: "rejected", statusCode: 503 }, "rejected"]);
    } finally {
      await shutdown.finish();
    }
  });

  test("standalone listener exposes services only", async () => {
    const standalonePort = await findFreePort();
    const upstream = http.createServer((_req, res) => {
      res.end("service-ok");
    });
    await new Promise<void>((resolve) => upstream.listen(0, "127.0.0.1", resolve));
    const upstreamAddress = upstream.address();
    if (!upstreamAddress || typeof upstreamAddress === "string") {
      throw new Error("Expected upstream TCP address");
    }

    const daemonHandle = await createTestZenticDaemon({
      serviceProxy: { standaloneListen: `127.0.0.1:${standalonePort}` },
    });
    try {
      daemonHandle.daemon.serviceProxy.registerWorkspaceService({
        workspaceId: "workspace-standalone",
        projectSlug: "repo",
        branchName: "main",
        scriptName: "web",
        port: upstreamAddress.port,
      });

      const serviceResponse = await httpGetWithHost(
        standalonePort,
        `web--repo.localhost:${standalonePort}`,
        "/",
      );
      expect(serviceResponse.status).toBe(200);
      expect(await serviceResponse.text()).toBe("service-ok");

      for (const requestPath of ["/api/health", "/ws", "/mcp/agents", "/index.html", "/files/x"]) {
        const response = await httpGetWithHost(
          standalonePort,
          `daemon.localhost:${standalonePort}`,
          requestPath,
        );
        expect(response.status).toBe(404);
      }
    } finally {
      await daemonHandle.close();
      await new Promise<void>((resolve) => upstream.close(() => resolve()));
    }
  });

  test("rolls back standalone listener without starting plugins when main listen fails", async () => {
    const mainPort = await findFreePort();
    const occupiedMain = http.createServer((_req, res) => {
      res.end("occupied-main");
    });
    await new Promise<void>((resolve) => occupiedMain.listen(mainPort, "127.0.0.1", resolve));
    const standalonePort = await findFreePort();

    const zenticHomeRoot = await mkdtemp(path.join(os.tmpdir(), "zentic-main-rollback-"));
    const zenticHome = path.join(zenticHomeRoot, ".zentic");
    const staticDir = await mkdtemp(path.join(os.tmpdir(), "zentic-static-"));
    const pluginDirectory = path.join(zenticHomeRoot, "plugin");
    const pluginPidPath = path.join(pluginDirectory, "plugin.pid");
    await mkdir(zenticHome, { recursive: true });
    if (!isPlatform("win32")) {
      await mkdir(pluginDirectory);
      await writeFile(
        path.join(pluginDirectory, "zentic-plugin.json"),
        JSON.stringify({
          id: "startup-rollback",
          requirements: { zentic: `>=${resolveDaemonVersion(import.meta.url)}` },
        }),
      );
      await writeFile(
        path.join(pluginDirectory, "index.server.ts"),
        `import { writeFileSync } from "node:fs";
export default function contribute(plugin: unknown) {
  void plugin;
  writeFileSync(${JSON.stringify(pluginPidPath)}, String(process.pid));
}`,
      );
    }
    const config: ZenticDaemonConfig = {
      listen: `127.0.0.1:${mainPort}`,
      zenticHome,
      corsAllowedOrigins: [],
      hostnames: true,
      mcpEnabled: false,
      staticDir,
      mcpDebug: false,
      agentClients: createTestAgentClients(),
      agentStoragePath: path.join(zenticHome, "agents"),
      relayEnabled: false,
      appBaseUrl: "https://app.zentic.sh",
      openai: undefined,
      speech: undefined,
      serviceProxy: { standaloneListen: `127.0.0.1:${standalonePort}` },
      pluginsEnabled: !isPlatform("win32"),
      plugins: isPlatform("win32")
        ? {}
        : { "startup-rollback": { source: "directory", path: pluginDirectory } },
    };
    const daemon = await createZenticDaemon(config, pino({ level: "silent" }));

    try {
      await expect(daemon.start()).rejects.toThrow();
      await expect(fetch(`http://127.0.0.1:${standalonePort}/api/health`)).rejects.toThrow();
      if (!isPlatform("win32")) {
        await expect(readFile(pluginPidPath, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
      }
    } finally {
      await daemon.stop().catch(() => undefined);
      await new Promise<void>((resolve) => occupiedMain.close(() => resolve()));
      await rm(zenticHomeRoot, { recursive: true, force: true });
      await rm(staticDir, { recursive: true, force: true });
    }
  });

  test("redacts Agent MCP debug request credentials and bodies", async () => {
    const logLines: string[] = [];
    const logger = pino(
      { level: "debug" },
      {
        write: (line: string) => {
          logLines.push(line);
        },
      },
    );
    const daemonHandle = await createTestZenticDaemon({
      logger,
      mcpDebug: true,
    });

    try {
      const response = await fetch(`http://127.0.0.1:${daemonHandle.port}/mcp/agents`, {
        method: "POST",
        headers: {
          Authorization: "Bearer secret-debug-token",
          Accept: "application/json, text/event-stream",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: {
            apiKey: "secret-body-token",
          },
        }),
      });

      await response.text();
      const logs = logLines.join("\n");
      expect(logs).toContain("Agent MCP request");
      expect(logs).toContain("[redacted]");
      expect(logs).toContain('"method":"tools/call"');
      expect(logs).toContain('"hasParams":true');
      expect(logs).not.toContain("secret-debug-token");
      expect(logs).not.toContain("secret-body-token");
      expect(logs).not.toContain("apiKey");
    } finally {
      await daemonHandle.close();
    }
  });

  test("starts when OpenAI speech provider is configured without credentials", async () => {
    const zenticHomeRoot = await mkdtemp(path.join(os.tmpdir(), "zentic-openai-config-"));
    const zenticHome = path.join(zenticHomeRoot, ".zentic");
    const staticDir = await mkdtemp(path.join(os.tmpdir(), "zentic-static-"));
    await mkdir(zenticHome, { recursive: true });

    const config: ZenticDaemonConfig = {
      listen: "127.0.0.1:0",
      zenticHome,
      corsAllowedOrigins: [],
      hostnames: true,
      mcpEnabled: false,
      staticDir,
      mcpDebug: false,
      agentClients: createTestAgentClients(),
      agentStoragePath: path.join(zenticHome, "agents"),
      relayEnabled: false,
      appBaseUrl: "https://app.zentic.sh",
      openai: undefined,
      speech: {
        providers: {
          dictationStt: { provider: "openai", explicit: true },
          voiceStt: { provider: "openai", explicit: true },
          voiceTts: { provider: "openai", explicit: true },
        },
      },
    };

    try {
      const daemon = await createZenticDaemon(config, pino({ level: "silent" }));
      try {
        await daemon.start();
        expect(daemon.getListenTarget()).toBeDefined();
        // Must also stop without throwing
      } finally {
        await daemon.stop();
      }
    } finally {
      await rm(zenticHomeRoot, { recursive: true, force: true });
      await rm(staticDir, { recursive: true, force: true });
    }
  });

  test("does not block daemon start on local speech model downloads", async () => {
    const originalFetch = globalThis.fetch;
    let releaseFetch: ((value: Response) => void) | null = null;
    const fetchGate = new Promise<Response>((resolve) => {
      releaseFetch = resolve;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(() => fetchGate),
    );

    const daemonHandle = await createTestZenticDaemon({
      speech: {
        providers: {
          dictationStt: { provider: "local", explicit: true, enabled: true },
          voiceTurnDetection: { provider: "local", explicit: true, enabled: false },
          voiceStt: { provider: "local", explicit: true, enabled: false },
          voiceTts: { provider: "local", explicit: true, enabled: false },
        },
        local: {
          modelsDir: path.join(os.tmpdir(), `zentic-missing-models-${Date.now()}`),
          models: {
            dictationStt: "parakeet-tdt-0.6b-v2-int8",
            voiceStt: "parakeet-tdt-0.6b-v2-int8",
            voiceTts: "kokoro-en-v0_19",
          },
        },
      },
    });

    try {
      const response = await originalFetch(`http://127.0.0.1:${daemonHandle.port}/api/health`);
      expect(response.ok).toBe(true);
    } finally {
      releaseFetch?.(
        new Response(null, {
          status: 500,
          statusText: "test cleanup",
        }),
      );
      vi.unstubAllGlobals();
      globalThis.fetch = originalFetch;
      await daemonHandle.close();
    }
  });

  test("parses whitespace-padded numeric port strings", () => {
    expect(parseListenString(" 6767 ")).toEqual({
      type: "tcp",
      host: "127.0.0.1",
      port: 6767,
    });
  });

  test("parses IPv6 listen targets correctly", () => {
    expect(parseListenString("[::1]:6767")).toEqual({
      type: "tcp",
      host: "::1",
      port: 6767,
    });
    expect(parseListenString("[::]:6767")).toEqual({
      type: "tcp",
      host: "::",
      port: 6767,
    });
  });

  test("rejects Windows absolute paths that are not named pipes", () => {
    // A Windows drive path like C:\daemon must NOT be silently parsed as TCP
    // (split(":") would yield host="C" and port="\\daemon" which is nonsensical).
    expect(() => parseListenString(String.raw`C:\daemon`)).toThrow();
    expect(() => parseListenString(String.raw`D:\Users\foo\.zentic\daemon.sock`)).toThrow();
    // Single-letter "host" with no valid port is not a valid listen string
    expect(() => parseListenString(String.raw`C:\some\path`)).toThrow();
  });

  test("parses Windows named pipes as managed IPC listen targets", () => {
    expect(parseListenString(String.raw`\\.\pipe\zentic-managed-test`)).toEqual({
      type: "pipe",
      path: String.raw`\\.\pipe\zentic-managed-test`,
    });
    expect(parseListenString(`pipe://${String.raw`\\.\pipe\zentic-managed-test`}`)).toEqual({
      type: "pipe",
      path: String.raw`\\.\pipe\zentic-managed-test`,
    });
  });

  // POSIX-only: Unix socket listen paths are invalid Windows listen targets.
  test.skipIf(isPlatform("win32"))(
    "generates a relay pairing offer for unix socket listeners",
    async () => {
      const zenticHomeRoot = await mkdtemp(path.join(os.tmpdir(), "zentic-socket-relay-"));
      const zenticHome = path.join(zenticHomeRoot, ".zentic");
      const staticDir = await mkdtemp(path.join(os.tmpdir(), "zentic-static-"));
      const socketPath = path.join(zenticHomeRoot, "run", "zentic.sock");
      await mkdir(path.dirname(socketPath), { recursive: true });
      await mkdir(zenticHome, { recursive: true });
      const logger = pino({ level: "silent" });

      const config: ZenticDaemonConfig = {
        listen: socketPath,
        zenticHome,
        corsAllowedOrigins: [],
        hostnames: true,
        mcpEnabled: false,
        staticDir,
        mcpDebug: false,
        agentClients: createTestAgentClients(),
        agentStoragePath: path.join(zenticHome, "agents"),
        relayEnabled: true,
        relayEndpoint: "127.0.0.1:9",
        relayPublicEndpoint: "127.0.0.1:9",
        appBaseUrl: "https://app.zentic.sh",
        openai: undefined,
        speech: undefined,
      };

      const daemon = await createZenticDaemon(config, logger);

      try {
        await daemon.start();
        const pairing = await generateLocalPairingOffer({
          zenticHome,
          relayEnabled: true,
          relayEndpoint: "127.0.0.1:9",
          relayPublicEndpoint: "127.0.0.1:9",
          appBaseUrl: "https://app.zentic.sh",
          includeQr: false,
        });
        expect(pairing.relayEnabled).toBe(true);
        expect(pairing.url?.startsWith("https://app.zentic.sh/#offer=")).toBe(true);
      } finally {
        await daemon.stop().catch(() => undefined);
        await daemon.agentManager.flush().catch(() => undefined);
        await rm(zenticHomeRoot, { recursive: true, force: true });
        await rm(staticDir, { recursive: true, force: true });
      }
    },
  );
});

function holdAgentClose(): HeldAgentClose {
  let armed = false;
  let markStarted = () => {};
  let finish = () => {};
  const started = new Promise<void>((resolve) => {
    markStarted = resolve;
  });
  const finished = new Promise<void>((resolve) => {
    finish = resolve;
  });
  return {
    started,
    arm() {
      armed = true;
    },
    async closeSession() {
      if (!armed) {
        return;
      }
      markStarted();
      await finished;
    },
    finish: () => finish(),
  };
}

async function beginDaemonShutdownWithAgentClosing(): Promise<BlockedDaemonShutdown> {
  const heldAgentClose = holdAgentClose();
  const daemonHandle = await createTestZenticDaemon({
    cleanup: false,
    agentClients: createTestAgentClients({ closeSession: heldAgentClose.closeSession }),
  });
  const agentCwd = await mkdtemp(path.join(os.tmpdir(), "zentic-shutdown-agent-"));
  await daemonHandle.daemon.agentManager.createAgent(
    {
      provider: "codex",
      cwd: agentCwd,
    },
    undefined,
    { workspaceId: undefined },
  );

  heldAgentClose.arm();
  const stopPromise = daemonHandle.daemon.stop();
  await heldAgentClose.started;

  return {
    probeReconnect: () => probeWebSocketConnection(`ws://127.0.0.1:${daemonHandle.port}/ws`),
    async tryCreateAgent() {
      try {
        await daemonHandle.daemon.agentManager.createAgent(
          {
            provider: "codex",
            cwd: agentCwd,
          },
          undefined,
          { workspaceId: undefined },
        );
        return "created";
      } catch (error) {
        if (error instanceof AgentManagerShuttingDownError) {
          return "rejected";
        }
        throw error;
      }
    },
    async finish() {
      heldAgentClose.finish();
      await stopPromise;
      await daemonHandle.daemon.agentManager.flush().catch(() => undefined);
      await Promise.all([
        rm(path.dirname(daemonHandle.zenticHome), { recursive: true, force: true }),
        rm(daemonHandle.staticDir, { recursive: true, force: true }),
        rm(agentCwd, { recursive: true, force: true }),
      ]);
    },
  };
}

function probeWebSocketConnection(
  url: string,
  headers?: { host?: string; origin?: string },
): Promise<WebSocketProbeResult> {
  const ws = new WebSocket(url, {
    headers: {
      ...(headers?.host ? { Host: headers.host } : {}),
      ...(headers?.origin ? { Origin: headers.origin } : {}),
    },
  });
  return new Promise((resolve) => {
    ws.once("open", () => {
      ws.close();
      resolve({ status: "connected" });
    });
    ws.once("error", () => resolve({ status: "rejected", statusCode: null }));
    ws.once("unexpected-response", (_request, response) => {
      response.resume();
      resolve({ status: "rejected", statusCode: response.statusCode ?? null });
    });
  });
}

test("disabled recovery closes stale active records without resuming sessions", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "zentic-stale-status-"));
  const logger = pino({ level: "silent" });
  const storagePath = path.join(root, ".zentic", "agents");
  const storage = new AgentStorage(storagePath, logger);
  const timestamp = "2025-01-01T00:00:00.000Z";
  const registryDir = path.join(root, ".zentic", "projects");
  await new FileBackedProjectRegistry(path.join(registryDir, "projects.json"), logger).upsert(
    createPersistedProjectRecord({
      projectId: "existing-project",
      rootPath: root,
      kind: "non_git",
      displayName: "Existing",
      createdAt: timestamp,
      updatedAt: timestamp,
    }),
  );
  await new FileBackedWorkspaceRegistry(path.join(registryDir, "workspaces.json"), logger).upsert(
    createPersistedWorkspaceRecord({
      workspaceId: "existing-workspace",
      projectId: "existing-project",
      cwd: root,
      kind: "directory",
      displayName: "Existing",
      createdAt: timestamp,
      updatedAt: timestamp,
    }),
  );
  const records: StoredAgentRecord[] = ["running", "initializing", "idle", "error", "closed"].map(
    (status, index) => ({
      id: randomUUID(),
      workspaceId: "existing-workspace",
      provider: "codex",
      cwd: root,
      createdAt: "2025-01-01T00:00:00.000Z",
      updatedAt: "2025-01-02T00:00:00.000Z",
      lastActivityAt: "2025-01-02T00:00:00.000Z",
      lastStatus: status as StoredAgentRecord["lastStatus"],
      title: `Keep ${status}`,
      labels: { "zentic.parent-agent-id": "parent", custom: "keep" },
      metadata: {},
      persistence: { provider: "codex", sessionId: `session-${index}` },
      config: { modeId: "full-access" },
      requiresAttention: true,
      attentionReason: "permission",
      attentionTimestamp: "2025-01-02T00:00:00.000Z",
      archivedAt: index === 1 ? "2025-01-03T00:00:00.000Z" : null,
    }),
  );
  for (const record of records) await storage.upsert(record);
  let sessionsCreated = 0;
  const handle = await createTestZenticDaemon({
    zenticHomeRoot: root,
    resumeOnStartup: false,
    agentClients: createTestAgentClients({
      beforeCreateSession: async () => {
        sessionsCreated++;
      },
    }),
  });
  const client = new DaemonClient({ url: `ws://127.0.0.1:${handle.port}/ws` });
  try {
    const expected = records.map((record) => ({
      ...record,
      resumeOnStartup: false,
      lastStatus:
        record.lastStatus === "running" || record.lastStatus === "initializing"
          ? "closed"
          : record.lastStatus,
    }));
    expect(
      (await handle.daemon.agentStorage.listAll()).sort((a, b) => a.id.localeCompare(b.id)),
    ).toEqual(expected.sort((a, b) => a.id.localeCompare(b.id)));
    // A fresh reader proves the repaired states were written, rather than projected only in memory.
    expect(
      (await new AgentStorage(storagePath, logger).listAll()).sort((a, b) =>
        a.id.localeCompare(b.id),
      ),
    ).toEqual(expected);
    expect(handle.daemon.agentManager.listAgents()).toEqual([]);
    expect(sessionsCreated).toBe(0);
    await client.connect();
    const snapshot = await client.fetchAgents({ filter: { includeArchived: true } });
    expect(
      Object.fromEntries(snapshot.entries.map((entry) => [entry.agent.id, entry.agent.status])),
    ).toEqual(Object.fromEntries(expected.map((record) => [record.id, record.lastStatus])));
    const opened = await ensureAgentLoaded(records[0]!.id, {
      agentManager: handle.daemon.agentManager,
      agentStorage: handle.daemon.agentStorage,
      logger,
    });
    expect(opened.id).toBe(records[0]!.id);
    expect(opened.persistence?.sessionId).toBe("session-0");
    expect(opened.lifecycle).toBe("idle");
    await handle.daemon.agentManager.runAgent(opened.id, "hello");
    expect(handle.daemon.agentManager.getAgent(opened.id)?.lifecycle).toBe("idle");
  } finally {
    await client.close();
    await handle.close();
  }
}, 30_000);

test.each(["reject", "stall"] as const)(
  "shutdown closes Claude and its process despite a %s peer and stalled SDK handshake",
  async (failure) => {
    let child: ChildProcess | undefined;
    let ready!: () => void;
    const processReady = new Promise<void>((resolve) => {
      ready = resolve;
    });
    let finishStream!: () => void;
    const streamFinished = new Promise<void>((resolve) => {
      finishStream = resolve;
    });
    const never = new Promise<never>(() => {});
    const claude = new ClaudeAgentClient({
      logger: pino({ level: "silent" }),
      resolveBinary: async () => process.execPath,
      queryFactory: ({ options }) => {
        child = options.spawnClaudeCodeProcess!({
          command: process.execPath,
          args: [
            "-e",
            "process.on('SIGTERM', () => {}); console.log('ready'); setInterval(() => {}, 1000)",
          ],
          cwd: process.cwd(),
          env: process.env,
          signal: new AbortController().signal,
        }) as ChildProcess;
        child.stdout!.once("data", ready);
        let initialized = false;
        // An injected SDK adapter leaves an active turn and both close requests unanswered.
        return {
          async next() {
            if (!initialized) {
              initialized = true;
              return {
                done: false,
                value: {
                  type: "system",
                  subtype: "init",
                  session_id: "shutdown-session",
                  permissionMode: "default",
                },
              };
            }
            await streamFinished;
            return { done: true, value: undefined };
          },
          interrupt: () => never,
          return: () => never,
          close() {},
          async supportedModels() {
            return [];
          },
          async supportedCommands() {
            return [];
          },
          async setPermissionMode() {},
          async setModel() {},
          async applyFlagSettings() {},
          [Symbol.asyncIterator]() {
            return this;
          },
        } as Query;
      },
    });
    let armed = false;
    let peerRunning!: () => void;
    const peerReady = new Promise<void>((resolve) => {
      peerRunning = resolve;
    });
    const peers = createTestAgentClients({
      beforeTurnComplete: async () => {
        peerRunning();
        await streamFinished;
      },
      closeSession: async () => {
        if (!armed) return;
        if (failure === "reject") throw new Error("peer close rejected");
        await never;
      },
    });
    const handle = await createTestZenticDaemon({ agentClients: { claude, codex: peers.codex } });
    let stopped = false;
    let run: Promise<unknown> | undefined;
    let peerRun: Promise<unknown> | undefined;
    try {
      const agent = await handle.daemon.agentManager.createAgent(
        { provider: "claude", cwd: handle.zenticHome },
        undefined,
        { workspaceId: undefined },
      );
      run = handle.daemon.agentManager.runAgent(agent.id, "keep working").catch(() => undefined);
      await processReady;
      expect(handle.daemon.agentManager.getAgent(agent.id)?.lifecycle).toBe("running");
      const peer = await handle.daemon.agentManager.createAgent(
        { provider: "codex", cwd: handle.zenticHome, modeId: "full-access" },
        undefined,
        { workspaceId: undefined },
      );
      peerRun = handle.daemon.agentManager.runAgent(peer.id, "keep working").catch(() => undefined);
      await peerReady;
      armed = true;
      await handle.daemon.stop();
      stopped = true;
      // Windows taskkill is forceful on the first signal; POSIX escalates after SIGTERM.
      expect(child!.exitCode !== null || child!.signalCode !== null).toBe(true);
      expect((await handle.daemon.agentStorage.get(agent.id))?.lastStatus).toBe("closed");
      expect(handle.daemon.agentManager.getAgent(agent.id)).toBeNull();
      expect((await handle.daemon.agentStorage.get(peer.id))?.lastStatus).toBe("running");
    } finally {
      finishStream();
      if (child && child.exitCode === null && child.signalCode === null) {
        const exited = once(child, "exit");
        child.kill("SIGKILL");
        await exited;
      }
      if (!stopped) await handle.daemon.stop();
      await Promise.all([run, peerRun]);
      await rm(path.dirname(handle.zenticHome), { recursive: true, force: true });
      await rm(handle.staticDir, { recursive: true, force: true });
    }
  },
  30_000,
);
