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
AVANTIS_TRADER_SDK_SPEC="${AVANTIS_TRADER_SDK_SPEC:-avantis-trader-sdk@1.0.0}"
POLYMARKET_CLOB_CLIENT_SPEC="${POLYMARKET_CLOB_CLIENT_SPEC:-@polymarket/clob-client@latest}"

ensure_required_runtime_modules() {
  local missing=0
  for module in \
    "@modelcontextprotocol/sdk" \
    "@tetherto/wdk" \
    "@tetherto/wdk-mcp-toolkit" \
    "@tetherto/wdk-wallet-evm" \
    "@tetherto/wdk-wallet-solana" \
    "avantis-trader-sdk" \
    "@polymarket/clob-client"; do
    if ! node -e "require.resolve('${module}', { paths: ['${MCP_DIR}'] })" >/dev/null 2>&1; then
      missing=1
      break
    fi
  done

  if [ "$missing" -eq 1 ]; then
    echo "Installing missing local WDK runtime dependencies."
    npm --prefix "$MCP_DIR" install --save-exact \
      "$MCP_SDK_SPEC" \
      "$WDK_SPEC" \
      "$WDK_MCP_TOOLKIT_SPEC" \
      "$WDK_WALLET_EVM_SPEC" \
      "$WDK_WALLET_SOLANA_SPEC" \
      "$AVANTIS_TRADER_SDK_SPEC" \
      "$POLYMARKET_CLOB_CLIENT_SPEC"
  fi
}

ensure_runtime_env_defaults() {
  local env_file="${MCP_DIR}/.env"
  if [ ! -f "$env_file" ]; then
    return
  fi

  if ! grep -q '^CLAWDEFI_POLYGON_RPC_URL=' "$env_file"; then
    printf '%s\n' 'CLAWDEFI_POLYGON_RPC_URL=https://polygon-bor-rpc.publicnode.com' >>"$env_file"
  fi
  if ! grep -q '^CLAWDEFI_AMOY_RPC_URL=' "$env_file"; then
    printf '%s\n' 'CLAWDEFI_AMOY_RPC_URL=https://rpc-amoy.polygon.technology' >>"$env_file"
  fi
}

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
  awk -v local="$local_version" -v remote="$remote_version" '
    function to_numeric_segments(version, output,   sanitized, count, i) {
      sanitized = version
      gsub(/[^0-9.]/, "", sanitized)
      count = split(sanitized, output, ".")
      if (count < 1) {
        output[1] = 0
        count = 1
      }
      return count
    }
    BEGIN {
      local_count = to_numeric_segments(local, local_parts)
      remote_count = to_numeric_segments(remote, remote_parts)
      max_count = local_count > remote_count ? local_count : remote_count
      if (max_count < 3) max_count = 3

      for (i = 1; i <= max_count; i++) {
        local_num = (i in local_parts && local_parts[i] != "") ? local_parts[i] + 0 : 0
        remote_num = (i in remote_parts && remote_parts[i] != "") ? remote_parts[i] + 0 : 0
        if (remote_num > local_num) exit 0
        if (remote_num < local_num) exit 1
      }
      exit 1
    }
  '
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
      "$WDK_WALLET_SOLANA_SPEC" \
      "$AVANTIS_TRADER_SDK_SPEC" \
      "$POLYMARKET_CLOB_CLIENT_SPEC"
  elif [ "$CLAWDEFI_REFRESH_WDK_DEPS" = "1" ]; then
    if [ -f "${MCP_DIR}/package-lock.json" ]; then
      echo "Refreshing local WDK dependencies from lockfile."
      npm --prefix "$MCP_DIR" ci --omit=dev
    else
      echo "No package-lock.json found at ${MCP_DIR}; skipping refresh."
    fi
  fi

  ensure_required_runtime_modules
  ensure_runtime_env_defaults
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
