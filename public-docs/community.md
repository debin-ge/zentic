---
title: Related projects
description: Projects related to Zentic and built by the community.
nav: Related projects
order: 7
category: Getting started
---

# Related projects

These projects are related to Zentic and built by the community.

## Plugins

Browse the [plugin registry](/plugins) for reviewed community plugins. To share your own, follow
[Publish a plugin](/docs/plugins/publishing) for package preparation and submission.
Plugins run unsandboxed; read their listing and source before installing.

## Tools and integrations

| Project                                                                                        | What it does                                                                                                                         |
| ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| [Zentic for VS Code](https://marketplace.visualstudio.com/items?itemName=hinnes.zentic-vscode) | Opens the matching Zentic project or worktree in VS Code and adds agent chat, file mentions, and editor links.                       |
| [VS Code Web plugin](https://github.com/itsjustanks/zentic-plugin-vscode-web)                  | Opens a live Zentic worktree in `vscode.dev` through a VS Code tunnel, including workspaces on headless hosts.                       |
| [Zentic Icon](https://github.com/gpambrozio/zentic-menubar)                                    | Shows workspace status across Zentic hosts in the macOS menu bar and opens a workspace with one click.                               |
| [Zentic Cross-Daemon Comms](https://github.com/xpufx/zentic-cross-daemon-comms)                | Lets agents communicate with agents on another Zentic daemon through an MCP server.                                                  |
| [Zentic Antigravity ACP](https://github.com/tiezbro/zentic-agy-acp)                            | Connects Google Antigravity CLI to Zentic through ACP, with Zentic-specific context, permissions, and concurrency handling.          |
| [Desvio](https://github.com/cleiter/desvio)                                                    | Rebuilds a personal fork from a set of branches, using an agent to resolve new conflicts and Git rerere to replay known resolutions. |

## Hosting and infrastructure

| Project                                                                       | What it does                                                                                                                                                               |
| ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Zentic Self-hosted](https://github.com/blockfeed/zentic-selfhosted)          | Packages the Zentic web UI and a local daemon as a Docker deployment.                                                                                                      |
| [Devbox Fleet](https://github.com/omrihaviv/devbox-fleet)                     | Provisions and maintains per-developer GCP devboxes with Zentic, coding agents, and Tailscale access.                                                                      |
| [Zentic Vercel Sandbox](https://github.com/vercel-labs/zentic-vercel-sandbox) | Creates persistent Vercel Sandboxes running a Zentic daemon with Codex, Claude Code, OpenCode, or Pi through Vercel AI Gateway. Pair each sandbox as a remote Zentic host. |
