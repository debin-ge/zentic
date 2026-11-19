# Zentic 服务端（daemon）远程部署（Docker，源码构建）

在一台远程服务器上跑一个 `zentic` 容器：daemon 主动连出到你已部署的 relay，手机或桌面端通过 relay 连接它。**不需要开放任何入站端口**，容器的 6767 只绑定在服务器的 `127.0.0.1`。

官方镜像 `ghcr.io/debin-ge/zentic` 不能匿名拉取，所以镜像在服务器上用本仓库源码构建，分两层：

1. `zentic-base`：官方 daemon 镜像（`docker/base/Dockerfile`），不含任何 agent CLI。
2. `zentic`：在它之上用 `Dockerfile.agents` 装 agent CLI（默认 `claude`、`codex`、`opencode`），这才是实际运行的镜像。

daemon 的通用说明（卷、环境变量、故障排查）见 `docs/docker.md`，这里只写远程部署特有的部分。

## 前提

- 一台 Linux 服务器，已装 Docker 和较新的 Compose v2 插件（本文流程在 Compose v5.6.0 上验证）。
- 已部署好 relay，并知道它的 `域名:443`。
- 服务器能访问外网：Docker Hub（`node:22-bookworm-slim`）、npm registry、Debian 软件源。网络受限时这三处都需要自备镜像源。
- **构建需要大内存。** Dockerfile 把 Node 堆上限设为 6144 MiB，建议构建时至少有 8 GB 可用内存（含 swap）。这是按该上限推断的，没有测过峰值；内存不足会在打包阶段失败，调整方法见 `docs/docker.md` 的 “Building Locally”。运行时很省：空闲约 320 MiB。
- 构建耗时：在 8 核、12 GB 的本机上约 18 分钟（`npm ci` 约 6 分钟，打包和 Web 导出约 11 分钟，装 agent CLI 约 1.5 分钟）。官方 Dockerfile 在 `npm ci` 之前就 `COPY . .`，仓库里任何文件有变化，这几步都会重新执行，所以每次升级的构建时间都和首次相当；只有源码完全没变时才会命中缓存。

## 1. 把代码放到服务器

先把 `docker/deploy/` 提交并推送（推到分支即可），然后在服务器上克隆仓库（仓库可匿名克隆）：

```bash
git clone https://github.com/debin-ge/zentic.git
```

推送到了分支，就加上 `--branch <分支名>`。

不要用 rsync 把本地目录整个同步过去：本地工作区里有大量未跟踪的内容，包括本机构建出的桌面应用产物（约 450 MB）、缓存和根目录的 `.env`，rsync 不认 `.gitignore`，会把它们一起传到服务器。

## 2. 配置并构建启动

进入服务器上的 `zentic/docker/deploy/` 目录：

```bash
cp .env.example .env
```

编辑 `.env`，至少改这两项：

- `ZENTIC_PASSWORD`：用一个长随机值。relay 客户端会在加密的握手里发送它，所以即使端口不公开也必须设置；没设置时 compose 会直接报错。字面量的 `$` 要写成 `$$`。
- `RELAY_ENDPOINT`：你的 relay，格式 `域名:443`。

然后构建并启动：

```bash
docker compose up -d --build
```

## 3. 验证

```bash
docker compose ps
```

`zentic` 应显示 `healthy`。再在服务器上访问健康检查：

```bash
curl http://127.0.0.1:6767/api/health
```

期望返回 `{"status":"ok",...}`。确认已经连上 relay，日志里应有 `relay_control_connected`：

```bash
docker compose logs zentic | grep relay_control_connected
```

## 4. 登录 agent

镜像里只装了 CLI，还没有登录。登录状态保存在 `zentic_home` 卷里，重启后依然有效：

```bash
docker compose exec --user zentic zentic claude
```

其他 agent 同理，把命令换成 `codex` 或 `opencode`。

也可以改用 API key：在 `docker-compose.yml` 的 `environment` 里加上 `ANTHROPIC_API_KEY`、`OPENAI_API_KEY` 等，Zentic 会把它们传给启动的 agent。

## 5. 配对

```bash
docker compose exec --user zentic zentic zentic daemon pair
```

它会打印二维码和配对链接。用手机上的 Zentic 扫码，或选择 **Paste pairing link** 粘贴链接。链接里带着你的 relay 地址和 daemon 的公钥。需要脚本化时加 `--json`。

daemon 的身份（`serverId` 和公钥）保存在 `zentic_home` 卷里。重启或重建容器后链接不变，已配对的设备不用重新配对。

## 访问 Web UI 或用 CLI

端口只绑定了回环，用 SSH 隧道转发。本机的 6767 通常已被本机的 daemon 占用，所以示例把本地端口设为 16767：

```bash
ssh -L 16767:127.0.0.1:6767 user@your-server
```

保持隧道打开，浏览器访问 `http://localhost:16767`，输入 `ZENTIC_PASSWORD`。未带密码的 API 请求会返回 401，只有 `/api/health` 和静态页面是公开的。

## 日常运维

查看日志：

```bash
docker compose logs -f zentic
```

**升级：** 先给当前镜像留一个回滚标签：

```bash
docker tag zentic:server zentic:previous
```

再更新服务器上的代码（在仓库根目录 `git pull`，或按第 1 步重新同步），然后在 `docker/deploy/` 里重新构建并重启：

```bash
docker compose up -d --build
```

**回滚：** 把标签改回去，不重新构建直接重建容器：

```bash
docker tag zentic:previous zentic:server && docker compose up -d --no-build
```

**数据：** `zentic_home` 卷保存 daemon 身份、agent 登录和状态。`docker compose down` 是安全的，**不要加 `-v`**，否则身份丢失，所有设备都要重新配对。代码放在 `ZENTIC_WORKSPACE`（默认 `docker/deploy/workspace/`），agent 能读写这里和 `zentic_home` 里的一切，容器本身就是隔离边界。

## 不在这里的内容

- 通过公网域名直接访问 daemon（不经 relay）需要自己加反向代理，并设置 `ZENTIC_HOSTNAMES`，见 `docs/docker.md` 的 “Reverse Proxies”。这套配置不涉及。
- 官方镜像发布流程和多架构说明见 `docs/docker.md`。
