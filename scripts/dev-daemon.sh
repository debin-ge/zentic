#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export PATH="$SCRIPT_DIR/../node_modules/.bin:$PATH"

source "$SCRIPT_DIR/dev-home.sh"

export ZENTIC_LISTEN="${ZENTIC_LISTEN:-127.0.0.1:6768}"
configure_dev_zentic_home

if [ -z "${ZENTIC_LOCAL_MODELS_DIR}" ]; then
  export ZENTIC_LOCAL_MODELS_DIR="$HOME/.zentic/models/local-speech"
  mkdir -p "$ZENTIC_LOCAL_MODELS_DIR"
fi

echo "══════════════════════════════════════════════════════"
echo "  Zentic Dev Daemon"
echo "══════════════════════════════════════════════════════"
echo "  Home:    ${ZENTIC_HOME}"
echo "  Models:  ${ZENTIC_LOCAL_MODELS_DIR}"
echo "  Listen:  ${ZENTIC_LISTEN}"
echo "══════════════════════════════════════════════════════"

export ZENTIC_CORS_ORIGINS="${ZENTIC_CORS_ORIGINS:-*}"
export ZENTIC_NODE_INSPECT="${ZENTIC_NODE_INSPECT:---inspect=0}"

if [ "${ZENTIC_SKIP_DEV_SERVER_BUILD:-0}" = "1" ]; then
  exec npm run dev:server:watch
fi

exec sh -c 'npm run build:server-deps && npm run dev:server:watch'
