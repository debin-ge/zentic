# Running Zentic in Docker

Zentic publishes a container image for running the daemon on a server, VM, NAS,
or homelab box. The image also serves the bundled browser web UI, so one
container gives you both the daemon API and a self-hosted UI.

The image source lives in [`docker/`](../docker/).

## How it works

The official image:

- builds `@getzentic/server` and `@getzentic/cli` from source-built workspace tarballs
- runs the daemon as the non-root `zentic` user
- listens on `0.0.0.0:6767` inside the container
- enables the bundled daemon web UI with `ZENTIC_WEB_UI_ENABLED=true`
- stores daemon state and agent credentials under `/home/zentic`
- leaves agent CLIs out of the base image

Open the container's HTTP origin, for example `http://localhost:6767`, to load
the web UI. The served app receives a same-origin connection hint and connects
back to that daemon. Static UI files load without daemon auth; API and
WebSocket requests still require `ZENTIC_PASSWORD` when one is configured.

Host-side CLI commands select the container explicitly, for example `zentic project ls --host 127.0.0.1:6767`. Without an endpoint selector the CLI looks for a local home’s supervisor. Container environment settings are deployment overrides; worker restart preserves them. Your container manager owns full supervisor replacement.

## Quick Start

```bash
docker run -d --name zentic \
  -p 6767:6767 \
  -e ZENTIC_PASSWORD=change-me \
  -v "$PWD/zentic-home:/home/zentic" \
  -v "$PWD:/workspace" \
  ghcr.io/debin-ge/zentic:latest
```

Then open:

```text
http://localhost:6767
```

If you set `ZENTIC_PASSWORD`, enter the same password when adding the direct
daemon connection in the web UI or another Zentic client.

## Docker Compose

Use [`docker/docker-compose.example.yml`](../docker/docker-compose.example.yml):

```bash
cp docker/docker-compose.example.yml docker-compose.yml
$EDITOR docker-compose.yml
docker compose up -d
```

Minimal example:

```yaml
services:
  zentic:
    image: ghcr.io/debin-ge/zentic:latest
    restart: unless-stopped
    ports:
      - "6767:6767"
    environment:
      ZENTIC_PASSWORD: "change-me"
    volumes:
      - ./zentic-home:/home/zentic
      - ./workspace:/workspace
```

## Installing Agents

The base image does not preinstall Claude Code, Codex, OpenCode, Copilot, Pi, or
other agent CLIs. That keeps the default image small and avoids coupling Zentic
releases to third-party agent release cycles.

Create a child image for the agents you use:

```Dockerfile
FROM ghcr.io/debin-ge/zentic:latest

USER root
RUN npm install -g @openai/codex @anthropic-ai/claude-code opencode-ai
```

Build it:

```bash
docker build -f Dockerfile -t zentic-with-agents .
```

Then use `image: zentic-with-agents` in Compose.

Leave the child image user as root. The base entrypoint uses root only for
first-run directory setup, then drops the daemon and launched agents to the
non-root `zentic` user.

An example child image is in
[`docker/Dockerfile.agents.example`](../docker/Dockerfile.agents.example).

You can also mount credentials from the host or run agent login once inside the
container:

```bash
docker exec -it --user zentic zentic codex
docker exec -it --user zentic zentic claude
```

Agent credentials and config persist in `/home/zentic`, alongside daemon state.
Provider environment variables such as `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`,
`OPENAI_BASE_URL`, or `ANTHROPIC_BASE_URL` can be passed through `docker run -e`
or `compose.environment`; Zentic passes them to launched agents.

## Volumes

| Mount          | Purpose                                                                    |
| -------------- | -------------------------------------------------------------------------- |
| `/home/zentic` | Zentic state under `.zentic` plus agent config such as `.codex`, `.claude` |
| `/workspace`   | Code that Zentic and launched agents can read and write                    |

The image defaults:

| Variable        | Default                |
| --------------- | ---------------------- |
| `HOME`          | `/home/zentic`         |
| `ZENTIC_HOME`   | `/home/zentic/.zentic` |
| `ZENTIC_LISTEN` | `0.0.0.0:6767`         |

If you bind-mount host directories on Linux, make sure the container user can
write them. The built-in `zentic` user has uid/gid `1000:1000`. For a different
host uid/gid, either adjust ownership on the mounted directories or run the
container with Docker's `--user` / Compose `user:` option.

## Reverse Proxies

When serving Zentic behind a reverse proxy, forward normal HTTP requests and
WebSocket upgrades to the same daemon port.

Caddy example:

```caddy
zentic.example.com {
  reverse_proxy 127.0.0.1:6767
}
```

Nginx example:

```nginx
server {
    listen 443 ssl;
    server_name zentic.example.com;

    location / {
        proxy_pass http://127.0.0.1:6767;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

If you reach the daemon by DNS name, set `ZENTIC_HOSTNAMES` so host-header
validation allows that name:

```yaml
environment:
  ZENTIC_HOSTNAMES: "zentic.example.com,.lan"
```

IPs and `localhost` are allowed by default.

## Security

- Set `ZENTIC_PASSWORD` for any published port or network-reachable deployment.
- Prefer HTTPS at the reverse proxy for direct browser access.
- Use the [official Zentic relay](https://github.com/debin-ge/zentic-relay) for
  untrusted networks or mobile access when you do not want to expose the daemon
  port directly.
- The container is the isolation boundary for agents. Agents can read and write
  whatever you mount into `/workspace` and whatever credentials you place in
  `/home/zentic`.
- The bundled web UI static files are public on the daemon origin. The daemon
  API and WebSocket remain protected by password auth when configured.

See [SECURITY.md](../SECURITY.md) for the daemon trust model.

## Building Locally

```bash
docker build -f docker/base/Dockerfile -t zentic:local .
```

The source-build stage defaults to one Metro worker and a 6144 MiB Node old-space
limit. Generated protocol validators need substantial memory during web export;
parallel transforms multiply that cost. Give the Docker builder memory beyond
the heap limit for native allocations and other build processes. With Docker
Desktop, adjust the VM's memory under Settings → Resources → Memory.

Override the build settings when needed:

```bash
docker build -f docker/base/Dockerfile -t zentic:local \
  --build-arg NODE_OPTIONS="--max-old-space-size=8192" \
  --build-arg ZENTIC_METRO_MAX_WORKERS=1 .
```

These settings apply only to the source-build stage. Setting `NODE_OPTIONS` in
the host shell or on `docker run` does not configure the image build. If Metro
reports `Jest worker ran out of memory`, keep one worker and increase the heap
limit together with the builder's available memory.

To assert the source tree version while building:

```bash
docker build \
  --build-arg ZENTIC_VERSION=0.1.102 \
  -t zentic:0.1.102 \
  -f docker/base/Dockerfile \
  .
```

The Docker workflow builds the image on pull requests and on `main` as a
non-publishing check. Stable `vX.Y.Z` tag pushes publish
`ghcr.io/debin-ge/zentic:X.Y.Z` and `ghcr.io/debin-ge/zentic:latest`. Beta tags
publish only the exact prerelease tag, such as
`ghcr.io/debin-ge/zentic:0.1.102-beta.1`, and do not update `latest`.

To replace a Docker image in place without rebuilding desktop, APK, or EAS
mobile release artifacts, dispatch the Docker workflow manually instead of
pushing a `v*` release tag:

```bash
gh workflow run docker.yml \
  --ref main \
  -f zentic_version=0.1.102-beta.1 \
  -f publish=true
```

Manual Docker publishes require an explicit `zentic_version`. The workflow builds
from the checked-out source tree and publishes only the exact prerelease image
tag for prerelease versions.

The published image is multi-arch for `linux/amd64` and `linux/arm64`.

## Troubleshooting

- **The web UI loads but cannot connect**: if `ZENTIC_PASSWORD` is set, add a
  direct connection with the same password.
- **403 Host not allowed**: set `ZENTIC_HOSTNAMES` to the DNS names you use.
- **Provider not available**: install that agent CLI in a child image or mount a
  runtime where the binary is on `PATH`.
- **Permission errors in `/workspace`**: make the mounted directory writable by
  uid/gid `1000:1000`, or run the container as the host uid/gid.
- **Logs**: inspect `docker logs zentic` or
  `/home/zentic/.zentic/daemon.log` inside the container.
