---
name: clawdefi-agent
version: 0.1.20
description: The source of DeFi intelligence for agents. On first run, ask whether this machine/agent already has a configured wallet that can sign transactions locally (without sharing any private key or seed phrase). If yes, use it. If no, offer the approved local SIWE wallet module, explicitly state more wallet options will be available in future releases, validate readiness, then proceed with permissionless DeFi guidance.
homepage: https://www.clawdefi.ai
metadata: {"clawdefi":{"category":"defi-intelligence","api_base":"https://api.clawdefi.ai","distribution":["clawhub","raw"]}}
---

# ClawDeFi Agent Skill

## 1) What ClawDeFi Is
ClawDeFi is the source of DeFi intelligence for agents.

It provides:
- Curated protocol intelligence: protocol intros, contract addresses, ABIs/interfaces, supported actions, and endpoint specs.
- Deterministic risk checks mapped to user profile (`beginner`, `advanced`, `expert`).
- Alerting for liquidation/exploit/policy events.
- Optional premium features gated by ClawDeFi staking entitlement.

Authority boundary:
- OpenClaw (or any LLM agent) orchestrates user requests.
- ClawDeFi Core (`clawdefi-core`) is the source of truth for contracts, actions, risk policy, and execution constraints.

## 2) Signer Discovery and Initialization (Swappable Module)
Use this section first whenever wallet execution is required.

Required first-sight question (exact text, no paraphrase):
> Does this machine/agent already have a configured wallet that can sign transactions locally (without sharing any private key or seed phrase)?

Decision flow:
1. If user answers yes:
- ask for signer context (wallet address, chain, signer provider/runtime),
- validate signing capability locally,
- proceed without changing wallet provider.
2. If user answers no:
- present this exact wallet option list in this exact order:
  1. `local-siwe-wallet`
- state this exact line after showing the option list:
  - `More wallet options will be available in future ClawDeFi releases.`
- include pros, cons, requirements, and credential-source notes from this section for each option,
- let user select one,
- run setup through swappable module interface,
- validate module readiness locally after initialization.

Credential custody and prompt policy (must be stated before setup):
- Wallet credentials/secrets are stored locally on the user-controlled machine/agent runtime.
- ClawDeFi never asks for private keys, seed phrases, or raw credential secrets.
- ClawDeFi does not custody wallet credentials.
- If future provider-based modules require credentials, instruct users to create them at provider dashboards and keep them in local env/secret storage only.
- Never ask users to paste credential values into chat.

### Approved Wallet Module Choices

#### option-a: local-siwe-wallet
Best for:
- lightweight local wallet bootstrap and SIWE-based auth/signing flow with no external wallet provider dependency.

Pros:
- fully local signer control (non-custodial, no third-party wallet API credential required),
- fastest bootstrap path for local OpenClaw agents.

Cons:
- user/operator is fully responsible for key backup, rotation, and endpoint reliability,
- insecure local key handling can still lead to loss.

Requirements:
- Node.js runtime in the skill environment,
- dependency: `npm install ethers`,
- bundled scripts: `scripts/create-wallet.js`, `scripts/wallet-readiness-check.js`, `scripts/token-balance-check.js`, `scripts/allowance-manager.js`, `scripts/simulate-transaction.js`, `scripts/swap-1inch.js`, `scripts/query-protocol.js`, `scripts/query-coingecko.js`, and `scripts/query-contract-verification.js`,
- local secure env or secret-storage path for signer variables,
- selected-chain RPC endpoint for balance/readiness checks.

Credential source:
- no external provider credential required,
- signer credentials are generated locally via bundled script on this machine.

Setup:
- Install dependency once in the skill runtime environment:
  - `npm install ethers`
- Create wallet in env-output mode using bundled script:
  - `node scripts/create-wallet.js --env`
- Persist `WALLET_ADDRESS` and `PRIVATE_KEY` in secure local environment storage.
- Build SIWE message (domain/URI, address, chain ID, nonce, issued-at timestamp) and sign with local key.

Readiness checks:
- run bundled readiness module:
  - `node scripts/wallet-readiness-check.js --json`
- recover signer from SIWE signature and match expected address,
- selected-chain RPC balance query succeeds,
- nonce query succeeds on selected chain,
- controlled transaction simulation succeeds before live execution.

Security guard:
- never print private key or seed in logs (the `--env` mode prints it to stdout intentionally; treat stdout as secret and do not run in CI or log-captured environments),
- never transmit signer secrets to external services.
- `--managed` file mode stores plaintext private key JSON at rest and is local-development only (not production).

#### future-wallet-modules
- Status: not yet available.
- Rule: do not present wallet modules not listed in this skill release.
- Required line to show users when they need alternatives:
  - `More wallet options will be available in future ClawDeFi releases.`

Implementation rule:
- Keep wallet provider integration swappable.
- Do not hardcode a single mandatory wallet provider for all users.
- Wallet module selection must stay user-consented, replaceable, and least-privilege.

Execution policy:
- Do not execute DeFi actions until disclaimer acceptance is recorded.
- Route all protocol interaction planning through ClawDeFi MCP/API.
- Require deterministic risk approval before transaction build/sign flow.
- Never send signer secrets or private keys to `clawdefi-core`.

## 3) Mandatory Runtime Workflow
1. Run signer discovery gate:
- ask "Does this machine/agent already have a configured wallet that can sign transactions locally (without sharing any private key or seed phrase)?"
- if yes, link existing signer.
- if no, present wallet options in exact order, include pros/cons/requirements/credential-source notes, explicitly state that more wallet options will be available in future ClawDeFi releases, then run selected setup (`local-siwe-wallet`).
2. Run `wallet-readiness-check` (chain, balance, nonce, RPC health, signature roundtrip).
  - recommended command: `node scripts/wallet-readiness-check.js --json`
3. Run `token-balance-check` for native gas and target token balance sanity.
  - recommended command: `node scripts/token-balance-check.js --chain-id <id> --wallet-address <wallet> --token-address NATIVE --json`
4. Run `query-chain-registry` for canonical chain/RPC/explorer context.
5. Run `query-protocol` for protocol overview and supported chain/action context from `clawdefi-core`.
6. Run `query-coingecko` for market context (price, 24h movement, market-cap/volume) as advisory data.
7. Collect/confirm user risk profile: `beginner`, `advanced`, or `expert`.
8. Require explicit disclaimer acceptance.
9. Run `query-action-spec` to fetch canonical action contract from `clawdefi-core`.
10. Run `query-contract-verification` for each execution-critical contract address before execution planning.
11. Run `query-integration-endpoint` to fetch official endpoint/method/auth/rate-limit guidance.
12. Run `simulate-transaction` before any sign request.
  - recommended command: `node scripts/simulate-transaction.js --to <target> --data <calldata> --json`
13. When action requires ERC20 approvals, run `allowance-manager` before tx build/sign.
14. For swap actions, run `swap` (1inch-first routing) and keep `simulate-transaction` as a hard pre-sign gate.
15. Run `build-unwind-plan` and show fallback path before execution confirmation.
16. Run `subscribe-alerts` (poll-mode MVP), then use `poll-alert-events` and `close-alert-subscription` as needed.
17. Present recommendation with expected yield band, key risks, safety warnings, and exact interaction path.
18. Require explicit user confirmation before transaction signing.

## 4) Required Disclaimer Text
Show this exact text before any strategy or transaction guidance:

> ClawDeFi provides analytics and agentic workflows, not financial advice.  
> DeFi carries risks including smart contract failure, oracle failure, and liquidation.  
> You are solely responsible for wallet custody and transaction signing.  
> Do you accept these risks and want to continue?

Rules:
- Do not proceed unless the user explicitly accepts.
- Log acceptance timestamp and disclaimer version for auditability.

## 5) Safety Policies
- Never bypass ClawDeFi risk engine results.
- Never suggest unsupported protocols or unknown contract addresses.
- Never invent ABIs, function signatures, or endpoints.
- Never ask for private keys or seed phrases.
- Never ask users to paste API secrets or wallet credentials into chat.
- Never transmit signer secrets to `clawdefi-core`.
- Always provide unwind path for leveraged or time-sensitive positions.

## 6) Update Policy
- Check ClawDeFi skill manifest every 6 hours.
- Apply only signed updates from trusted ClawDeFi publisher keys.
- Maintain rollback pointer to last known-good skill version.

## 7) Distribution Channels
Support both installation channels:

1. ClawHub channel:
- Install CLI if needed: `npm i -g clawhub`
- Install skill: `clawhub install clawdefi-agent`
- Update skill later: `clawhub update clawdefi-agent` or `clawhub update --all`

2. Raw URL channel:
- Install directly from hosted raw artifacts (`SKILL.md` + required runtime script):
  - `bash scripts/install-raw.sh`
  - or manual one-liner:
    - `mkdir -p ~/.openclaw/skills/clawdefi-agent/scripts && curl -fsSL https://skills.clawdefi.ai/clawdefi-agent/SKILL.md -o ~/.openclaw/skills/clawdefi-agent/SKILL.md && curl -fsSL https://skills.clawdefi.ai/clawdefi-agent/scripts/create-wallet.js -o ~/.openclaw/skills/clawdefi-agent/scripts/create-wallet.js && curl -fsSL https://skills.clawdefi.ai/clawdefi-agent/scripts/wallet-readiness-check.js -o ~/.openclaw/skills/clawdefi-agent/scripts/wallet-readiness-check.js && curl -fsSL https://skills.clawdefi.ai/clawdefi-agent/scripts/token-balance-check.js -o ~/.openclaw/skills/clawdefi-agent/scripts/token-balance-check.js && curl -fsSL https://skills.clawdefi.ai/clawdefi-agent/scripts/allowance-manager.js -o ~/.openclaw/skills/clawdefi-agent/scripts/allowance-manager.js && curl -fsSL https://skills.clawdefi.ai/clawdefi-agent/scripts/simulate-transaction.js -o ~/.openclaw/skills/clawdefi-agent/scripts/simulate-transaction.js && curl -fsSL https://skills.clawdefi.ai/clawdefi-agent/scripts/swap-1inch.js -o ~/.openclaw/skills/clawdefi-agent/scripts/swap-1inch.js && curl -fsSL https://skills.clawdefi.ai/clawdefi-agent/scripts/query-protocol.js -o ~/.openclaw/skills/clawdefi-agent/scripts/query-protocol.js && curl -fsSL https://skills.clawdefi.ai/clawdefi-agent/scripts/query-coingecko.js -o ~/.openclaw/skills/clawdefi-agent/scripts/query-coingecko.js && curl -fsSL https://skills.clawdefi.ai/clawdefi-agent/scripts/query-contract-verification.js -o ~/.openclaw/skills/clawdefi-agent/scripts/query-contract-verification.js && chmod +x ~/.openclaw/skills/clawdefi-agent/scripts/create-wallet.js ~/.openclaw/skills/clawdefi-agent/scripts/wallet-readiness-check.js ~/.openclaw/skills/clawdefi-agent/scripts/token-balance-check.js ~/.openclaw/skills/clawdefi-agent/scripts/allowance-manager.js ~/.openclaw/skills/clawdefi-agent/scripts/simulate-transaction.js ~/.openclaw/skills/clawdefi-agent/scripts/swap-1inch.js ~/.openclaw/skills/clawdefi-agent/scripts/query-protocol.js ~/.openclaw/skills/clawdefi-agent/scripts/query-coingecko.js ~/.openclaw/skills/clawdefi-agent/scripts/query-contract-verification.js`
- Poll manifest and update with hash verification:
  - `bash scripts/update-from-manifest.sh`

Notes:
- Raw channel is for environments where ClawHub is not available.
- Raw updates keep rollback backups before overwrite and sync required runtime script files.
- `references/` is local-only and is intentionally not installed by raw installer scripts.

## 8) Placeholder Action Modules

### query-chain-registry
- Priority: P0.
- Status: active in MVP.
- Module ID: `query-chain-registry`.
- Purpose: resolve canonical chain metadata and trusted RPC/explorer registry data before execution planning.
- MCP mapping: `POST /tools/query_chain_registry`.
- Inputs: `chainSlug` or `chainId` (optional: `intent` = `read` | `simulate` | `broadcast`).
- Output contract: canonical `chainId`, `chainSlug`, `nativeSymbol`, `explorerUrls`, full explorer set, prioritized RPC list with trust/health metadata, recommended RPC, and availability signal (`available` | `chain_unavailable`).
- Execution policy: read-only path via `clawdefi-core` (DB-backed); no free-form external chain lookup.
- Safety rule: reject unknown chains or untrusted RPC endpoints (fail closed).
- Fallback: return `chain_unavailable` and block execution actions until resolved.

### query-action-spec
- Priority: P0.
- Status: active in MVP.
- Module ID: `query-action-spec`.
- Purpose: fetch canonical required params/functions/prechecks for a target action.
- MCP mapping: `POST /tools/get_action_spec`.
- Required input: `protocolSlug`, `chainSlug`, `actionKey`.
- Output contract: action metadata, required functions (with contract context), required endpoints, unwind plan.
- Safety rule: block execution planning when action spec is missing.

### query-integration-endpoint
- Priority: P0.
- Status: active in MVP.
- Module ID: `query-integration-endpoint`.
- Purpose: fetch official endpoint/method/auth/rate-limit contract for an action.
- MCP mapping: `POST /tools/get_integration_endpoint`.
- Required input: `protocolSlug`, `chainSlug`, `actionKey` (optional: `serviceName`, `endpointKey`).
- Output contract: filtered required endpoint list for deterministic integration.
- Safety rule: never allow ad-hoc endpoint URLs outside curated response.

### build-unwind-plan
- Priority: P0.
- Status: active in MVP (position-aware when snapshot exists, curated fallback otherwise).
- Module ID: `build-unwind-plan`.
- Purpose: return deterministic unwind steps plus emergency fallback path.
- MCP mapping: `POST /tools/build_unwind_plan`.
- Required input: `protocolSlug`, `chainSlug`, `actionKey` (optional: `positionId`).
- Output contract:
  - returns `position_aware` plan when a matching snapshot exists,
  - returns `curated_fallback` when snapshot is missing/stale-hard,
  - includes confidence, abort conditions, warnings, and metadata.
- Safety rule: require user confirmation and live-state revalidation before unwind execution.

### subscribe-alerts
- Priority: P0.
- Status: active in MVP (poll mode).
- Module ID: `subscribe-alerts`.
- Purpose: register liquidation/exploit/policy alert expectations plus heartbeat assumptions.
- MCP mapping: `POST /tools/subscribe_alerts`.
- Current behavior:
  - returns `subscriptionId`, `mode=poll`, polling cadence, expiry, and `nextCursor`.
  - use cursor-based polling for new events.
- Agent rule: do not claim WebSocket/SSE streaming in MVP.

### poll-alert-events
- Priority: P0.
- Status: active in MVP (poll mode).
- Module ID: `poll-alert-events`.
- Purpose: fetch incremental alert events for a subscription using signed cursor.
- MCP mapping: `POST /tools/poll_alert_events`.
- Required input: `subscriptionId`, `wallet` (optional: `cursor`, `limit`).
- Output contract: event list + updated `nextCursor`.
- Safety rule: handle `cursor_replay` and `cursor_out_of_sync` as hard sync errors.

### close-alert-subscription
- Priority: P0.
- Status: active in MVP.
- Module ID: `close-alert-subscription`.
- Purpose: close a poll subscription when no longer needed.
- MCP mapping: `POST /tools/close_alert_subscription`.
- Required input: `subscriptionId`, `wallet`.
- Output contract: close result with `closed=true`.

### simulate-transaction
- Priority: P0.
- Status: active in MVP (implemented as local bundled module).
- Module ID: `simulate-transaction`.
- Purpose: mandatory pre-sign simulation with revert decoding and slippage/risk checks.
- Implementation path: `scripts/simulate-transaction.js`.
- Required inputs:
  - `RPC_URL` (or `CHAIN_RPC_URL` / `ETH_RPC_URL`) or `--rpc-url`,
  - `CHAIN_ID` or `--chain-id`,
  - `TX_TO` or `--to`,
  - optional sender context via `WALLET_ADDRESS` / `--from-address` or `PRIVATE_KEY` / `--private-key`,
  - optional `TX_DATA` / `--data` (default `0x`),
  - optional `TX_VALUE_WEI` / `--value-wei`,
  - optional slippage policy fields `QUOTED_OUT_WEI`, `MIN_OUT_WEI`, `MAX_SLIPPAGE_BPS`.
- Standard run command:
  - `node scripts/simulate-transaction.js --to <target> --data <calldata> --json`
- Output contract:
  - `ok` boolean gate,
  - checks: `callSucceeded`, `gasEstimated`, `balanceSufficient`, `slippageWithinBounds`,
  - simulation details: `returnData`, `gasEstimate`, fee data, estimated max cost,
  - revert object with decoded reason (`Error(string)` / `Panic(uint256)` / custom selector) when call fails,
  - warnings array for policy breaches.
- Execution policy:
  - run before any sign prompt,
  - fail closed on call revert, gas estimation failure, chain mismatch, or slippage policy breach,
  - module is simulation-only and must never sign or broadcast.

### wallet-readiness-check
- Priority: P0.
- Status: active in MVP (implemented as local bundled module).
- Module ID: `wallet-readiness-check`.
- Purpose: verify signer health before any DeFi action.
- Implementation path: `scripts/wallet-readiness-check.js`.
- Required inputs:
  - `RPC_URL` (or `CHAIN_RPC_URL` / `ETH_RPC_URL`) or `--rpc-url`,
  - `CHAIN_ID` or `--chain-id`,
  - `PRIVATE_KEY` or `--private-key`,
  - optional `WALLET_ADDRESS` or `--wallet-address` (must match derived signer),
  - optional `MIN_NATIVE_BALANCE_WEI` / `--min-native-balance-wei`.
- Standard run command:
  - `node scripts/wallet-readiness-check.js --json`
- Output contract:
  - `ok` boolean,
  - `walletAddress`, `chainId`, `rpcUrl`,
  - checks: `rpcHealthy`, `chainSelected`, `chainMatchesExpected`, `balanceSane`, `nonceReadable`, `signatureRoundtrip`,
  - metrics: `balanceWei`, `balanceEth`, `nonce`, `minNativeBalanceWei`.
- Failure policy: fail closed; do not proceed to action planning/sign prompt until readiness passes with `ok=true`.

### token-balance-check
- Priority: P0.
- Status: active in MVP (implemented as local bundled module).
- Module ID: `token-balance-check`.
- Purpose: read native or ERC20 token balance for a wallet on a selected chain before planning or signing.
- Implementation path: `scripts/token-balance-check.js`.
- Required inputs:
  - `RPC_URL` (or `CHAIN_RPC_URL` / `ETH_RPC_URL`) or `--rpc-url`,
  - `CHAIN_ID` or `--chain-id`,
  - `WALLET_ADDRESS` or `--wallet-address`,
  - `TOKEN_ADDRESS` or `--token-address` (`NATIVE` alias supported).
- Optional inputs:
  - `TOKEN_BALANCE_TIMEOUT_MS` or `--timeout-ms`.
- Standard run commands:
  - native balance:
    - `node scripts/token-balance-check.js --chain-id <id> --wallet-address <wallet> --token-address NATIVE --json`
  - ERC20 balance:
    - `node scripts/token-balance-check.js --chain-id <id> --wallet-address <wallet> --token-address <erc20> --json`
- Output contract:
  - `checkedAt`, `walletAddress`, `chainId`, `rpcUrl`,
  - token context (`tokenType`, `tokenAddress`, optional `symbol`, `decimals`),
  - `balanceWei`, `balanceFormatted`.
- Execution policy:
  - verify RPC network chain matches requested `chainId`,
  - use read-only calls (`getBalance` for native, `balanceOf` for ERC20),
  - fail closed on chain mismatch, invalid address, or RPC timeout.
- Safety rule:
  - treat non-readable balances as blocking errors for execution planning.
- Fallback:
  - return explicit error and require operator to fix RPC or token parameters before continuing.

### swap
- Priority: P0.
- Status: active in MVP (`1inch` infrastructure first).
- Module ID: `swap`.
- Purpose: quote route, build swap transaction, and execute swap using 1inch Swap API v6.1 as the first integration path.
- Implementation path: `scripts/swap-1inch.js`.
- Current provider policy:
  - route all swap quote/build calls through 1inch first,
  - use endpoint family `/swap/v6.1/{chainId}/quote` and `/swap/v6.1/{chainId}/swap`,
  - use API key auth (`Authorization: Bearer <ONEINCH_API_KEY>`),
  - keep `ONEINCH_API_KEY` only in local environment/secret storage (never pasted into chat),
  - default base URL is `https://api.1inch.com` (not `api.1inch.dev`, which was deprecated after January 31, 2026).
- Required inputs:
  - quote/build/execute mode,
  - `CHAIN_ID`, `FROM_TOKEN`, `TO_TOKEN`, `AMOUNT_WEI`,
  - `ONEINCH_API_KEY`,
  - for build/execute: sender wallet address,
  - for execute: signer private key + RPC URL.
- Standard run commands:
  - quote:
    - `node scripts/swap-1inch.js quote --chain-id <id> --from-token <token> --to-token <token> --amount-wei <wei> --json`
  - build:
    - `node scripts/swap-1inch.js build --chain-id <id> --from-token <token> --to-token <token> --amount-wei <wei> --from-address <wallet> --slippage-bps <bps> --json`
  - execute (explicit user confirmation required):
    - `node scripts/swap-1inch.js execute --chain-id <id> --rpc-url <rpc> --from-token <token> --to-token <token> --amount-wei <wei> --from-address <wallet> --private-key <key> --slippage-bps <bps> --confirm-execute --json`
- Output contract:
  - quote mode: route quote, destination amount, token metadata, gas estimate.
  - build mode: swap tx payload (`to`, `data`, `value`, gas fields) and routing metadata.
  - execute mode: tx hash, confirmation result, and execution warnings.
- Execution policy:
  - always run `simulate-transaction` as a hard gate before sign prompt,
  - use `allowance-manager` first for ERC20 allowance planning when needed,
  - fail closed on API/RPC errors, chain mismatch, preflight simulation failure, or policy breaches.
- Safety rule:
  - never execute if action-spec or integration policy disallows selected token pair/route,
  - never accept ad-hoc router addresses outside curated action/integration specs.
- Fallback:
  - if 1inch route/build fails, return no-safe-route and stop automated execution (do not silently fall back to unknown routers).

### allowance-manager
- Priority: P1.
- Status: active in MVP (local planning module).
- Module ID: `allowance-manager`.
- Purpose: check current ERC20 allowance and build deterministic approval/revoke transaction plan.
- Implementation path: `scripts/allowance-manager.js` (IERC20 ABI-based: `allowance`, `approve`, optional `symbol` and `decimals`).
- Required inputs:
  - `RPC_URL` (or `CHAIN_RPC_URL` / `ETH_RPC_URL`) or `--rpc-url`,
  - `CHAIN_ID` or `--chain-id`,
  - `TOKEN_ADDRESS` or `--token-address`,
  - `SPENDER_ADDRESS` or `--spender-address`,
  - owner context via `WALLET_ADDRESS`/`--owner-address` or `PRIVATE_KEY`/`--private-key` (owner can be derived from private key),
  - for exact mode: `DESIRED_AMOUNT_WEI` or `--desired-amount-wei`.
- Supported modes:
  - `exact` (default, safest),
  - `revoke`,
  - `unlimited` (requires explicit `--allow-unlimited`).
- Standard run command:
  - `node scripts/allowance-manager.js --mode exact --token-address <token> --spender-address <spender> --desired-amount-wei <wei> --json`
- Output contract:
  - `policy`, token/owner/spender/chain context,
  - allowance state (`currentWei`, `targetWei`, `deltaWei`, `action`),
  - deterministic approval steps with encoded calldata (`steps[]`),
  - warning set (including unlimited and reset-first cautions).
- Execution policy:
  - exact allowance by default,
  - unlimited allowance requires explicit user opt-in,
  - module is planning only and does not broadcast transactions.
- Safety rule:
  - enforce spender allowlist from `query-action-spec` before execution,
  - reject unknown token/spender addresses (fail closed).
- Fallback:
  - if allowance cannot be queried, return failure and block execution until RPC/token state is healthy.

### position-health-check
- Priority: P1.
- Status: placeholder only.
- Module ID: `position-health-check`.
- Description: PLACEHOLDER - check exposure/LTV/liquidation distance before and after planned actions.
- Inputs: PLACEHOLDER - protocol, position id(s), account, market params, projected action deltas.
- Output contract: PLACEHOLDER - current health metrics, projected post-action metrics, threshold breaches, and warning set.
- Execution policy: PLACEHOLDER - run pre-action and post-action checks as deterministic gates.
- Safety rule: PLACEHOLDER - block when projected liquidation distance or health factor violates policy.
- Fallback: PLACEHOLDER - return safer alternatives (reduce size/deleverage/partial unwind).

### contract-trust-check
- Priority: P1.
- Status: placeholder only.
- Module ID: `contract-trust-check`.
- Description: PLACEHOLDER - combine verification status, allowlist status, and risk snapshot into one trust verdict.
- Inputs: PLACEHOLDER - chain, contract address, protocol context, expected contract role.
- Output contract: PLACEHOLDER - verdict (`allow`/`warn`/`deny`) with evidence fields and timestamps.
- Execution policy: PLACEHOLDER - read-only checks against curated registry and verification sources.
- Safety rule: PLACEHOLDER - deny by default for unknown or unverified contracts unless explicitly overridden by policy.
- Fallback: PLACEHOLDER - return `trust_unknown` and block automated execution.

### trade-perp
- Status: placeholder only.
- Module ID: `trade-perp`.
- Description: PLACEHOLDER - add supported perp venues and position actions.
- Inputs: PLACEHOLDER - define leverage, margin, size, and safety constraints.
- Execution policy: PLACEHOLDER - define simulation, liquidation-buffer checks, and confirmations.
- Unwind/fallback: PLACEHOLDER - define close/reduce-only emergency flow.

### trade-options
- Status: placeholder only.
- Module ID: `trade-options`.
- Description: PLACEHOLDER - add supported options venues and strategy types.
- Inputs: PLACEHOLDER - define strike/expiry/size/risk-limit parameters.
- Execution policy: PLACEHOLDER - define pricing checks, slippage bounds, and confirmations.
- Unwind/fallback: PLACEHOLDER - define close/roll/expiry handling.

### query-protocol
- Priority: P0.
- Status: active in MVP (local bundled module).
- Module ID: `query-protocol`.
- Purpose: query `clawdefi-core` for protocol listing, protocol profile, and action-spec details.
- Implementation path: `scripts/query-protocol.js`.
- API mappings:
  - list mode -> `GET /api/v1/protocols`,
  - profile mode -> `GET /api/v1/protocols/:slug`,
  - action-spec mode -> `GET /api/v1/action-specs/latest`.
- Required inputs:
  - list mode: optional `type`, `chainSlug`, `limit`,
  - profile mode: `slug`,
  - action-spec mode: `protocolSlug`, `chainSlug`, `actionKey`.
- Standard run commands:
  - list:
    - `node scripts/query-protocol.js list --type swap --chain-slug base-mainnet --limit 20 --json`
  - profile:
    - `node scripts/query-protocol.js profile --slug uniswap-v3 --json`
  - action-spec:
    - `node scripts/query-protocol.js action-spec --protocol-slug uniswap-v3 --chain-slug base-mainnet --action-key swap_exact_in --json`
- Output contract:
  - list mode returns protocol catalog and count,
  - profile mode returns protocol overview, supported chains, and latest chain risk snapshots,
  - action-spec mode returns canonical function/endpoint/action policy payload.
- Execution policy:
  - read-only calls only,
  - never invent missing protocol metadata if core returns not found.
- Fallback:
  - return not-found signal and request user clarification on slug/chain/action key.

### query-coingecko
- Priority: P0.
- Status: active in MVP (local bundled module).
- Module ID: `query-coingecko`.
- Purpose: query CoinGecko market data for advisory market context (pricing, movement, liquidity metrics, token discovery).
- Implementation path: `scripts/query-coingecko.js`.
- Supported API modes:
  - `simple-price` -> `/api/v3/simple/price`,
  - `token-price` -> `/api/v3/simple/token_price/{asset_platform_id}`,
  - `coin` -> `/api/v3/coins/{id}`,
  - `search` -> `/api/v3/search`.
- Credential policy:
  - optional API key in local env (`COINGECKO_API_KEY`),
  - `demo` plan uses header `x-cg-demo-api-key`,
  - `pro` plan uses header `x-cg-pro-api-key`,
  - key is local-only and must never be pasted into chat.
- Standard run commands:
  - simple price:
    - `node scripts/query-coingecko.js simple-price --ids ethereum,bitcoin --vs-currencies usd --json`
  - token price:
    - `node scripts/query-coingecko.js token-price --asset-platform base --contract-addresses 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913 --vs-currencies usd --json`
  - coin details:
    - `node scripts/query-coingecko.js coin --coin-id ethereum --json`
  - search:
    - `node scripts/query-coingecko.js search --query usdc --json`
- Output contract:
  - returns request metadata (mode/path/plan) and parsed data payload from CoinGecko response.
- Execution policy:
  - read-only HTTP data retrieval,
  - treat API failures/rate-limit responses as advisory failure, not execution authorization.
- Safety rule:
  - never use CoinGecko as sole execution authority; reconcile all execution-critical fields with `clawdefi-core`.
- Fallback:
  - if unavailable, return explicit error/staleness warning and continue only with core-backed deterministic data.

### query-contract-verification
- Priority: P0.
- Status: active in MVP (local bundled module, Etherscan-first).
- Module ID: `query-contract-verification`.
- Purpose: check whether a contract is source-verified before execution planning.
- Implementation path: `scripts/query-contract-verification.js`.
- Required inputs:
  - `CHAIN_ID` or `--chain-id`,
  - `CONTRACT_ADDRESS` or `--contract-address`,
  - `ETHERSCAN_API_KEY` or `--api-key`.
- Optional inputs:
  - `ETHERSCAN_API_BASE_URL` or `--api-base-url` (default `https://api.etherscan.io/v2/api`),
  - `ETHERSCAN_TIMEOUT_MS` or `--timeout-ms`.
- Standard run command:
  - `node scripts/query-contract-verification.js --chain-id <id> --contract-address <address> --json`
- Output contract:
  - `verification.isVerified`, `verification.status`,
  - contract metadata (`contractName`, `compilerVersion`, `licenseType`, `isProxy`, `implementationAddress`),
  - `explorerCodeUrl`, `provider`, `checkedAt`.
- Credential policy:
  - users provide their own `ETHERSCAN_API_KEY` in local env/secret storage,
  - never ask users to paste API keys into chat,
  - ClawDeFi does not custody explorer API keys.
- Execution policy:
  - read-only lookup via Etherscan V2 endpoint (`module=contract`, `action=getsourcecode`, `chainid=<id>`),
  - perform deterministic address validation before remote call,
  - treat API failure and timeout as verification failure.
- Safety rule:
  - treat `unverified_or_unknown` as a high-caution signal,
  - require explicit user confirmation and ClawDeFi risk-policy checks before fund-impacting actions.
- Fallback:
  - return explicit error/unknown-verification signal and block automated execution by default.

### connect-prediction-market
- Status: placeholder only.
- Module ID: `connect-prediction-market`.
- Description: PLACEHOLDER - connect to supported prediction market venues and fetch market metadata for agent workflows.
- Inputs: PLACEHOLDER - define required params (venue key, chain/network, market id/question id, outcome set, position size limits).
- Output contract: PLACEHOLDER - return market status, outcome tokens/options, pricing/odds snapshot, liquidity depth, settlement rules, and data timestamp.
- Execution policy: PLACEHOLDER - define venue allowlist checks, read-before-write policy, simulation path, and confirmation flow before any order intent.
- Safety rule: PLACEHOLDER - require deterministic ClawDeFi policy checks for market validity, oracle/settlement risk, and user risk-profile fit.
- Unwind/fallback: PLACEHOLDER - define close/hedge/cancel logic, stale-oracle handling, and block execution when settlement conditions are unclear.
