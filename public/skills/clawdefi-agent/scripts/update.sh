#!/usr/bin/env bash
set -euo pipefail

SKILL_NAME="${SKILL_NAME:-clawdefi-agent}"
SKILLS_BASE_URL="${SKILLS_BASE_URL:-https://www.clawdefi.ai/skills}"
MANIFEST_URL="${MANIFEST_URL:-${SKILLS_BASE_URL}/${SKILL_NAME}/manifest.json}"
OPENCLAW_STATE_DIR="${OPENCLAW_STATE_DIR:-$HOME/.openclaw}"
TARGET_ROOT="${TARGET_ROOT:-${OPENCLAW_STATE_DIR}/skills}"
TARGET_DIR="${TARGET_ROOT}/${SKILL_NAME}"
TARGET_SKILL_FILE="${TARGET_DIR}/SKILL.md"
MCP_DIR="${OPENCLAW_STATE_DIR}/clawdefi/wdk-mcp"

# Optional knobs:
# - CLAWDEFI_REFRESH_WDK_DEPS=1       -> run npm ci (from lockfile) in local WDK runtime
# - CLAWDEFI_UPGRADE_WDK_DEPS=1       -> run npm install --save-exact for configured specs
# - CLAWDEFI_RESTART_WDK_RUNTIME=1    -> best-effort restart of long-running local WDK process
CLAWDEFI_REFRESH_WDK_DEPS="${CLAWDEFI_REFRESH_WDK_DEPS:-0}"
CLAWDEFI_UPGRADE_WDK_DEPS="${CLAWDEFI_UPGRADE_WDK_DEPS:-0}"
CLAWDEFI_RESTART_WDK_RUNTIME="${CLAWDEFI_RESTART_WDK_RUNTIME:-0}"

MCP_SDK_SPEC="${MCP_SDK_SPEC:-@modelcontextprotocol/sdk@latest}"
WDK_SPEC="${WDK_SPEC:-@tetherto/wdk@latest}"
WDK_MCP_TOOLKIT_SPEC="${WDK_MCP_TOOLKIT_SPEC:-github:tetherto/wdk-mcp-toolkit}"
WDK_WALLET_EVM_SPEC="${WDK_WALLET_EVM_SPEC:-@tetherto/wdk-wallet-evm@latest}"
WDK_WALLET_SOLANA_SPEC="${WDK_WALLET_SOLANA_SPEC:-@tetherto/wdk-wallet-solana@latest}"

require_bin() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "ERROR: required binary not found: $1" >&2
    exit 1
  fi
}

extract_skill_version() {
  local file_path="$1"
  if [ ! -f "$file_path" ]; then
    echo ""
    return
  fi
  awk -F': *' '/^version:/{print $2; exit}' "$file_path" | tr -d '\r'
}

is_remote_newer() {
  local local_version="$1"
  local remote_version="$2"
  if [ -z "$local_version" ]; then
    return 0
  fi
  if [ "$local_version" = "$remote_version" ]; then
    return 1
  fi
  local max_version
  max_version="$(printf '%s\n%s\n' "$local_version" "$remote_version" | sort -V | tail -n1)"
  [ "$max_version" = "$remote_version" ]
}

refresh_wdk_runtime_deps() {
  if [ ! -d "$MCP_DIR" ] || [ ! -f "${MCP_DIR}/package.json" ]; then
    echo "WDK runtime not found at ${MCP_DIR}; skipping dependency refresh."
    return
  fi

  if [ "$CLAWDEFI_UPGRADE_WDK_DEPS" = "1" ]; then
    echo "Upgrading local WDK dependencies (explicit opt-in)."
    npm --prefix "$MCP_DIR" install --save-exact \
      "$MCP_SDK_SPEC" \
      "$WDK_SPEC" \
      "$WDK_MCP_TOOLKIT_SPEC" \
      "$WDK_WALLET_EVM_SPEC" \
      "$WDK_WALLET_SOLANA_SPEC"
    return
  fi

  if [ "$CLAWDEFI_REFRESH_WDK_DEPS" = "1" ]; then
    if [ -f "${MCP_DIR}/package-lock.json" ]; then
      echo "Refreshing local WDK dependencies from lockfile."
      npm --prefix "$MCP_DIR" ci --omit=dev
    else
      echo "No package-lock.json found at ${MCP_DIR}; skipping refresh."
    fi
  fi
}

restart_wdk_runtime_if_requested() {
  if [ "$CLAWDEFI_RESTART_WDK_RUNTIME" != "1" ]; then
    return
  fi
  if ! command -v pkill >/dev/null 2>&1; then
    echo "pkill not available; skipping runtime restart."
    return
  fi
  pkill -f "clawdefi-wdk-mcp" >/dev/null 2>&1 || true
  pkill -f "${MCP_DIR}/index.mjs" >/dev/null 2>&1 || true
  echo "Requested WDK runtime restart completed (best effort)."
}

main() {
  require_bin curl
  require_bin jq
  require_bin bash

  tmp_dir="$(mktemp -d)"
  trap 'rm -rf "$tmp_dir"' EXIT
  manifest_tmp="${tmp_dir}/manifest.json"

  curl -fsSL "$MANIFEST_URL" -o "$manifest_tmp"
  remote_version="$(jq -r '.version // empty' "$manifest_tmp")"
  if [ -z "$remote_version" ]; then
    echo "ERROR: remote manifest does not contain version: $MANIFEST_URL" >&2
    exit 1
  fi

  local_version="$(extract_skill_version "$TARGET_SKILL_FILE")"
  if is_remote_newer "$local_version" "$remote_version"; then
    echo "Remote skill version is newer (${local_version:-none} -> ${remote_version}). Applying update."
  else
    echo "Local skill version is up to date (${local_version:-unknown}); skipping skill file update."
    refresh_wdk_runtime_deps
    restart_wdk_runtime_if_requested
    exit 0
  fi

  updater_tmp="${tmp_dir}/update-from-manifest.sh"
  curl -fsSL "${SKILLS_BASE_URL}/${SKILL_NAME}/scripts/update-from-manifest.sh" -o "$updater_tmp"
  chmod +x "$updater_tmp"

  SKILL_NAME="$SKILL_NAME" \
  SKILLS_BASE_URL="$SKILLS_BASE_URL" \
  MANIFEST_URL="$MANIFEST_URL" \
  TARGET_ROOT="$TARGET_ROOT" \
  "$updater_tmp"

  refresh_wdk_runtime_deps
  restart_wdk_runtime_if_requested

  cat <<EOF
Update finished.
- Updated files: ${TARGET_DIR}/SKILL.md and runtime scripts under ${TARGET_DIR}/scripts
- Preserved local secrets: ${OPENCLAW_STATE_DIR}/clawdefi/wdk-mcp/.env was not modified
EOF
}

main "$@"
