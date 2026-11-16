#!/usr/bin/env bash

default_dev_zentic_root() {
  git rev-parse --show-toplevel 2>/dev/null || pwd
}

seed_worktree_zentic_home() {
  local script_dir
  script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  node "$script_dir/seed-dev-home.mjs" "${ZENTIC_DEV_SEED_HOME:-$HOME/.zentic}" "$1"
}

configure_dev_daemon_config() {
  if [ -z "${ZENTIC_LISTEN:-}" ]; then
    return
  fi

  mkdir -p "$ZENTIC_HOME"
  node -e '
const fs = require("fs");
const [path, listen] = [process.argv[1], process.argv[2]];
let cfg = {};
try { cfg = JSON.parse(fs.readFileSync(path, "utf8")); } catch {}
cfg.version = cfg.version || 1;
cfg.daemon = cfg.daemon || {};
cfg.daemon.listen = listen;
cfg.daemon.cors = cfg.daemon.cors || {};
cfg.daemon.cors.allowedOrigins = ["*"];
fs.writeFileSync(path, JSON.stringify(cfg, null, 2));
' "$ZENTIC_HOME/config.json" "$ZENTIC_LISTEN"
}

resolve_dev_daemon_endpoint() {
  if [ -n "${ZENTIC_DEV_DAEMON_ENDPOINT:-}" ]; then
    echo "$ZENTIC_DEV_DAEMON_ENDPOINT"
    return
  fi

  case "${ZENTIC_LISTEN:-127.0.0.1:6768}" in
    0.0.0.0:*) echo "localhost:${ZENTIC_LISTEN#0.0.0.0:}" ;;
    127.0.0.1:*) echo "localhost:${ZENTIC_LISTEN#127.0.0.1:}" ;;
    *) echo "$ZENTIC_LISTEN" ;;
  esac
}

configure_dev_zentic_home() {
  if [ -n "${ZENTIC_HOME:-}" ]; then
    export ZENTIC_HOME
    if [ -n "${ZENTIC_DEV_SEED_HOME:-}" ]; then
      seed_worktree_zentic_home "$ZENTIC_HOME"
    fi
    mkdir -p "$ZENTIC_HOME"
    if [ "${ZENTIC_DEV_MANAGED_HOME:-0}" = "1" ] || [ -n "${ZENTIC_DEV_SEED_HOME:-}" ]; then
      configure_dev_daemon_config
    fi
    return
  fi

  export ZENTIC_HOME
  local dev_root
  dev_root="${ZENTIC_DEV_ROOT:-$(default_dev_zentic_root)}"
  ZENTIC_HOME="$dev_root/.dev/zentic-home"
  export ZENTIC_DEV_MANAGED_HOME=1

  if [ -n "${ZENTIC_DEV_SEED_HOME:-}" ]; then
    seed_worktree_zentic_home "$ZENTIC_HOME"
  fi

  mkdir -p "$ZENTIC_HOME"
  configure_dev_daemon_config
}

configure_dev_command_env() {
  if [ -z "${ZENTIC_LISTEN:-}" ]; then
    if [ -n "${ZENTIC_SERVICE_DAEMON_PORT:-}" ]; then
      export ZENTIC_LISTEN="0.0.0.0:${ZENTIC_SERVICE_DAEMON_PORT}"
    else
      export ZENTIC_LISTEN="127.0.0.1:6768"
    fi
  fi

  configure_dev_zentic_home
}

if [ "${BASH_SOURCE[0]}" = "$0" ]; then
  if [ "$#" -gt 0 ]; then
    configure_dev_command_env
    exec "$@"
  fi

  configure_dev_zentic_home
fi
