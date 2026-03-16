#!/usr/bin/env bash
set -euo pipefail

STATE_DIR="${OPENCLAW_STATE_DIR:-$HOME/.openclaw}"
CLAWDEFI_DIR="${STATE_DIR}/clawdefi"
MCP_DIR="${CLAWDEFI_DIR}/wdk-mcp"
ENV_FILE="${MCP_DIR}/.env"
ENV_EXAMPLE_FILE="${MCP_DIR}/.env.example"
PACKAGE_FILE="${MCP_DIR}/package.json"
INDEX_FILE="${MCP_DIR}/index.mjs"
RUN_FILE="${MCP_DIR}/run.sh"
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

check_node_version() {
  local major
  major="$(node -p "process.versions.node.split('.')[0]")"
  if [ "$major" -lt 22 ]; then
    echo "ERROR: Node.js 22+ is required. Found: $(node -v)" >&2
    exit 1
  fi
}

write_package_json() {
  if [ -f "$PACKAGE_FILE" ]; then
    return
  fi
  cat >"$PACKAGE_FILE" <<'EOF'
{
  "name": "clawdefi-wdk-mcp",
  "private": true,
  "type": "module",
  "scripts": {
    "start": "node index.mjs"
  }
}
EOF
}

write_index() {
  cat >"$INDEX_FILE" <<'EOF'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  INDEXER_TOOLS,
  PRICING_TOOLS,
  WALLET_TOOLS,
  WdkMcpServer
} from '@tetherto/wdk-mcp-toolkit'
import WalletManagerEvm from '@tetherto/wdk-wallet-evm'
import WalletManagerSolana from '@tetherto/wdk-wallet-solana'

const requiredEnv = ['WDK_SEED']
for (const key of requiredEnv) {
  if (!process.env[key]) {
    console.error(`Missing required environment variable: ${key}`)
    process.exit(1)
  }
}

const server = new WdkMcpServer('clawdefi-wdk-mcp', '0.1.0')
  .useWdk({ seed: process.env.WDK_SEED })
  .registerWallet('ethereum', WalletManagerEvm, {
    provider: process.env.CLAWDEFI_EVM_RPC_URL || 'https://rpc.mevblocker.io/fast'
  })
  .registerWallet('base', WalletManagerEvm, {
    provider: process.env.CLAWDEFI_BASE_RPC_URL || 'https://mainnet.base.org'
  })
  .registerWallet('bsc', WalletManagerEvm, {
    provider: process.env.CLAWDEFI_BSC_RPC_URL || 'https://bsc-dataseed.binance.org'
  })
  .registerWallet('solana', WalletManagerSolana, {
    rpcUrl: process.env.CLAWDEFI_SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
    commitment: 'confirmed'
  })
  .usePricing()

const tools = [
  ...WALLET_TOOLS,
  ...PRICING_TOOLS
]

if (process.env.WDK_INDEXER_API_KEY) {
  server.useIndexer({ apiKey: process.env.WDK_INDEXER_API_KEY })
  tools.push(...INDEXER_TOOLS)
}

server.registerTools(tools)

const transport = new StdioServerTransport()
await server.connect(transport)

console.error('ClawDeFi WDK MCP server running on stdio')
console.error('Registered chains:', server.getChains())
EOF
}

write_env_files() {
  umask 077
  if [ ! -f "$ENV_FILE" ]; then
    cat >"$ENV_FILE" <<'EOF'
# Set this later during wallet setup.
# WDK_SEED='twelve or twenty four word seed phrase here'
CLAWDEFI_EVM_RPC_URL=https://rpc.mevblocker.io/fast
CLAWDEFI_BASE_RPC_URL=https://mainnet.base.org
CLAWDEFI_BSC_RPC_URL=https://bsc-dataseed.binance.org
CLAWDEFI_SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
# Optional:
# WDK_INDEXER_API_KEY=
EOF
    chmod 600 "$ENV_FILE"
  fi

  cat >"$ENV_EXAMPLE_FILE" <<'EOF'
WDK_SEED='twelve or twenty four word seed phrase here'
CLAWDEFI_EVM_RPC_URL=https://rpc.mevblocker.io/fast
CLAWDEFI_BASE_RPC_URL=https://mainnet.base.org
CLAWDEFI_BSC_RPC_URL=https://bsc-dataseed.binance.org
CLAWDEFI_SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
# Optional:
# WDK_INDEXER_API_KEY=
EOF
  chmod 600 "$ENV_EXAMPLE_FILE"
}

write_runner() {
  cat >"$RUN_FILE" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
set -a
. "$DIR/.env"
set +a

exec npm --prefix "$DIR" run start --silent
EOF
  chmod +x "$RUN_FILE"
}

install_dependencies() {
  if [ -f "${MCP_DIR}/package-lock.json" ]; then
    npm --prefix "$MCP_DIR" ci --omit=dev
    return
  fi

  npm --prefix "$MCP_DIR" install --save-exact \
    "$MCP_SDK_SPEC" \
    "$WDK_SPEC" \
    "$WDK_MCP_TOOLKIT_SPEC" \
    "$WDK_WALLET_EVM_SPEC" \
    "$WDK_WALLET_SOLANA_SPEC"
}

boot_check() {
  [ -f "$RUN_FILE" ] && [ -f "$INDEX_FILE" ] && [ -f "$ENV_FILE" ] && [ -f "$PACKAGE_FILE" ]
}

main() {
  require_bin node
  require_bin npm
  require_bin openclaw
  check_node_version

  mkdir -p "$MCP_DIR"

  write_package_json
  write_index
  write_env_files
  write_runner

  install_dependencies

  if ! boot_check; then
    echo "ERROR: local WDK MCP boot check failed." >&2
    exit 1
  fi

  cat <<EOF
ClawDeFi onboarding completed.

Local runtime:
  $MCP_DIR

Local launcher:
  $RUN_FILE

Next steps:
  1. Complete wallet setup later by adding WDK_SEED to: $ENV_FILE
  2. Point your local MCP client at: $RUN_FILE
EOF
}

main "$@"
