#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DESKTOP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ROOT_DIR="$(cd "$DESKTOP_DIR/../.." && pwd)"

source "$ROOT_DIR/scripts/dev-home.sh"

export PATH="$ROOT_DIR/node_modules/.bin:$PATH"
export ZENTIC_LISTEN="${ZENTIC_LISTEN:-127.0.0.1:6768}"
configure_dev_zentic_home

DEV_ROOT="${ZENTIC_DEV_ROOT:-$(default_dev_zentic_root)}"
export ZENTIC_DEV_ROOT="$DEV_ROOT"
export ZENTIC_DEV_RUNTIME_FALLBACK_ROOT="$DEV_ROOT"
DEV_RUNTIME="$(node "$SCRIPT_DIR/dev-runtime.mjs")"
export ZENTIC_ELECTRON_FLAGS="$(node -e 'process.stdout.write(JSON.parse(process.argv[1]).electronFlags)' "$DEV_RUNTIME")"
export ZENTIC_ELECTRON_USER_DATA_DIR="$(node -e 'process.stdout.write(JSON.parse(process.argv[1]).userDataDir)' "$DEV_RUNTIME")"
unset ZENTIC_DEV_RUNTIME_FALLBACK_ROOT
mkdir -p "$ZENTIC_ELECTRON_USER_DATA_DIR"

if [ -z "${EXPO_PORT:-}" ]; then
  EXPO_PORT=$(NO_COLOR=1 FORCE_COLOR=0 "$ROOT_DIR/node_modules/.bin/get-port" 8082 8083 8084 8085 8086 8087 8088 8089)
fi
export EXPO_PORT
export EXPO_DEV_URL="http://localhost:${EXPO_PORT}"

DAEMON_ENDPOINT="$(resolve_dev_daemon_endpoint)"
export ZENTIC_DAEMON_ENDPOINT="$DAEMON_ENDPOINT"

export ZENTIC_CORS_ORIGINS="${ZENTIC_CORS_ORIGINS:-*}"

npm --prefix "$DESKTOP_DIR" run build:main

echo "══════════════════════════════════════════════════════"
echo "  Zentic Desktop Dev"
echo "══════════════════════════════════════════════════════"
echo "  Metro:      ${EXPO_DEV_URL}"
echo "  Daemon:     ${ZENTIC_LISTEN}"
echo "  Home:       ${ZENTIC_HOME}"
echo "  userData:   ${ZENTIC_ELECTRON_USER_DATA_DIR}"
echo "══════════════════════════════════════════════════════"

exec node "$SCRIPT_DIR/dev-runner.mjs"
