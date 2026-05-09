#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TEMPLATE_FILE="$REPO_ROOT/launchd/ai.watchdog-command-receiver.plist.template"
SERVICE_LABEL="gui/$(id -u)/ai.watchdog-command-receiver"
WATCHDOG_COMMAND_HOME="${WATCHDOG_COMMAND_HOME:-$HOME/.watchdog-command-receiver}"
WATCHDOG_COMMAND_RUNTIME_DIR="${WATCHDOG_COMMAND_RUNTIME_DIR:-$WATCHDOG_COMMAND_HOME/runtime/current}"
WATCHDOG_COMMAND_CONFIG_FILE="${WATCHDOG_COMMAND_CONFIG_FILE:-$WATCHDOG_COMMAND_HOME/config/config.json}"
WATCHDOG_COMMAND_LOG_DIR="${WATCHDOG_COMMAND_LOG_DIR:-$WATCHDOG_COMMAND_HOME/logs}"
WATCHDOG_COMMAND_LOG_FILE="${WATCHDOG_COMMAND_LOG_FILE:-$WATCHDOG_COMMAND_LOG_DIR/receiver.log}"
LAUNCH_AGENT_DIR="${LAUNCH_AGENT_DIR:-$HOME/Library/LaunchAgents}"
TARGET_FILE="$LAUNCH_AGENT_DIR/ai.watchdog-command-receiver.plist"
NODE_BIN="${NODE_BIN:-$(command -v node)}"

escape_sed_replacement() {
  printf '%s' "$1" | sed 's/[&]/\\&/g'
}

sync_runtime_tree() {
  if [[ ! -d "$REPO_ROOT/node_modules" ]]; then
    echo "Run npm ci before installing: missing $REPO_ROOT/node_modules" >&2
    exit 1
  fi

  mkdir -p "$WATCHDOG_COMMAND_RUNTIME_DIR"
  rm -rf "$WATCHDOG_COMMAND_RUNTIME_DIR/src" "$WATCHDOG_COMMAND_RUNTIME_DIR/node_modules"
  cp -R "$REPO_ROOT/src" "$WATCHDOG_COMMAND_RUNTIME_DIR/src"
  cp "$REPO_ROOT/package.json" "$WATCHDOG_COMMAND_RUNTIME_DIR/package.json"
  cp "$REPO_ROOT/package-lock.json" "$WATCHDOG_COMMAND_RUNTIME_DIR/package-lock.json"
  cp -R "$REPO_ROOT/node_modules" "$WATCHDOG_COMMAND_RUNTIME_DIR/node_modules"
}

if [[ ! -f "$TEMPLATE_FILE" ]]; then
  echo "Template not found: $TEMPLATE_FILE" >&2
  exit 1
fi

mkdir -p "$LAUNCH_AGENT_DIR" "$WATCHDOG_COMMAND_LOG_DIR" "$(dirname "$WATCHDOG_COMMAND_CONFIG_FILE")"
if [[ ! -f "$WATCHDOG_COMMAND_CONFIG_FILE" ]]; then
  cp "$REPO_ROOT/config.example.json" "$WATCHDOG_COMMAND_CONFIG_FILE"
fi
chmod 600 "$WATCHDOG_COMMAND_CONFIG_FILE"

sync_runtime_tree
sed \
  -e "s|__WATCHDOG_COMMAND_RUNTIME_DIR__|$(escape_sed_replacement "$WATCHDOG_COMMAND_RUNTIME_DIR")|g" \
  -e "s|__WATCHDOG_COMMAND_CONFIG_FILE__|$(escape_sed_replacement "$WATCHDOG_COMMAND_CONFIG_FILE")|g" \
  -e "s|__WATCHDOG_COMMAND_LOG_FILE__|$(escape_sed_replacement "$WATCHDOG_COMMAND_LOG_FILE")|g" \
  -e "s|__NODE_BIN__|$(escape_sed_replacement "$NODE_BIN")|g" \
  -e "s|__HOME__|$(escape_sed_replacement "$HOME")|g" \
  "$TEMPLATE_FILE" > "$TARGET_FILE"

if [[ "${SKIP_LAUNCHCTL:-0}" != "1" ]]; then
  launchctl bootout "$SERVICE_LABEL" 2>/dev/null || true
  launchctl bootstrap "gui/$(id -u)" "$TARGET_FILE"
  launchctl kickstart -k "$SERVICE_LABEL"
fi

echo "Installed: $TARGET_FILE"
echo "Service: $SERVICE_LABEL"
echo "WATCHDOG_COMMAND_CONFIG_FILE: $WATCHDOG_COMMAND_CONFIG_FILE"
echo "WATCHDOG_COMMAND_LOG_FILE: $WATCHDOG_COMMAND_LOG_FILE"
echo "WATCHDOG_COMMAND_RUNTIME_DIR: $WATCHDOG_COMMAND_RUNTIME_DIR"
