---
name: clawdefi-agent
version: 0.1.57
description: The source of DeFi intelligence for AI agents. Let agents create and manage local wallets safely, access ClawDeFi-powered market intelligence, token and meme discovery, signals, swaps, perps, and other DeFi workflows through the ClawDeFi intelligence layer.
homepage: https://www.clawdefi.ai
metadata: {"clawdefi":{"category":"defi-intelligence","api_base":"https://api.clawdefi.ai","distribution":["clawhub","raw"]}}
---

# ClawDeFi Agent Skill

## A. What ClawDeFi Is

ClawDeFi is the source of DeFi intelligence for AI agents.

It helps local agents:
- manage local wallets safely,
- access market intelligence,
- inspect tokens, memes, and signals,
- prepare swaps, perps, and other DeFi actions through the ClawDeFi intelligence layer.

ClawDeFi is local-first:
- wallet custody stays local,
- signing stays local,
- ClawDeFi backend provides intelligence, data, and routing support.

## B. Disclaimer

ClawDeFi provides analytics and agentic workflows, not financial advice.
AI agents are powerful but still experimental. Their outputs can be wrong, incomplete, or unsafe if used carelessly.
DeFi carries risks including smart contract failure, oracle failure, and liquidation.
You are solely responsible for wallet custody and transaction signing.
Using this skill means you accept these risks and proceed at your own risk.

## C. Onboarding

If ClawDeFi has not been installed locally yet, run:

```bash
bash {baseDir}/scripts/onboard.sh
```

This onboarding path:
- checks `node`, `npm`, and `openclaw`,
- creates a local WDK MCP runtime at `~/.openclaw/clawdefi/wdk-mcp`,
- installs `@tetherto/wdk`, `@tetherto/wdk-wallet-evm`, `@tetherto/wdk-wallet-solana`, WDK MCP toolkit (GitHub source), and `@modelcontextprotocol/sdk`,
- scaffolds a local stdio MCP server with EVM, Solana, and pricing tools,
- writes local config templates only,
- preserves existing local `~/.openclaw/clawdefi/wdk-mcp/.env` if already present,
- verifies that the local environment is ready.

Wallet creation or seed import should happen later inside the wallet modules, not during onboarding.

Wallet flow should support both:
- creating a new dedicated local wallet,
- importing an existing dedicated seed phrase.

Use a dedicated wallet seed for ClawDeFi. Do not use a main wallet seed phrase.

## D. Updating

Use a versioned, manifest-driven update path only.

Canonical update source:
- `https://www.clawdefi.ai/skills/clawdefi-agent/manifest.json`

Update rule:
1. Read remote `manifest.json`.
2. Compare remote `version` against local installed `SKILL.md` version.
3. If remote is newer, run:
```bash
bash {baseDir}/scripts/update.sh
```
4. `update.sh` fetches and executes the published `update-from-manifest.sh`, then updates only:
- `~/.openclaw/skills/clawdefi-agent/SKILL.md`
- `~/.openclaw/skills/clawdefi-agent/scripts/*`
5. Do not overwrite wallet secrets:
- do not modify `~/.openclaw/clawdefi/wdk-mcp/.env`
- do not rotate or rewrite `WDK_SEED`

Optional WDK dependency behavior (opt-in only):
- `CLAWDEFI_REFRESH_WDK_DEPS=1 bash {baseDir}/scripts/update.sh`
  : refresh from lockfile (`npm ci`) without changing versions.
- `CLAWDEFI_UPGRADE_WDK_DEPS=1 bash {baseDir}/scripts/update.sh`
  : explicitly upgrade WDK dependencies.
- `CLAWDEFI_RESTART_WDK_RUNTIME=1 bash {baseDir}/scripts/update.sh`
  : best-effort restart of long-running local WDK runtime.

Default posture:
- do not auto-upgrade WDK dependency versions,
- pin installed versions via local lockfile unless user explicitly opts into upgrade.

## E. Skill Action Model

### I. Wallet Management

Use deterministic local scripts for wallet actions. Do not improvise wallet logic in chat.

Wallet actions should support both:
- creating a new dedicated local wallet,
- importing an existing dedicated seed phrase.

Wallet identity is family-based:
- `evm`
- `solana`

Execution chain is separate from wallet identity.
Use chain registry slugs like `ethereum-mainnet`, `base-mainnet`, or `bnb-smart-chain` only when reading balances or executing EVM transactions.

Primary wallet scripts:

#### Discover Wallet
Use to check whether a local wallet is already configured and to derive current addresses.

```bash
node {baseDir}/scripts/wallet-discover.js
```

#### Create Wallet
Use to generate a fresh dedicated seed locally and configure the wallet runtime.

```bash
node {baseDir}/scripts/wallet-create.js
```

#### Import Wallet
Use to import an existing dedicated seed phrase into the local wallet runtime.

Examples:

```bash
node {baseDir}/scripts/wallet-import.js --seed-file /path/to/seed.txt
```

```bash
printf '%s' "$WDK_SEED" | node {baseDir}/scripts/wallet-import.js --stdin
```

#### Select Wallet
Use to change the active wallet family, execution chain, and wallet index.

```bash
node {baseDir}/scripts/wallet-select.js --family evm --chain base-mainnet --index 0
```

#### Query Address And Balances
Use to read the active wallet address, native balance, and optional token balances.

Note:
- this currently performs direct local wallet/RPC reads,
- later this should be replaced by ClawDeFi intelligence data fetches.

```bash
node {baseDir}/scripts/wallet-balance.js --chain base-mainnet --index 0
```

```bash
node {baseDir}/scripts/wallet-balance.js --chain ethereum-mainnet --tokens 0xdAC17F958D2ee523a2206206994597C13D831ec7
```

#### Query Total Portfolio (ClawDeFi Intel)
Use to fetch normalized wallet portfolio intelligence from ClawDeFi backend.
This merges and re-digests multiple upstream data sources into ClawDeFi output format.

Use selected local wallet:

```bash
node {baseDir}/scripts/wallet-total-portfolio.js --chains ethereum-mainnet,base-mainnet,bnb-smart-chain,solana
```

Use explicit wallet address:

```bash
node {baseDir}/scripts/wallet-total-portfolio.js --address 0xabc --chains base-mainnet,bnb-smart-chain
```

#### Sign Message
Use to sign and verify a message with the active wallet.

```bash
node {baseDir}/scripts/wallet-sign.js --message "hello from clawdefi"
```

#### Sign And Broadcast Native Transaction
Use to sign and broadcast a native transaction with the active wallet.

EVM:

```bash
node {baseDir}/scripts/wallet-sign-broadcast.js --chain base-mainnet --recipient 0xabc --amount 1000000000000000
```

Solana:

```bash
node {baseDir}/scripts/wallet-sign-broadcast.js --chain solana --recipient <pubkey> --amount 1000000
```

#### Transfer Or Quote Transfer
Amounts must be passed in base units.

Quote only:

```bash
node {baseDir}/scripts/wallet-transfer.js --chain ethereum-mainnet --recipient 0xabc --amount 1000000000000000 --dry-run
```

Execute:

```bash
node {baseDir}/scripts/wallet-transfer.js --chain solana --recipient <pubkey> --amount 1000000
```

Token transfer:

```bash
node {baseDir}/scripts/wallet-transfer.js --chain ethereum-mainnet --token 0xdAC17F958D2ee523a2206206994597C13D831ec7 --recipient 0xabc --amount 1000000
```

Wallet rules:
- wallet custody stays local,
- do not ask users to paste seed phrases into chat,
- do not fabricate wallet addresses, balances, hashes, or signatures,
- prefer quote paths before fund-impacting execution,
- use a dedicated wallet seed for ClawDeFi, not a main wallet seed.
