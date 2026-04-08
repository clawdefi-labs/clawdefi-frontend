---
name: clawdefi-agent
version: 0.1.78
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
- installs `@tetherto/wdk`, `@tetherto/wdk-wallet-evm`, `@tetherto/wdk-wallet-solana`, WDK MCP toolkit (GitHub source), `@modelcontextprotocol/sdk`, `avantis-trader-sdk`, `@polymarket/clob-client`, and `@thetanuts-finance/thetanuts-client`,
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

## E. Action Routing

When the user asks about a DeFi action, **always use the skill scripts first**. Do not web-search for external information when a local script can answer.

| User intent | Action | Script |
|---|---|---|
| prediction markets, betting, Foresight, Polymarket | Run `predictions_markets` to list/search markets | `predictions-markets.js` |
| swap tokens | Run `swap_quote` then `swap_build` | `swap-*.js` |
| perps, leverage, long/short | Run `perps_fetch_market_state` | `perps-*.js` |
| lending, borrow, supply | Run lending scripts | `lending-*.js` |
| yield, staking, Pendle | Run yield scripts | `yield-*.js` |
| options, Thetanuts | Run options scripts | `options-*.js` |
| cross-chain, bridge | Run crosschain scripts | `crosschain-*.js` |
| wallet, balance, portfolio | Run wallet scripts | `wallet-*.js` |
| market data, token info | Run market intel scripts | `crypto-market-*.js` |

Rules:
- **Never web-search for market data, prices, or available markets when a skill script exists for it.** The scripts call live APIs and return real-time data.
- If a script fails, report the error to the user. Do not fall back to web search as a substitute.
- Foresight is the **default** prediction market adapter. When the user mentions "predictions", "betting", or "Foresight", run the predictions scripts directly — no `--adapter` flag needed.
- Polymarket requires explicit `--adapter polymarket`.

## F. Skill Action Model

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

#### Disclaimer Consent Status
Use to check whether the active wallet has accepted the required disclaimer version.

```bash
node {baseDir}/scripts/wallet-disclaimer-status.js
```

Explicit wallet/version:

```bash
node {baseDir}/scripts/wallet-disclaimer-status.js --wallet 0xabc --version v1
```

#### Register Disclaimer Consent
Use after explicit user consent. Write is idempotent and safe to repeat.
Requires explicit confirmation flag.

```bash
node {baseDir}/scripts/wallet-register-consent.js --confirm-consent true
```

Explicit wallet/version:

```bash
node {baseDir}/scripts/wallet-register-consent.js --wallet 0xabc --version v1 --confirm-consent true
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

Swap is now backend-planned and local-signed.

Current path:
- quote and prepare are served by ClawDeFi backend (0x adapter),
- backend returns normalized route + allowance + tx plans,
- local WDK runtime signs/simulates/executes the tx requests.

Execution boundary:
- backend must not become the signing/custody boundary,
- approval and swap tx execution remain local.

Current adapter support:
- `0x`

#### swap_quote
Returns backend quote and route data.

```bash
node {baseDir}/scripts/swap-quote.js --adapter 0x --chain base-mainnet --sell-token 0x4200000000000000000000000000000000000006 --buy-token 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913 --sell-amount 1000000000000000
```

Exact-out quote:

```bash
node {baseDir}/scripts/swap-quote.js --adapter 0x --chain base-mainnet --sell-token 0x4200000000000000000000000000000000000006 --buy-token 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913 --buy-amount 1000000 --slippage-bps 100
```

#### swap_build
Builds a deterministic local swap plan from backend prepare response.
Requires local wallet context.

```bash
node {baseDir}/scripts/swap-build.js --adapter 0x --chain base-mainnet --sell-token 0x4200000000000000000000000000000000000006 --buy-token 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913 --sell-amount 1000000000000000 --slippage-bps 100
```

With unlimited approval planning:

```bash
node {baseDir}/scripts/swap-build.js --adapter 0x --chain base-mainnet --sell-token 0x4200000000000000000000000000000000000006 --buy-token 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913 --sell-amount 1000000000000000 --approval-mode unlimited --allow-unlimited true
```

#### swap_simulate
Simulates planned approval + swap txs through local WDK quote path.

```bash
node {baseDir}/scripts/swap-simulate.js --adapter 0x --chain base-mainnet --sell-token 0x4200000000000000000000000000000000000006 --buy-token 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913 --sell-amount 1000000000000000 --slippage-bps 100
```

#### swap_execute
Executes planned approval + swap txs through local WDK signing path.

```bash
node {baseDir}/scripts/swap-execute.js --adapter 0x --chain base-mainnet --sell-token 0x4200000000000000000000000000000000000006 --buy-token 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913 --sell-amount 1000000000000000 --slippage-bps 100 --confirm-execute true
```

Swap rules:
- EVM only for now,
- run `swap_simulate` before `swap_execute`,
- require explicit `--confirm-execute true` before broadcasting,
- if approval is required, execute approval first then swap,
- `--approval-mode unlimited` requires explicit `--allow-unlimited true`,
- if backend returns disclaimer block (HTTP 412), check/register consent using wallet modules,
- optional one-shot recovery: add `--accept-disclaimer true --confirm-consent true` to auto-register then retry prepare once,
- do not request seed phrase/private key in chat,
- do not handcraft swap tx calldata in chat; use backend prepare output only.

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
- canonical ClawDeFi referral beneficiary wallet:
`0x25Aa761B02C45D2B57bBb54Dd04D42772afdd291`,
- run simulate before execute for any fund-impacting action,
- require explicit user intent before broadcasting,
- use adapter-built tx requests only (do not handcraft tx payloads in chat),
- signed intent and tx request must remain WDK-compatible (`to`, `data`, and bigint-safe value/fees),
- position/order actions require a real open position or pending order; use `perps_position_list` / `perps_pending_orders` first,
- use `perps_referral_info` first to check whether referral is already bound for the wallet,
- referral binding must go through `perps_referral_bind_build` -> `perps_referral_bind_simulate` -> `perps_referral_bind_execute`,
- never request seed phrase/private key in chat.

### V. Lending

Lending is local-first and adapter-based.

- current adapter: `aave` (manual local adapter, no added lending package dependency),
- signing/simulation/execution stays local through WDK wallet runtime,
- adapter interface is stable so future lending protocols can be added without changing wallet flow.

Use `--adapter aave` explicitly for deterministic behavior.

#### lending_markets
List supported markets:

```bash
node {baseDir}/scripts/lending-markets.js --adapter aave
```

List chain-specific market details:

```bash
node {baseDir}/scripts/lending-markets.js --adapter aave --chain base-mainnet
```

Include selected wallet account snapshot:

```bash
node {baseDir}/scripts/lending-markets.js --adapter aave --chain base-mainnet --include-account true
```

#### lending_quote
Generate a deterministic local quote preview for an action.

Supply example:

```bash
node {baseDir}/scripts/lending-quote.js --adapter aave --chain base-mainnet --action supply --token 0x4200000000000000000000000000000000000006 --amount 10000000000000000
```

Borrow example:

```bash
node {baseDir}/scripts/lending-quote.js --adapter aave --chain base-mainnet --action borrow --token 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913 --amount 5000000
```

#### lending_build
Build deterministic intent and tx request from adapter output.

```bash
node {baseDir}/scripts/lending-build.js --adapter aave --chain base-mainnet --action repay --token 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913 --amount 5000000
```

Set collateral usage:

```bash
node {baseDir}/scripts/lending-build.js --adapter aave --chain base-mainnet --action set-collateral --token 0x4200000000000000000000000000000000000006 --use-as-collateral true
```

Set E-Mode category:

```bash
node {baseDir}/scripts/lending-build.js --adapter aave --chain base-mainnet --action set-emode --category-id 1
```

#### lending_simulate
Simulate a built lending action via local wallet quote path.

```bash
node {baseDir}/scripts/lending-simulate.js --adapter aave --chain base-mainnet --action withdraw --token 0x4200000000000000000000000000000000000006 --amount 10000000000000000
```

#### lending_execute
Execute a built lending action via local wallet signing + broadcast path.

```bash
node {baseDir}/scripts/lending-execute.js --adapter aave --chain base-mainnet --action supply --token 0x4200000000000000000000000000000000000006 --amount 10000000000000000
```

Lending rules:
- EVM only for now,
- run simulate before execute for fund-impacting actions,
- for `supply` and `repay`, verify allowance first and set allowance when needed,
- require explicit user intent before broadcasting,
- use adapter-built tx requests only (do not handcraft calldata in chat),
- signed intent and tx request must remain WDK-compatible (`to`, `data`, bigint-safe value/fees),
- never request seed phrase/private key in chat.

### VI. Predictions

Predictions execution is local-first and adapter-based. **When the user asks about prediction markets, betting, or Foresight — run the scripts below. Do not web-search.**

The default adapter is Foresight. No `--adapter` flag is needed. Just run the scripts.

Current adapters:
- `foresight` (Base, AMM on-chain) — **default**
- `polymarket` (Polygon, CLOB order-book)

#### Foresight architecture

- AMM-style prediction market on Base mainnet (chain ID 8453).
- API at `https://api.foresight.now` returns transaction calldata; execution is fully on-chain.
- No API keys needed; no off-chain order signing.
- Settlement in USDC on Base (`0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`).
- Limit orders are not supported; the adapter converts limit intents to market orders with a warning.
- `tradeTokenId` is a synthetic `{marketId}-yes` or `{marketId}-no` identifier.

#### Polymarket architecture

- `Gamma` is discovery/metadata (market catalog, outcomes, status, slugs, condition IDs, CLOB token IDs),
- `CLOB` is trading (orderbook, quotes, signed order submission, open orders, fills).

ID model:
- `marketId` and `slug` come from Gamma,
- `conditionId` is market identity on CLOB side,
- `tradeTokenId` (CLOB token ID) is the outcome token used for order placement,
- `orderId` / trade fills are returned by CLOB after submission.

Local signing and authority boundary:
- order signing stays local through WDK wallet,
- CLOB API authentication is derived locally (API key/secret/passphrase),
- no backend custody/signing path is used for predictions execution.

#### Foresight workflow

When user wants to bet on Foresight:
1. **List markets** → `predictions-markets.js --mode list` — show available markets
2. **User picks a market** → note the `marketId`
3. **Quote** → `predictions-quote.js --market-id <id> --outcome yes --side buy --amount <usdc>` — show price/shares
4. **Simulate** → `predictions-simulate.js` — verify approval + trade tx
5. **Execute** → `predictions-execute.js --confirm-execute true` — send on-chain

#### Foresight examples (default adapter)

##### predictions_markets

List markets:

```bash
node {baseDir}/scripts/predictions-markets.js --mode list --limit 25
```

Search markets:

```bash
node {baseDir}/scripts/predictions-markets.js --mode search --query bitcoin --limit 25
```

Get a specific market:

```bash
node {baseDir}/scripts/predictions-markets.js --mode get --market-id <id> --outcome yes
```

##### predictions_quote

```bash
node {baseDir}/scripts/predictions-quote.js --market-id <id> --outcome yes --side buy --amount 50
```

##### predictions_build

Build on-chain trade calldata with USDC approval plan.

```bash
node {baseDir}/scripts/predictions-build.js --market-id <id> --outcome yes --side buy --amount 50
```

##### predictions_simulate

Simulate approval tx steps via local WDK quote path.

```bash
node {baseDir}/scripts/predictions-simulate.js --market-id <id> --outcome yes --side buy --amount 50
```

##### predictions_execute

Execute approval steps (if required), then send trade transaction on-chain.
Requires explicit execute confirmation.

```bash
node {baseDir}/scripts/predictions-execute.js --market-id <id> --outcome yes --side buy --amount 50 --confirm-execute true
```

#### Polymarket examples

##### predictions_markets

Discover and resolve markets through Gamma (with CLOB cross-resolution when needed).

List:

```bash
node {baseDir}/scripts/predictions-markets.js --adapter polymarket --mode list --limit 25 --active true --closed false
```

Search:

```bash
node {baseDir}/scripts/predictions-markets.js --adapter polymarket --mode search --query election --limit 50
```

Get by slug:

```bash
node {baseDir}/scripts/predictions-markets.js --adapter polymarket --mode get --slug will-bitcoin-hit-150k-in-2026
```

##### predictions_quote

Resolve market/outcome -> `tradeTokenId`, then fetch CLOB quote context (book/mid/spread/tick/negRisk).

Limit quote context:

```bash
node {baseDir}/scripts/predictions-quote.js --adapter polymarket --slug will-bitcoin-hit-150k-in-2026 --outcome yes --side buy --order-kind limit --price 0.45 --size 20
```

Market quote context:

```bash
node {baseDir}/scripts/predictions-quote.js --adapter polymarket --slug will-bitcoin-hit-150k-in-2026 --outcome no --side sell --order-kind market --amount 15 --order-type FOK
```

##### predictions_build

Build deterministic signed order intent locally (EIP-712 signed order, not yet posted).
Includes approval plan for collateral/operator setup.

```bash
node {baseDir}/scripts/predictions-build.js --adapter polymarket --slug will-bitcoin-hit-150k-in-2026 --outcome yes --side buy --order-kind limit --price 0.45 --size 20 --order-type GTC
```

##### predictions_simulate

Simulate any required on-chain approval tx steps via local WDK quote path.
Order submission itself is off-chain CLOB posting and is not on-chain simulated.

```bash
node {baseDir}/scripts/predictions-simulate.js --adapter polymarket --slug will-bitcoin-hit-150k-in-2026 --outcome yes --side buy --order-kind market --amount 25 --order-type FOK
```

##### predictions_execute

Execute approval steps locally (if required), then submit signed order to CLOB.
Requires explicit execute confirmation.

```bash
node {baseDir}/scripts/predictions-execute.js --adapter polymarket --slug will-bitcoin-hit-150k-in-2026 --outcome yes --side buy --order-kind market --amount 25 --order-type FOK --confirm-execute true
```

Predictions rules:
- Polymarket uses Polygon EVM path (`polygon-pos`, optional `polygon-amoy`); Foresight uses Base (`base-mainnet`),
- always resolve outcome to a deterministic `tradeTokenId` before order actions,
- if `--signature-type` is `poly-proxy` or `poly-gnosis-safe`, `--funder-address` is required (Polymarket only),
- run `predictions_simulate` before `predictions_execute` for fund-impacting actions,
- `--approval-mode unlimited` requires explicit `--allow-unlimited true`,
- execution requires explicit `--confirm-execute true`,
- do not request seed phrase/private key in chat.

### VII. Yield

Yield is local-first and adapter-based.

Current adapter:
- `pendle`

Execution model:
- opportunity discovery and quote/build planning use Pendle APIs,
- approval checks and transaction simulation/execution use local WDK runtime,
- signing and custody stay local.

#### yield_opportunities
Discover Pendle opportunities with category and APY/liquidity filters.

```bash
node {baseDir}/scripts/yield-opportunities.js --adapter pendle --chain ethereum-mainnet --categories stables,eth --min-liquidity-usd 500000 --sort-by implied-apy --sort-order desc --limit 20
```

Yield query notes:
- categories are passed as comma-separated values (`stables`, `eth`, `btc`, `rwa`, `points`, `others`, etc),
- if `--chain` / `--chain-id` is not provided, script uses wallet-selected chain when available; unsupported defaults fall back to Ethereum with warning,
- add `--include-account true` to resolve the local WDK wallet address and include it in response context,
- this module is WDK-compatible (wallet context resolution only); no remote signing/custody.

#### yield_quote
Get deterministic Pendle convert route + required approval context.

```bash
node {baseDir}/scripts/yield-quote.js --adapter pendle --chain base-mainnet --tokens-in 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913 --amounts-in 1000000 --tokens-out 0x4df7d78766D1A7D4f6F49660fD5dD60B7d0cf4c6 --route-index 0 --slippage-bps 50
```

#### yield_build
Build deterministic execution plan (approval steps + convert step) and intent hash.

```bash
node {baseDir}/scripts/yield-build.js --adapter pendle --chain base-mainnet --tokens-in 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913 --amounts-in 1000000 --tokens-out 0x4df7d78766D1A7D4f6F49660fD5dD60B7d0cf4c6 --route-index 0 --approval-mode exact
```

Unlimited approval planning (explicit opt-in required):

```bash
node {baseDir}/scripts/yield-build.js --adapter pendle --chain base-mainnet --tokens-in 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913 --amounts-in 1000000 --tokens-out 0x4df7d78766D1A7D4f6F49660fD5dD60B7d0cf4c6 --approval-mode unlimited --allow-unlimited true
```

#### yield_simulate
Simulate each planned tx step locally (approval + convert) through WDK quote path.

```bash
node {baseDir}/scripts/yield-simulate.js --adapter pendle --chain base-mainnet --tokens-in 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913 --amounts-in 1000000 --tokens-out 0x4df7d78766D1A7D4f6F49660fD5dD60B7d0cf4c6 --route-index 0 --approval-mode exact
```

#### yield_execute
Execute each planned tx step locally via WDK signing + broadcast.
Requires explicit execute confirmation.

```bash
node {baseDir}/scripts/yield-execute.js --adapter pendle --chain base-mainnet --tokens-in 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913 --amounts-in 1000000 --tokens-out 0x4df7d78766D1A7D4f6F49660fD5dD60B7d0cf4c6 --route-index 0 --approval-mode exact --confirm-execute true
```

Yield rules:
- EVM only for now (Pendle-supported chains),
- run `yield_simulate` before `yield_execute`,
- execution requires explicit `--confirm-execute true`,
- `--approval-mode unlimited` requires explicit `--allow-unlimited true`,
- use adapter-built tx requests only; do not handcraft calldata in chat,
- do not request seed phrase/private key in chat.

### VIII. Options

Options execution is local-first and adapter-based.

Current adapter:
- `thetanuts`

Execution model:
- discovery and quote use Thetanuts API + pricing surfaces,
- deterministic local planning builds approval + fill steps,
- signing/simulation/broadcast stays local through WDK wallet runtime.

Current venue support:
- Base mainnet only (`base-mainnet`, chainId `8453`).

#### options_chain
Show supported chain config, contracts, token addresses, and default referrer context.

```bash
node {baseDir}/scripts/options-chain.js --adapter thetanuts --chain base-mainnet
```

#### options_market_data
Fetch market spot data and optional options pricing snapshots.

```bash
node {baseDir}/scripts/options-market-data.js --adapter thetanuts --chain base-mainnet --underlying ETH --include-pricing true --limit 25
```

Include protocol stats:

```bash
node {baseDir}/scripts/options-market-data.js --adapter thetanuts --chain base-mainnet --include-stats true
```

#### options_orderbook
List and filter currently fillable options orders.

```bash
node {baseDir}/scripts/options-orderbook.js --adapter thetanuts --chain base-mainnet --underlying ETH --option-type put --limit 20
```

Select sorting and include expired:

```bash
node {baseDir}/scripts/options-orderbook.js --adapter thetanuts --chain base-mainnet --sort-by expiry --sort-order desc --include-expired true
```

#### options_quote
Preview deterministic fill details for a selected order.

Use order index from filtered orderbook:

```bash
node {baseDir}/scripts/options-quote.js --adapter thetanuts --chain base-mainnet --underlying ETH --option-type call --order-index 0 --amount 10000000
```

Or select by order key:

```bash
node {baseDir}/scripts/options-quote.js --adapter thetanuts --chain base-mainnet --order-key 0xmaker:123 --amount-usdc 10.5
```

#### options_positions
Fetch user options positions from indexer view.

Use selected local wallet:

```bash
node {baseDir}/scripts/options-positions.js --adapter thetanuts --chain base-mainnet --status open
```

Use explicit address:

```bash
node {baseDir}/scripts/options-positions.js --adapter thetanuts --chain base-mainnet --address 0xabc --status all --limit 100
```

#### options_build
Build deterministic approval + fill plan and intent hash.

```bash
node {baseDir}/scripts/options-build.js --adapter thetanuts --chain base-mainnet --underlying ETH --option-type call --order-index 0 --amount 10000000 --approval-mode exact
```

Unlimited approval planning (explicit opt-in required):

```bash
node {baseDir}/scripts/options-build.js --adapter thetanuts --chain base-mainnet --order-key 0xmaker:123 --amount-usdc 20 --approval-mode unlimited --allow-unlimited true
```

#### options_simulate
Simulate each planned tx step locally (approval + fill) through WDK quote path.

```bash
node {baseDir}/scripts/options-simulate.js --adapter thetanuts --chain base-mainnet --order-index 0 --amount 10000000 --approval-mode exact
```

#### options_execute
Execute each planned tx step locally via WDK signing + broadcast.
Requires explicit execute confirmation.

```bash
node {baseDir}/scripts/options-execute.js --adapter thetanuts --chain base-mainnet --order-index 0 --amount 10000000 --approval-mode exact --confirm-execute true
```

Options rules:
- EVM Base mainnet only for now,
- run `options_simulate` before `options_execute`,
- execution requires explicit `--confirm-execute true`,
- `--approval-mode unlimited` requires explicit `--allow-unlimited true`,
- use adapter-built tx requests only; do not handcraft calldata in chat,
- do not request seed phrase/private key in chat.

### IX. Cross-Chain Swap

Cross-chain swap is now a dedicated category with lifecycle-aware modules.

Execution model:
- backend provides route quote/build/status lifecycle through `crosschain_plan.v1`,
- local WDK runtime signs and broadcasts source-chain tx steps,
- agent polls status until settled (or refund-required),
- claim/refund modules exist for routes that require them.

Current adapter support:
- `0x` (sim lifecycle adapter path; modular contract kept for future real bridge adapters).

#### crosschain_quote
Quote a cross-chain route and lifecycle estimate.

```bash
node {baseDir}/scripts/crosschain-quote.js --adapter 0x --source-chain base-mainnet --destination-chain ethereum-mainnet --sell-token 0x4200000000000000000000000000000000000006 --buy-token 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48 --sell-amount 1000000000000000 --slippage-bps 100
```

#### crosschain_build
Build deterministic source execution plan (approval + source bridge tx) and request id.

```bash
node {baseDir}/scripts/crosschain-build.js --adapter 0x --source-chain base-mainnet --destination-chain ethereum-mainnet --sell-token 0x4200000000000000000000000000000000000006 --buy-token 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48 --sell-amount 1000000000000000 --approval-mode exact
```

#### crosschain_execute_source
Execute source tx steps locally, then register source tx hash to start lifecycle tracking.

```bash
node {baseDir}/scripts/crosschain-execute-source.js --adapter 0x --source-chain base-mainnet --destination-chain ethereum-mainnet --sell-token 0x4200000000000000000000000000000000000006 --buy-token 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48 --sell-amount 1000000000000000 --approval-mode exact --confirm-execute true
```

#### crosschain_status
Poll lifecycle status using request id.

```bash
node {baseDir}/scripts/crosschain-status.js --adapter 0x --request-id <request_id>
```

#### crosschain_claim
Execute claim path when route status is `claim_required`.

Dry-run:

```bash
node {baseDir}/scripts/crosschain-claim.js --adapter 0x --request-id <request_id> --dry-run true
```

Execute:

```bash
node {baseDir}/scripts/crosschain-claim.js --adapter 0x --request-id <request_id> --confirm-execute true
```

#### crosschain_refund
Execute refund path when route status is `refund_required`.

Dry-run:

```bash
node {baseDir}/scripts/crosschain-refund.js --adapter 0x --request-id <request_id> --dry-run true
```

Execute:

```bash
node {baseDir}/scripts/crosschain-refund.js --adapter 0x --request-id <request_id> --confirm-execute true
```

Cross-chain rules:
- run `crosschain_quote` then `crosschain_build` before broadcasting,
- source execution requires explicit `--confirm-execute true`,
- `--approval-mode unlimited` requires explicit `--allow-unlimited true`,
- if backend returns disclaimer block (HTTP 412), check/register consent using wallet modules,
- optional one-shot recovery: add `--accept-disclaimer true --confirm-consent true` to auto-register then retry build once,
- always poll `crosschain_status` until terminal state (`completed`, `refunded`, or `claim_required` followed by claim),
- do not handcraft source bridge tx calldata in chat; use backend build output only,
- do not request seed phrase/private key in chat.
