# syntax=docker/dockerfile:1

ARG NODE_IMAGE=node:22-bookworm-slim
FROM --platform=$BUILDPLATFORM ${NODE_IMAGE} AS source-pack

ARG ZENTIC_VERSION
ARG NODE_OPTIONS=--max-old-space-size=6144
ARG ZENTIC_METRO_MAX_WORKERS=1

ENV ONNXRUNTIME_NODE_INSTALL=skip \
    NODE_OPTIONS=${NODE_OPTIONS} \
    ZENTIC_METRO_MAX_WORKERS=${ZENTIC_METRO_MAX_WORKERS}

WORKDIR /tmp/zentic-src
COPY . .

RUN set -eux; \
    if [ -n "${ZENTIC_VERSION:-}" ]; then \
      test "$(node -p "require('./package.json').version")" = "${ZENTIC_VERSION}"; \
    fi; \
    node -e 'const fs=require("node:fs"); const pkg=JSON.parse(fs.readFileSync("package.json","utf8")); delete pkg.scripts.prepare; fs.writeFileSync("package.json", `${JSON.stringify(pkg)}\n`);'; \
    npm ci

RUN set -eux; \
    mkdir -p /tmp/zentic-packs; \
    npm pack --workspace=@getzentic/highlight --pack-destination /tmp/zentic-packs; \
    npm pack --workspace=@getzentic/relay --pack-destination /tmp/zentic-packs; \
    npm pack --workspace=@getzentic/protocol --pack-destination /tmp/zentic-packs; \
    npm pack --workspace=@getzentic/client --pack-destination /tmp/zentic-packs; \
    npm pack --workspace=@getzentic/plugin --pack-destination /tmp/zentic-packs; \
    npm pack --workspace=@getzentic/server --pack-destination /tmp/zentic-packs; \
    npm pack --workspace=@getzentic/cli --pack-destination /tmp/zentic-packs

FROM ${NODE_IMAGE}

ENV HOME=/home/zentic \
    ZENTIC_HOME=/home/zentic/.zentic \
    ZENTIC_LISTEN=0.0.0.0:6767 \
    ZENTIC_WEB_UI_ENABLED=true \
    ZENTIC_LOG_FORMAT=json \
    ZENTIC_LOG_LEVEL=info \
    CLAUDE_CONFIG_DIR=/home/zentic/.claude \
    CODEX_HOME=/home/zentic/.codex \
    XDG_CONFIG_HOME=/home/zentic/.config \
    XDG_DATA_HOME=/home/zentic/.local/share \
    XDG_STATE_HOME=/home/zentic/.local/state \
    XDG_CACHE_HOME=/home/zentic/.cache \
    ONNXRUNTIME_NODE_INSTALL=skip

RUN set -eux; \
    apt-get update; \
    apt-get install -y --no-install-recommends \
      bash \
      ca-certificates \
      curl \
      git \
      gosu \
      lbzip2 \
      openssh-client \
      procps \
      tini; \
    rm -rf /var/lib/apt/lists/*

COPY --from=source-pack /tmp/zentic-packs /tmp/zentic-packs
RUN set -eux; \
	npm install -g /tmp/zentic-packs/*.tgz; \
    rm -rf /tmp/zentic-packs; \
    npm cache clean --force; \
    server_entry="$(npm root -g)/@getzentic/server/dist/scripts/supervisor-entrypoint.js"; \
    test -f "$server_entry"; \
    printf '%s\n' "$server_entry" > /etc/zentic-server-entry; \
    node --check "$server_entry"

RUN set -eux; \
    existing_group="$(getent group 1000 | cut -d: -f1 || true)"; \
    if [ -n "$existing_group" ] && [ "$existing_group" != "zentic" ]; then \
      groupmod --new-name zentic "$existing_group"; \
    elif [ -z "$existing_group" ]; then \
      groupadd --gid 1000 zentic; \
    fi; \
    existing_user="$(getent passwd 1000 | cut -d: -f1 || true)"; \
    if [ -n "$existing_user" ] && [ "$existing_user" != "zentic" ]; then \
      usermod --login zentic --gid zentic --home /home/zentic --shell /bin/bash "$existing_user"; \
    elif [ -z "$existing_user" ]; then \
      useradd --uid 1000 --gid zentic --create-home --home-dir /home/zentic --shell /bin/bash zentic; \
    fi; \
    mkdir -p \
      /workspace \
      "$ZENTIC_HOME" \
      "$CLAUDE_CONFIG_DIR" \
      "$CODEX_HOME" \
      "$XDG_CONFIG_HOME" \
      "$XDG_DATA_HOME" \
      "$XDG_STATE_HOME" \
      "$XDG_CACHE_HOME"; \
    chown -R zentic:zentic /home/zentic /workspace

COPY docker/base/rootfs/ /
RUN chmod +x /usr/local/bin/zentic-docker-entrypoint

WORKDIR /workspace

EXPOSE 6767
VOLUME ["/home/zentic"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "const listen=process.env.ZENTIC_LISTEN||'0.0.0.0:6767'; const m=listen.match(/:(\\d+)$/); const port=m?Number(m[1]):6767; require('http').get({hostname:'127.0.0.1',port,path:'/api/health'},r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/zentic-docker-entrypoint"]
