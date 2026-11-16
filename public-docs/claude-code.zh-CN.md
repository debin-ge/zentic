---
title: Claude Code
description: 使用你现有的 Claude 套餐在 Zentic 中运行 Claude Code。
nav: Claude Code
---

# Claude Code {#claude-code}

Zentic 通过官方的 `claude` CLI，借助 Claude Agent SDK 运行 Claude Code。

## 在 Zentic 中使用 Claude Code 需要额外付费吗？ {#does-claude-code-cost-extra-in-zentic}

不需要。在 Zentic 中使用 Claude Code 计入你正常的 Claude 套餐额度，不需要单独的 Agent SDK 额度。

你仍然需要一个包含 Claude Code 的 Claude 套餐，套餐原有的用量限制同样适用。

## 开始使用 {#getting-started}

在运行 Zentic 的机器上安装并登录 Claude Code CLI。你启动 Claude Code Agent 时，Zentic 会使用这份现有的安装和账号。

如果 Claude 登录过期，请用 Claude Code CLI 重新认证，然后在 Zentic 中启动新的 Claude Code 会话。已有的 Zentic 会话保留启动时的认证，因此重新认证不会更新已经在运行的会话。

## 在 Zentic 终端中使用 Claude Code {#use-claude-code-in-the-zentic-terminal}

Claude Code 在 Zentic 终端里也很好用。如果你更喜欢标准的 CLI 体验，在工作区中打开终端，像平常一样运行 `claude` 即可。

你可以在 Zentic 的桌面端、网页端或移动端使用终端，同时保留对工作区、git 改动和其他 Zentic 工具的访问。

## 另请参阅 {#see-also}

- [支持的 Provider](/docs/supported-providers)：可以与 Claude Code 一起运行的其他 Agent。
- [自定义 Provider](/docs/custom-providers)：自定义二进制、第三方端点或多个 Claude 配置。
- [Zentic 与 Claude Desktop 对比](/alternatives/claude-desktop)：功能比较。
