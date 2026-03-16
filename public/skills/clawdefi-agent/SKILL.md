---
name: clawdefi-agent
version: 0.1.63
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
- installs `@tetherto/wdk`, `@tetherto/wdk-wallet-evm`, `@tetherto/wdk-wallet-solana`, WDK MCP toolkit (GitHub source), `@modelcontextprotocol/sdk`, and `avantis-trader-sdk`,
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

#### Check Token Allowance (EVM)
Use to read current ERC20 allowance for spender on selected EVM chain.

```bash
node {baseDir}/scripts/wallet-token-allowance-check.js --chain base-mainnet --token 0xdAC17F958D2ee523a2206206994597C13D831ec7 --spender 0xabcabcabcabcabcabcabcabcabcabcabcabcabca
```

#### Set Token Allowance (EVM)
Use to set allowance via local signing runtime.

Dry-run exact allowance:

```bash
node {baseDir}/scripts/wallet-token-allowance-set.js --chain base-mainnet --token 0xdAC17F958D2ee523a2206206994597C13D831ec7 --spender 0xabcabcabcabcabcabcabcabcabcabcabcabcabca --mode exact --amount 1000000 --dry-run
```

Execute revoke:

```bash
node {baseDir}/scripts/wallet-token-allowance-set.js --chain base-mainnet --token 0xdAC17F958D2ee523a2206206994597C13D831ec7 --spender 0xabcabcabcabcabcabcabcabcabcabcabcabcabca --mode revoke
```

Execute unlimited (explicit flag required):

```bash
node {baseDir}/scripts/wallet-token-allowance-set.js --chain base-mainnet --token 0xdAC17F958D2ee523a2206206994597C13D831ec7 --spender 0xabcabcabcabcabcabcabcabcabcabcabcabcabca --mode unlimited --allow-unlimited true
```

Wallet rules:
- wallet custody stays local,
- do not ask users to paste seed phrases into chat,
- do not fabricate wallet addresses, balances, hashes, or signatures,
- prefer quote paths before fund-impacting execution,
- use a dedicated wallet seed for ClawDeFi, not a main wallet seed.

### II. Market Intelligence

Market intel modules are split into three paths:
- direct local scripts for source-native reads (`query_coingecko`, `query_pyth`, `query_pyth_stream_*`, `query_avantis`, `query_contract_verification`),
- ClawDeFi backend intel endpoint for Binance/OKX-style reads (`query_token_info`, `query_address_info`, `crypto_market_rank`, `trading_signal`, `meme_rush`, `query_token_audit`),
- ClawDeFi backend chain context endpoint for RPC/explorer intelligence (`query_chain_registry`).

Do not route these through the old MCP plugin workflow.

Direct local market intel modules:

#### query_coingecko
```bash
node {baseDir}/scripts/query-coingecko.js simple-price --ids ethereum,bitcoin --vs-currencies usd --json
```

#### query_pyth
```bash
node {baseDir}/scripts/query-pyth.js latest --feed-ids 0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace --json
```

#### query_pyth_stream_open
```bash
node {baseDir}/scripts/query-pyth-stream-open.js --feed-ids 0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace
```

#### query_pyth_stream_poll
```bash
node {baseDir}/scripts/query-pyth-stream-poll.js --session-id <session_id> --cursor 0 --limit 20
```

#### query_pyth_stream_close
```bash
node {baseDir}/scripts/query-pyth-stream-close.js --session-id <session_id>
```

Pyth stream behavior note:
- `query_pyth_stream_open` starts a local background stream collector.
- `query_pyth_stream_poll` reads buffered events incrementally using `cursor`.
- This is stream-to-buffer polling (agent pull model), not direct push callbacks into chat.

#### query_avantis
```bash
node {baseDir}/scripts/query-avantis.js health --json
```

#### query_contract_verification
```bash
node {baseDir}/scripts/query-contract-verification.js --chain-id 8453 --contract-address 0x940181a94A35A4569E4529A3CDfB74e38FD98631 --json
```

#### query_chain_registry
```bash
node {baseDir}/scripts/query-chain-registry.js --chain base-mainnet --intent read
```

```bash
node {baseDir}/scripts/query-chain-registry.js --chain-id 8453 --intent simulate
```

Backend-routed market intel modules (ClawDeFi endpoint):
- endpoint: `POST /api/v1/intel/market/query`
- script wrappers below call ClawDeFi backend directly and return normalized ClawDeFi intel payload.

#### query_token_info
```bash
node {baseDir}/scripts/query-token-info.js --mode search --keyword usdc --chain-ids 56,8453,CT_501
```

#### query_address_info
```bash
node {baseDir}/scripts/query-address-info.js --address 0x0000000000000000000000000000000000000001 --chain-id 56 --offset 0
```

#### crypto_market_rank
```bash
node {baseDir}/scripts/crypto-market-rank.js --mode unified --chain-id 56 --rank-type 10 --period 50 --size 20
```

#### trading_signal
```bash
node {baseDir}/scripts/trading-signal.js --chain-id CT_501 --page 1 --page-size 50
```

#### meme_rush
```bash
node {baseDir}/scripts/meme-rush.js --mode rank-list --chain-id CT_501 --rank-type 10 --limit 20
```

#### query_token_audit
```bash
node {baseDir}/scripts/query-token-audit.js --chain-id 56 --contract-address 0x55d398326f99059ff775485246999027b3197955
```

### III. Swap

Swap module is intentionally scaffolded first and will be expanded in the next pass.

Current placeholder contract:
- source of route/quote intelligence should come from ClawDeFi intel layer,
- signing and execution must stay local through WDK wallet runtime,
- backend must not become the signing/custody boundary.

Planned module placeholders:
- `swap_quote`
- `swap_build`
- `swap_simulate`
- `swap_execute`

### IV. Perps (Local Execution, Modular Adapters)

Perps execution is local-first:
- market context and quotes use adapter data,
- transaction build returns deterministic intent + tx request,
- signing/simulation/broadcast stays local through WDK.

Do not use backend custody/signing for perps execution.

Adapter model:
- each venue is an adapter (`--adapter <slug>`),
- current adapter: `avantis`,
- future venues should implement the same action contracts without changing wallet/signing flow.

Current venue support:
- `avantis` on `base-mainnet`.

#### perps_market_context
```bash
node {baseDir}/scripts/perps-market-context.js --adapter avantis --chain base-mainnet --market ETH/USD
```

#### perps_position_list
Use active selected local wallet:

```bash
node {baseDir}/scripts/perps-position-list.js --adapter avantis --chain base-mainnet
```

Use explicit address:

```bash
node {baseDir}/scripts/perps-position-list.js --adapter avantis --address 0xabc --chain base-mainnet
```

#### perps_pending_orders
```bash
node {baseDir}/scripts/perps-pending-orders.js --adapter avantis --chain base-mainnet
```

#### perps_referral_info
```bash
node {baseDir}/scripts/perps-referral-info.js --adapter avantis --chain base-mainnet
```

#### perps_referral_bind_build
```bash
node {baseDir}/scripts/perps-referral-bind-build.js --adapter avantis --chain base-mainnet --referral-code CLAWDEFI
```

#### perps_referral_bind_simulate
```bash
node {baseDir}/scripts/perps-referral-bind-simulate.js --adapter avantis --chain base-mainnet --referral-code CLAWDEFI
```

#### perps_referral_bind_execute
```bash
node {baseDir}/scripts/perps-referral-bind-execute.js --adapter avantis --chain base-mainnet --referral-code CLAWDEFI
```

#### perps_open_quote
```bash
node {baseDir}/scripts/perps-open-quote.js --adapter avantis --chain base-mainnet --market ETH/USD --side long --collateral-usd 100 --leverage 3
```

#### perps_open_build
```bash
node {baseDir}/scripts/perps-open-build.js --adapter avantis --chain base-mainnet --market ETH/USD --side long --collateral-usd 100 --leverage 3 --take-profit 2400 --stop-loss 1700
```

#### perps_open_simulate
```bash
node {baseDir}/scripts/perps-open-simulate.js --adapter avantis --chain base-mainnet --market ETH/USD --side long --collateral-usd 100 --leverage 3 --take-profit 2400 --stop-loss 1700
```

#### perps_open_execute
```bash
node {baseDir}/scripts/perps-open-execute.js --adapter avantis --chain base-mainnet --market ETH/USD --side long --collateral-usd 100 --leverage 3 --take-profit 2400 --stop-loss 1700
```

#### perps_close_quote
```bash
node {baseDir}/scripts/perps-close-quote.js --adapter avantis --chain base-mainnet --position-id 12:0 --size-percent 50
```

#### perps_close_build
```bash
node {baseDir}/scripts/perps-close-build.js --adapter avantis --chain base-mainnet --position-id 12:0 --size-percent 50
```

#### perps_close_simulate
```bash
node {baseDir}/scripts/perps-close-simulate.js --adapter avantis --chain base-mainnet --position-id 12:0 --size-percent 50
```

#### perps_close_execute
```bash
node {baseDir}/scripts/perps-close-execute.js --adapter avantis --chain base-mainnet --position-id 12:0 --size-percent 50
```

#### perps_risk_orders_build
```bash
node {baseDir}/scripts/perps-risk-orders-build.js --adapter avantis --chain base-mainnet --position-id 12:0 --take-profit 2600 --stop-loss 1700
```

#### perps_risk_orders_simulate
```bash
node {baseDir}/scripts/perps-risk-orders-simulate.js --adapter avantis --chain base-mainnet --position-id 12:0 --take-profit 2600 --stop-loss 1700
```

#### perps_risk_orders_execute
```bash
node {baseDir}/scripts/perps-risk-orders-execute.js --adapter avantis --chain base-mainnet --position-id 12:0 --take-profit 2600 --stop-loss 1700
```

#### perps_modify_position_build
```bash
node {baseDir}/scripts/perps-modify-position-build.js --adapter avantis --chain base-mainnet --position-id 12:0 --update-type deposit --margin-delta-usd 25
```

#### perps_modify_position_simulate
```bash
node {baseDir}/scripts/perps-modify-position-simulate.js --adapter avantis --chain base-mainnet --position-id 12:0 --update-type withdraw --margin-delta-usd 10
```

#### perps_modify_position_execute
```bash
node {baseDir}/scripts/perps-modify-position-execute.js --adapter avantis --chain base-mainnet --position-id 12:0 --update-type deposit --margin-delta-usd 25
```

#### perps_cancel_order_build
```bash
node {baseDir}/scripts/perps-cancel-order-build.js --adapter avantis --chain base-mainnet --order-id 12:1
```

#### perps_cancel_order_simulate
```bash
node {baseDir}/scripts/perps-cancel-order-simulate.js --adapter avantis --chain base-mainnet --order-id 12:1
```

#### perps_cancel_order_execute
```bash
node {baseDir}/scripts/perps-cancel-order-execute.js --adapter avantis --chain base-mainnet --order-id 12:1
```

Perps rules:
- EVM only for now,
- do not auto-bind referral; require explicit user consent before binding or changing referral code,
- before any referral bind action, explicitly state:
`Benefit to you: trading fee discount (depends on Avantis referral tier).`
`Benefit to ClawDeFi: referral fee rebate.`
- run simulate before execute for any fund-impacting action,
- require explicit user intent before broadcasting,
- use adapter-built tx requests only (do not handcraft tx payloads in chat),
- signed intent and tx request must remain WDK-compatible (`to`, `data`, and bigint-safe value/fees),
- position/order actions require a real open position or pending order; use `perps_position_list` / `perps_pending_orders` first,
- use `perps_referral_info` first to check whether referral is already bound for the wallet,
- referral binding must go through `perps_referral_bind_build` -> `perps_referral_bind_simulate` -> `perps_referral_bind_execute`,
- never request seed phrase/private key in chat.

### V. Lending

Lending module is intentionally placeholder-only for now.
Not implemented yet.

Planned placeholder surface:
- `lending_markets`
- `lending_quote`
- `lending_build`
- `lending_simulate`
- `lending_execute`

### VI. Yield

Yield module is intentionally placeholder-only for now.
Not implemented yet.

Planned placeholder surface:
- `yield_opportunities`
- `yield_quote`
- `yield_build`
- `yield_simulate`
- `yield_execute`

### VII. Predictions

Predictions module is intentionally placeholder-only for now.
Not implemented yet.

Planned placeholder surface:
- `predictions_markets`
- `predictions_quote`
- `predictions_build`
- `predictions_simulate`
- `predictions_execute`

### VIII. Options

Options module is intentionally placeholder-only for now.
Not implemented yet.

Planned placeholder surface:
- `options_chain`
- `options_quote`
- `options_build`
- `options_simulate`
- `options_execute`
