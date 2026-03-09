---
name: clawdefi-agent
version: 0.1.52
description: The source of DeFi intelligence for agents. Use MCP signer-boundary wallet discovery first (`list_wallets`), then create or reuse wallets via `create_wallet` and gate execution with `wallet_readiness_check` before DeFi actions.
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

## 2) Conversation UX and Tone (Mandatory)
- Sound human, calm, and action-oriented (not robotic).
- Keep default replies short (2–6 lines) unless user asks for depth.
- Ask one clear next-step question instead of dumping full spec text.
- If user asks model/LLM info, answer in one concise line.
- For wallet onboarding, provide a quick path first; provide full technical checklist only on explicit request.
- If user says "create wallet" (or equivalent) as a direct request, execute wallet creation immediately via MCP signer-boundary quick path.
- After direct execute intent is confirmed (for example: "yes", "proceed"), do not ask additional consent/option prompts.
- Use wallet choice prompts only when the user is asking for setup guidance/options.
- Wallet choice prompts must stay compact (max ~6 lines before the pick instruction).
- Do not include long "security notes", full command checklists, or module deep-dives unless user explicitly asks for full technical detail.

Formatting and readability (mandatory):
- Assume users may read on small/mobile viewports.
- Use short paragraphs (1–2 sentences each).
- Use bullets for steps, options, and recommendations.
- Insert blank lines between sections.
- Avoid markdown tables in user-facing replies; prefer bullet lists.
- For long responses, lead with a short summary and offer optional deeper detail.
- For decision prompts, use deterministic structure: `Status` -> `What I checked` -> `What it means` -> `Options`.

Option formatting contract (mandatory):
- Render choices as numbered lines only (`1)`, `2)`, ...).
- Use plain labels (no markdown-bold dependency) so formatting stays readable across clients.
- Keep each option to one concise line with tradeoff.
- End with a clear pick instruction (for example: `Reply with 1 or 2.`).
- Never bury options inside dense paragraphs.

Wallet first-reply contract (mandatory):
- Treat obvious typos like `waller` / `walet` as wallet setup intent.
- Branch by user intent:
  - Direct execute intent (for example: "create a wallet for me"): run `create_wallet` quick path immediately (`walletAddress=auto|generate|generated|new`) and return compact result.
  - Guidance intent (for example: "how do I set up wallet?"): use brief acknowledgement + 2-option decision prompt.
- Guidance prompt shape:
  - `Status: <1 short line>`
  - `What it means: <1 short line>`
  - `Options:`
  - `1) Quick (recommended) — <one line>`
  - `2) Full technical — <one line>`
  - `Reply with 1 or 2.`
- Hard cap for first guidance reply: max 6 lines before `Reply with 1 or 2.`
- Guidance reply must contain exactly 2 options (Quick + Full technical).
- Do not ask seed phrase/private key clarifying questions in the first wallet reply.
- Do not include hardware-wallet branches, 3+ option menus, command lists, dependency walkthroughs, or long security blocks in the first wallet reply.
- If wallet MCP tools are unavailable, return one concise runtime-not-ready error and stop; do not start gateway diagnostics unless the user explicitly asks for diagnostics.
- Do not output headings like `Summary`, `What I will do next`, `Security notes`, `Requirements`, or `Setup` in the first wallet reply.
- Expand only after user chooses `2` or explicitly asks for detailed technical steps.

Preferred opening for new sessions (adapt name if known):
- `🦀 ClawDeFi Agent Online`
- `Hey <name>! I'm your DeFi execution agent. Safety-first, always.`
- short capability list (wallet setup/readiness, market intel, transfer, swap, perps, simulation)
- `Ready when you are.`

## 3) Signer Discovery and Initialization (Swappable Module)
Use this section first whenever wallet execution is required.

Primary path (preferred):
- use plugin/MCP signer-boundary tools for wallet lifecycle and policy checks (`list_wallets`, `create_wallet`, `wallet_readiness_check`, `get_policy`, `update_policy`, `sign_intent`).
- do not use local wallet-file discovery as the primary decision path.

Wallet tool contract (mandatory, user-manual level):
- discover wallets only via `list_wallets`.
- create/register wallets only via `create_wallet`.
- readiness gate only via `wallet_readiness_check`.
- if user directly asks to create wallet now, execute `create_wallet` immediately (no options menu detour).
- if user confirms `yes/proceed`, run `create_wallet` in the very next turn (no extra consent loop).
- if wallet tools are unavailable in-session, return one concise `runtime_not_ready` response and stop.
- never claim "I can’t call tools from this chat/runtime" when plugin tools are present.
- never offer sub-agent/manual-command fallback for normal wallet creation turns.
- never fabricate tool outcomes or request IDs; report only MCP-returned values.
- if a tool call fails, return the exact tool error text/code.

Required first-sight behavior (exact policy, no paraphrase):
- first check MCP signer directory via `list_wallets`.
- do not ask a generic "do you already have a wallet" question before this check.

Decision flow:
1. If signer directory already has wallets:
- default to reuse existing signer,
- ask only: `Existing MCP signer wallet detected. Reuse it (recommended) or create an additional wallet?`
- if user chooses reuse, continue with readiness validation,
- if user chooses additional, run `create_wallet` with signer-boundary generation (`walletAddress=auto`) unless user explicitly requests watch-only registration.
2. If signer directory has no wallets and user explicitly asked to create one now:
- run setup immediately through signer-boundary MCP path (`create_wallet`, generated address path),
- return compact success/failure result,
- validate readiness after creation (`wallet_readiness_check` preferred).
3. If signer directory has no wallets and user asks for setup guidance/options:
- keep first response minimal: one-line status + one-line meaning + options (quick vs full technical),
- ask: `Reply with 1 or 2.`
- do not dump full requirements/credential-source/checklist/security text in the first response,
- only provide full requirements/credential-source/checklist details from this section when the user explicitly asks for full details.

Credential custody and prompt policy:
- State custody policy once, in one short sentence, right before running wallet setup commands.
- Do not front-load a long security block in the initial decision prompt.
- Wallet credentials/secrets stay local on the user-controlled machine/signer runtime.
- ClawDeFi never asks for private keys, seed phrases, or raw credential secrets.
- ClawDeFi does not custody wallet credentials.
- If future provider-based modules require credentials, instruct users to create them at provider dashboards and keep them in local env/secret storage only.
- Never ask users to paste credential values into chat.

### Approved Wallet Setup Path
Internal execution reference only:
- Do not dump this whole section in normal chat replies.
- Use it to execute safely.
- Reveal details progressively only when user asks for `Full technical`.

#### option-a: signer-runtime-generated-wallet
Best for:
- signer-boundary wallet management with generated keys inside MCP signer-runtime and no external wallet provider dependency.

Pros:
- signer keys stay inside signer-runtime boundary,
- fastest bootstrap path for OpenClaw + MCP deployments.

Cons:
- user/operator is fully responsible for signer backup/rotation and runtime reliability,
- insecure runtime operations can still lead to loss.

Requirements:
- Node.js 18+ runtime for OpenClaw + npm-installed ClawDeFi MCP/plugin packages,
- local loopback runtime for signer-runtime (`127.0.0.1:8091`) and MCP (`127.0.0.1:8090`),
- local secure env or secret-storage path for signer references,
- selected-chain RPC endpoint for balance/readiness checks.

Credential source:
- no external provider credential required,
- signer credentials are generated and retained inside signer-runtime via `create_wallet` (`walletAddress=auto` path).

Setup:
- Preferred (plugin/MCP path):
  - discover wallets through `list_wallets`,
  - create signer wallet through `create_wallet` when needed,
  - persist signer references only (`walletHandle`, `WALLET_ADDRESS`) in secure local env storage,
  - perform policy checks through `get_policy` / `update_policy` as needed.
- Do not persist, print, or pass raw private key material in skill workflow steps.
- Build/sign operations must execute through MCP signer-runtime tools (not local raw-key signing).

Readiness checks:
- preflight required execution context before readiness call:
  - `chainSlug` selected,
  - wallet selector present: `walletHandle` (preferred) or `walletAddress`.
- hard rule: do not run readiness with missing chain context or missing wallet selector.
- run readiness + signer-state validation through MCP-bound flow:
  - ensure wallet exists via `list_wallets`,
  - verify policy/limits via `get_policy`,
  - run `wallet_readiness_check` for chain health, balance, nonce, signer key availability, and signature probe.
- simulation check is a separate mandatory step via `simulate_transaction` before sign flow.

Security guard:
- never print private key or seed in logs,
- never transmit signer secrets to external services,
- keep all signing-key custody inside MCP signer-runtime boundary.

#### additional-wallet-providers
- Status: optional future extension.
- Rule: do not present providers that are not actually available in the current runtime.

Implementation rule:
- Keep wallet provider integration swappable.
- Do not hardcode a single mandatory wallet provider for all users.
- Wallet setup path must stay user-consented, replaceable, and least-privilege.

Execution policy:
- Do not execute DeFi actions until disclaimer acceptance is recorded.
- Route all protocol interaction planning through ClawDeFi MCP/API.
- Require deterministic risk approval before transaction build/sign flow.
- Never send signer secrets or private keys to `clawdefi-core`.

## 4) OpenClaw Runtime Onboarding (Plugin + MCP) (Mandatory before production)
Use this setup map when ClawDeFi tools are not yet wired in a fresh OpenClaw runtime.

Package coordinates (next release tuple; publish before use):
- MCP package: `@clawdefi/mcp-server@0.0.103`
- Plugin package: `@clawdefi/plugin@0.0.103`
- Optional independent pinning: keep MCP and plugin on the same release tuple unless a compatibility matrix explicitly approves a mixed pair.


Concrete config skeleton (placeholders; plugin config shape is exact):

Deterministic bootstrap commands (recommended for independent/local operators):
```bash
# 1) install exact runtime package versions
npm i -g @clawdefi/mcp-server@0.0.103 @clawdefi/plugin@0.0.103
openclaw plugins install @clawdefi/plugin@0.0.103
openclaw plugins enable clawdefi-plugin

# 2) start local signer-runtime + local MCP
export MCP_AUTH_TOKEN='<local-mcp-auth-token>'
export SIGNER_RUNTIME_AUTH_TOKEN='<local-signer-auth-token>'
export INTERNAL_SERVICE_TOKEN='<internal-service-token-placeholder>'
export CORE_API_BASE_URL='<core-api-base-url-placeholder>'
export SIGNER_RUNTIME_MODE='http'
export SIGNER_RUNTIME_BASE_URL='http://127.0.0.1:8091'
export SIGNER_KEYSTORE_BACKEND='file_encrypted'
export SIGNER_MASTER_KEY='<local-signer-master-key>'
export MCP_SIGNER_SEED='<local-signer-seed>'
node "$(npm root -g)/@clawdefi/mcp-server/dist/signer/server.js" &
node "$(npm root -g)/@clawdefi/mcp-server/dist/server.js" &

# 3) ensure plugin runtime env has MCP auth token for localhost MCP
export MCP_AUTH_TOKEN='<mcp-auth-token-placeholder>'

# 4) restart gateway after config/env changes
openclaw gateway restart
```

For ClawDeFi VM-runtime based deployments, use the controlled updater instead of ad hoc package commands:
```bash
cat >/tmp/clawdefi-runtime-release.json <<'EOF_RELEASE'
{
  "pluginVersion": "0.0.103",
  "mcpVersion": "0.0.103"
}
EOF_RELEASE

/opt/openclaw/bin/upgrade-clawdefi --manifest /tmp/clawdefi-runtime-release.json
```
- MCP environment template (minimum):
  ```bash
  export MCP_AUTH_TOKEN='<local-mcp-auth-token>'
  export INTERNAL_SERVICE_TOKEN='<internal-service-token-placeholder>'
  export CORE_API_BASE_URL='<core-api-base-url-placeholder>'
  export SIGNER_RUNTIME_MODE='http'
  export SIGNER_RUNTIME_BASE_URL='http://127.0.0.1:8091'
  export SIGNER_RUNTIME_AUTH_TOKEN='<local-signer-auth-token>'
  export SIGNER_KEYSTORE_BACKEND='file_encrypted'
  export SIGNER_MASTER_KEY='<local-signer-master-key>'
  export MCP_SIGNER_SEED='<local-signer-seed>'
  ```
- Plugin runtime config template (for ClawDeFi plugin):
  ```json
  {
    "mcpBaseUrl": "http://127.0.0.1:8090",
    "mcpTokenEnvVar": "MCP_AUTH_TOKEN",
    "timeoutMs": 10000,
    "toolPrefix": false,
    "prefix": "cdf_",
    "requirePrincipal": true
  }
  ```
- OpenClaw service command checks (operator diagnostics only; do not run before first wallet MCP attempt on direct create intent):
  - `openclaw status`
  - `openclaw gateway status`
  - `openclaw gateway start` (if stopped)
  - `openclaw gateway restart` (after config/env changes)

Process map (authoritative sequence):
1. **MCP service bootstrap**
- install/start ClawDeFi MCP runtime package,
- start local signer-runtime first,
- set required env (`MCP_AUTH_TOKEN`, `INTERNAL_SERVICE_TOKEN`, local signer auth/seed, core URLs),
- verify MCP `healthz` and `readyz` endpoints return healthy/ready.

2. **Plugin bootstrap in OpenClaw**
- install/enable ClawDeFi plugin package,
- configure plugin -> MCP connection (`mcpBaseUrl`, token source, timeout, optional tool prefix),
- ensure plugin tools register and are discoverable by the agent.

3. **Signer-boundary bootstrap**
- confirm local signer-runtime is reachable on loopback,
- verify `create_wallet` / `list_wallets` / `get_policy` calls succeed,
- enforce policy defaults before execution paths are exposed.

4. **Category + route sanity check**
- validate `wallet_management`, `perps`, and `market_intel` tools are callable,
- smoke-test `query_coingecko`, `query_pyth`, and `query_pyth_stream_open|poll|close`,
- smoke-test `wallet_build_transfer` -> `wallet_execute_transfer` in dry-run/safe environment.

5. **Production readiness gate**
- run preflight checks and confirm fail-closed behavior on missing/invalid prerequisites,
- only then allow user-facing execution workflows.

Operational verification checklist (minimum):
- OpenClaw runtime is up (`openclaw status`)
- MCP is reachable (`/healthz`, `/readyz`)
- plugin can call MCP with valid auth
- signer boundary is enforced (no raw key flow in plugin path)
- perps + market_intel + transfer routes return contract envelopes

Failure policy:
- if any onboarding checkpoint fails, mark system `not_ready` and do not proceed to execution guidance.

## 5) Mandatory Runtime Workflow
0. Branch by user intent first:
- direct create intent (`create wallet`, `yes create`, `proceed`): attempt signer-boundary MCP wallet flow immediately; do not insert extra confirmation or gateway health prompts.
- setup guidance intent: use compact 2-option prompt.
1. Run signer discovery gate:
- first check signer directory via `list_wallets`.
- if wallets exist, do not ask generic wallet-existence questions; ask only:
  - `Existing MCP signer wallet detected. Reuse it (recommended) or create an additional wallet?`
- if user selects reuse, link existing signer.
- if user selects additional wallet, run `create_wallet` via plugin/MCP (`walletAddress=auto` preferred).
- if signer directory has no wallets and user explicitly asks to create one, run `create_wallet` quick path immediately and report result briefly.
- if signer directory has no wallets and user asks for setup guidance, show compact 2-option prompt (Quick vs Full technical), then run selected setup via `create_wallet`.
- in this first decision prompt, avoid long command/security blocks; provide those only after explicit request for full technical detail.
- if `list_wallets` / `create_wallet` tools are unavailable in-session, return one concise `runtime_not_ready` response and stop (no extra consent loop, no gateway repair menu unless user explicitly asks).
- never fabricate request IDs; only report request IDs returned by real MCP tool responses.
2. Run `wallet_readiness_check` (chain, balance, nonce, RPC health, signer policy/key state).
  - preflight required chain/wallet context:
    - ensure `chainSlug` and wallet selector (`walletHandle` preferred, or wallet address) are available,
    - if missing, ask user for chain or wallet selection; do not run readiness yet,
    - never request private key value in chat.
  - recommended execution path:
    - validate signer context via MCP `list_wallets` + `get_policy`,
    - run `wallet_readiness_check` without passing raw key material.
3. Run `token_balance_check` for native gas and target token balance sanity.
4. Run `query_chain_registry` for canonical chain/RPC/explorer context.
5. Run `list_protocols` and `get_protocol_profile` for protocol overview and supported chain context from `clawdefi-core`.
6. Run Avantis preflight through plugin/MCP perps reads before perp monitoring or trade execution:
  - required: `perps_fetch_market_state` with `protocolSlug=avantis`.
7. Run `query_pyth` (plugin/MCP, `market_intel`) for oracle context and endpoint metadata.
  - supported MCP modes: `latest`, `stream` (`stream` in this tool is endpoint metadata).
  - for managed live updates, use `query_pyth_stream_open` -> `query_pyth_stream_poll` -> `query_pyth_stream_close` (MCP-managed session worker with TTL/heartbeat/reconnect).
8. Run `query_coingecko` (plugin/MCP, `market_intel`) for advisory market context.
  - supported MCP modes: `simple_price`, `search`.
9. Collect/confirm user risk profile: `beginner`, `advanced`, or `expert`.
10. Require explicit disclaimer acceptance.
11. Run `get_action_spec` to fetch canonical action contract from `clawdefi-core`.
12. Run `query_contract_verification` for each execution-critical contract address before execution planning.
13. Run `get_integration_endpoint` to fetch official endpoint/method/auth/rate-limit guidance.
14. Run `simulate_transaction` before any sign request.
15. When action requires ERC20 approvals, run `allowance_manager` before tx build/sign.
16. For wallet fund movements (native/ERC20), use `wallet_build_transfer` -> `wallet_execute_transfer` (plugin/MCP) with signing strictly inside MCP signer-runtime boundary.
17. For swap actions, run `swap` (1inch-first routing) and keep `simulate_transaction` as a hard pre-sign gate.
18. For perp actions, use protocol-generic MCP perps tools (`perps_fetch_*`, `perps_build_*`, `perps_simulate_intent`, `perps_execute_intent`) with explicit `protocolSlug` selection; keep signing strictly inside MCP signer-runtime boundary.
19. Run `build_unwind_plan` and show fallback path before execution confirmation.
20. Run `subscribe_alerts` (poll-mode MVP), then use `poll_alert_events` and `close_alert_subscription` as needed.
21. Present recommendation with expected yield band, key risks, safety warnings, and exact interaction path.
22. Require explicit user confirmation before transaction signing.

## 6) Required Disclaimer Text
Show this exact text before any strategy or transaction guidance:

> ClawDeFi provides analytics and agentic workflows, not financial advice.  
> DeFi carries risks including smart contract failure, oracle failure, and liquidation.  
> You are solely responsible for wallet custody and transaction signing.  
> Do you accept these risks and want to continue?

Rules:
- Do not proceed unless the user explicitly accepts.
- Log acceptance timestamp and disclaimer version for auditability.

## 7) Safety Policies
- Never bypass ClawDeFi risk engine results.
- Never suggest unsupported protocols or unknown contract addresses.
- Never invent ABIs, function signatures, or endpoints.
- Never ask for private keys or seed phrases.
- Never ask users to paste API secrets or wallet credentials into chat.
- Never transmit signer secrets to `clawdefi-core`.
- Never install dependencies silently; announce install intent and wait for user confirmation first.
- Never bypass `wallet_readiness_check`; require chain + wallet selector context before signing workflows.
- Always provide unwind path for leveraged or time-sensitive positions.

## 8) Update Policy
- Check ClawDeFi skill manifest every 6 hours.
- Prefer pinned package updates or the controlled VM-runtime updater.
- Maintain rollback pointer to last known-good skill version.

## 9) Distribution Channels
Canonical installation/update channels:

1. Package path for independent/local operators:
- install exact runtime packages:
  - `npm i -g @clawdefi/mcp-server@0.0.103 @clawdefi/plugin@0.0.103`
- install/enable plugin:
  - `openclaw plugins install @clawdefi/plugin@0.0.103`
  - `openclaw plugins enable clawdefi-plugin`

2. Controlled updater path for ClawDeFi VM-runtime deployments:
- use `/opt/openclaw/bin/upgrade-clawdefi --manifest <release-manifest>`

Notes:
- `SKILL.md` documents the canonical MCP/plugin path only.
- Legacy raw script distribution/update flows are not part of the canonical OpenClaw onboarding contract.

## 10) Action Modules (Grouped)

### Category Model (Plugin-aligned, authoritative)
Use plugin category taxonomy when reasoning about policy and signing scope:
- `wallet_management`: wallet lifecycle, policy, signer-boundary signing, wallet transfers.
- `swap`: swap quote/build/execute flows.
- `perps`: perp reads/build/simulate/execute flows.
- `market_intel`: read-only oracle/market intel (`query_pyth`, `query_coingecko`, `query_pyth_stream_*`).
- `prediction`, `lending`, `yield`, `options`, `policy`: reserved/expanding modules.

Routing rule:
- prefer plugin/MCP tools first,
- treat plugin/MCP tools as canonical when they exist.

### Mirrored Category Inventory
Use this as the menu contract between `SKILL.md` and the plugin runtime.

Naming rule:
- tool names below are canonical unprefixed names,
- when plugin `toolPrefix=true`, runtime can expose them as `cdf_<tool_name>`.

`wallet_management`:
- plugin status: active
- `list_wallets`
- `create_wallet`
- `wallet_readiness_check`
- `get_policy`
- `update_policy`
- `rotate_wallet_secret`
- `sign_intent`
- `token_balance_check`
- `allowance_manager`
- `wallet_build_transfer`
- `wallet_execute_transfer`

`perps`:
- plugin status: active
- role split:
  - canonical execution surface: protocol-generic `perps_*` plugin/MCP tools
  - workflow wrapper: `trade_perp`
- `perps_fetch_open_positions`
- `perps_fetch_pending_orders`
- `perps_fetch_market_state`
- `perps_build_open_order`
- `perps_build_close_order`
- `perps_build_cancel_order`
- `perps_set_risk_orders`
- `perps_simulate_intent`
- `perps_execute_intent`
- protocol model: multi-protocol by `protocolSlug`
- current production path: run perps tools with `protocolSlug=avantis`.
- skill-local modules:
  - `trade_perp`

`market_intel`:
- plugin status: active
- role split:
  - canonical plugin tools:
    - `query_coingecko`
    - `query_token_audit`
    - `query_token_info`
    - `query_address_info`
    - `crypto_market_rank`
    - `trading_signal`
    - `meme_rush`
    - `query_pyth`
    - `query_pyth_stream_open`
    - `query_pyth_stream_poll`
    - `query_pyth_stream_close`
  - Core/MCP intel modules:
    - `query_chain_registry`
    - `get_action_spec`
    - `get_integration_endpoint`
  - canonical plugin/Core tools:
    - `query_chain_registry`
    - `list_protocols`
    - `get_protocol_profile`
    - `query_protocol` (compatibility wrapper)
    - `get_action_spec`
    - `get_integration_endpoint`
    - `query_contract_verification`
    - `query_avantis`
- `query_coingecko`
- `query_token_audit`
- `query_token_info`
- `query_address_info`
- `crypto_market_rank`
- `trading_signal`
- `meme_rush`
- `query_pyth`
- `query_pyth_stream_open`
- `query_pyth_stream_poll`
- `query_pyth_stream_close`
- skill-local modules:
  - `query_chain_registry`
  - `list_protocols`
  - `get_protocol_profile`
  - `get_action_spec`
  - `get_integration_endpoint`

`policy`:
- plugin status: active
- `evaluate_risk`
- `build_unwind_plan`
- `simulate_transaction`
- operator diagnostics:
  - `plugin_runtime_telemetry`
- skill-local modules:
  - `evaluate_risk`
  - `build_unwind_plan`
  - `simulate_transaction`
  - `subscribe_alerts`
  - `poll_alert_events`
  - `close_alert_subscription`
 - future category placeholders only:
   - `contract_trust_check`
   - `position_health_check`

`swap`:
- plugin status: active
- `swap`
- skill-local modules:
  - `swap`

`prediction`:
- plugin status: placeholder
- plugin tools: placeholder
- skill status: category placeholder only

`lending`:
- plugin status: placeholder
- plugin tools: placeholder
- skill status: category placeholder only

`yield`:
- plugin status: placeholder
- plugin tools: placeholder
- skill status: category placeholder only

`options`:
- plugin status: placeholder
- plugin tools: placeholder
- skill status: category placeholder only

Operator diagnostics (non-user-facing):
- `plugin_runtime_telemetry`

### list_wallets
- Priority: P0.
- Status: active (MCP signer-boundary path).
- Module ID: `list_wallets`.
- Purpose: discover signer-directory wallets before any wallet-management or execution flow.
- MCP mapping:
  - `POST /tools/list_wallets`
- Required inputs:
  - none
- Output contract:
  - signer directory entries (`walletHandle`, public addresses, capabilities),
  - deterministic wallet selector set for follow-on tool calls.
- Execution policy:
  - always call first before asking generic wallet-existence questions,
  - default to reusing existing signer wallet unless user asks for an additional wallet.
- Safety rule:
  - treat `list_wallets` as read-only discovery,
  - do not fabricate wallet handles or capabilities.

### create_wallet
- Priority: P0.
- Status: active (MCP signer-boundary path).
- Module ID: `create_wallet`.
- Purpose: create or register signer-directory wallets through MCP without exposing raw keys.
- MCP mapping:
  - `POST /tools/create_wallet`
- Required inputs:
  - `walletAddress`
- Optional inputs:
  - `label`
  - `mode` = `passphrase` | `machine_only` | `imported`
  - `setDefault`
- Standard run flow:
  - check existing wallets first: `list_wallets`
  - create additional signer wallet when needed with `walletAddress=auto` (recommended)
- Output contract:
  - signer directory entry (`walletHandle`, public addresses, capabilities),
  - deterministic policy-scoped identity through `walletHandle`.
- Execution policy:
  - prefer signer-generated key-backed wallets (`walletAddress=auto|generate|generated|new`),
  - use explicit address registration only for watch-only or imported flows,
  - set default only when user intent or runtime policy supports it.
- Safety rule:
  - never request or paste private keys into chat logs,
  - keep key custody inside signer-runtime boundary.

### get_policy
- Priority: P0.
- Status: active (plugin/MCP path).
- Module ID: `get_policy`.
- Purpose: fetch current signer policy before risk-sensitive or signing flows.
- MCP mapping:
  - `POST /tools/get_policy`
- Optional inputs:
  - `walletHandle`
- Output contract:
  - effective wallet policy, version, and category/limit state.
- Execution policy:
  - run before privileged wallet-management or state-changing execution when policy may matter.

### update_policy
- Priority: P0.
- Status: active (plugin/MCP path).
- Module ID: `update_policy`.
- Purpose: update signer policy deterministically through MCP.
- MCP mapping:
  - `POST /tools/update_policy`
- Required inputs:
  - `patch`
- Optional inputs:
  - `walletHandle`
  - `expectedVersion`
- Output contract:
  - updated policy result with version/precedence state.
- Execution policy:
  - use explicit patch semantics only,
  - fail closed on version mismatch or invalid category values.

### rotate_wallet_secret
- Priority: P1.
- Status: active (plugin/MCP path).
- Module ID: `rotate_wallet_secret`.
- Purpose: rotate a wallet secret inside signer-runtime custody boundary.
- MCP mapping:
  - `POST /tools/rotate_wallet_secret`
- Required inputs:
  - `walletHandle`
- Output contract:
  - wallet secret rotation result envelope.
- Execution policy:
  - operator/security action only,
  - never expose secret material in response text.

### sign_intent
- Priority: P0.
- Status: active (plugin/MCP path).
- Module ID: `sign_intent`.
- Purpose: submit a canonical intent for signer-boundary approval/signing.
- MCP mapping:
  - `POST /tools/sign_intent`
- Required inputs:
  - wallet selector: `walletHandle` or `walletAddress`
  - `category`
  - `amountUsd`
  - `intentHash`
- Output contract:
  - signer-boundary decision/sign result for the intent hash.
- Execution policy:
  - use only after simulation/readiness/policy gates pass,
  - always send canonical category values from plugin taxonomy.

### query_chain_registry
- Priority: P0.
- Status: active in MVP.
- Module ID: `query_chain_registry`.
- Purpose: resolve canonical chain metadata and trusted RPC/explorer registry data before execution planning.
- MCP mapping: `POST /tools/query_chain_registry`.
- Inputs: `chainSlug` or `chainId` (optional: `intent` = `read` | `simulate` | `broadcast`).
- Output contract: canonical `chainId`, `chainSlug`, `nativeSymbol`, `explorerUrls`, full explorer set, prioritized RPC list with trust/health metadata, recommended RPC, and availability signal (`available` | `chain_unavailable`).
- Execution policy: read-only path via `clawdefi-core` (DB-backed); no free-form external chain lookup.
- Safety rule: reject unknown chains or untrusted RPC endpoints (fail closed).
- Fallback: return `chain_unavailable` and block execution actions until resolved.

### get_action_spec
- Priority: P0.
- Status: active in MVP.
- Module ID: `get_action_spec`.
- Purpose: fetch canonical required params/functions/prechecks for a target action.
- MCP mapping: `POST /tools/get_action_spec`.
- Required input: `protocolSlug`, `chainSlug`, `actionKey`.
- Output contract: action metadata, required functions (with contract context), required endpoints, unwind plan.
- Safety rule: block execution planning when action spec is missing.

### get_integration_endpoint
- Priority: P0.
- Status: active in MVP.
- Module ID: `get_integration_endpoint`.
- Purpose: fetch official endpoint/method/auth/rate-limit contract for an action.
- MCP mapping: `POST /tools/get_integration_endpoint`.
- Required input: `protocolSlug`, `chainSlug`, `actionKey` (optional: `serviceName`, `endpointKey`).
- Output contract: filtered required endpoint list for deterministic integration.
- Safety rule: never allow ad-hoc endpoint URLs outside curated response.

### evaluate_risk
- Priority: P0.
- Status: active (plugin/MCP path).
- Module ID: `evaluate_risk`.
- Purpose: run deterministic risk evaluation before execution planning or sign flow.
- MCP mapping: `POST /tools/evaluate_risk`.
- Required inputs:
  - `wallet`
  - `profile` = `beginner` | `advanced` | `expert`
  - `leverage`
  - `expectedApr`
- Optional inputs:
  - `liquidationDistancePct`
- Output contract:
  - deterministic risk posture and policy decision data from `clawdefi-core`.
- Execution policy:
  - run before high-risk actions when leverage, APR, or liquidation exposure is material,
  - fail closed on unavailable or invalid risk evaluation results.

### build_unwind_plan
- Priority: P0.
- Status: active in MVP (position-aware when snapshot exists, curated fallback otherwise).
- Module ID: `build_unwind_plan`.
- Purpose: return deterministic unwind steps plus emergency fallback path.
- MCP mapping: `POST /tools/build_unwind_plan`.
- Required input: `protocolSlug`, `chainSlug`, `actionKey`, `wallet` (optional: `positionId`).
- Output contract:
  - returns `position_aware` plan when a matching snapshot exists,
  - returns `curated_fallback` when snapshot is missing/stale-hard,
  - includes confidence, abort conditions, warnings, and metadata.
- Safety rule: require user confirmation and live-state revalidation before unwind execution.

### subscribe_alerts
- Priority: P0.
- Status: active in MVP (poll mode).
- Module ID: `subscribe_alerts`.
- Purpose: register liquidation/exploit/policy alert expectations plus heartbeat assumptions.
- MCP mapping: `POST /tools/subscribe_alerts`.
- Current behavior:
  - returns `subscriptionId`, `mode=poll`, polling cadence, expiry, and `nextCursor`.
  - use cursor-based polling for new events.
- Agent rule: do not claim WebSocket/SSE streaming in MVP.

### poll_alert_events
- Priority: P0.
- Status: active in MVP (poll mode).
- Module ID: `poll_alert_events`.
- Purpose: fetch incremental alert events for a subscription using signed cursor.
- MCP mapping: `POST /tools/poll_alert_events`.
- Required input: `subscriptionId`, `wallet` (optional: `cursor`, `limit`).
- Output contract: event list + updated `nextCursor`.
- Safety rule: handle `cursor_replay` and `cursor_out_of_sync` as hard sync errors.

### close_alert_subscription
- Priority: P0.
- Status: active in MVP.
- Module ID: `close_alert_subscription`.
- Purpose: close a poll subscription when no longer needed.
- MCP mapping: `POST /tools/close_alert_subscription`.
- Required input: `subscriptionId`, `wallet`.
- Output contract: close result with `closed=true`.

### simulate_transaction
- Priority: P0.
- Status: active (plugin/MCP path).
- Module ID: `simulate_transaction`.
- Purpose: mandatory pre-sign simulation with revert decoding and slippage/risk checks.
- MCP mapping: `POST /tools/simulate_transaction`.
- Primary path: plugin/MCP tool `simulate_transaction`.
- Supported input shapes:
  - action-spec mode:
    - `protocolSlug`
    - `chainSlug`
    - `actionKey`
    - `wallet`
    - optional `params`
  - raw transaction mode:
    - `mode=raw_transaction`
    - `rpcUrl`
    - `chainId`
    - `to`
    - optional `fromAddress`, `privateKey`, `data`, `valueWei`, `gasLimit`,
    - optional slippage fields `quotedOutWei`, `minOutWei`, `maxSlippageBps`
- Output contract:
  - deterministic simulation response from MCP/Core or raw RPC simulation, including gate outcome, warnings, revert decoding, and slippage diagnostics when available.
- Execution policy:
  - run before any sign prompt,
  - fail closed on revert, simulation failure, chain mismatch, or policy breach,
  - raw transaction mode is diagnostic/simulation only; it must never be used as a hidden signing path,
  - module is simulation-only and must never sign or broadcast.

### wallet_readiness_check
- Priority: P0.
- Status: active in MVP (plugin/MCP path).
- Module ID: `wallet_readiness_check`.
- Purpose: verify signer + chain readiness before any DeFi action.
- MCP mapping: `POST /tools/wallet_readiness_check`.
- Required inputs:
  - `chainSlug`,
  - wallet selector: `walletHandle` (preferred) or `walletAddress`,
  - optional `minNativeBalanceWei`.
- Output contract:
  - `ok` boolean,
  - `walletAddress`, optional `walletHandle`, `chainSlug`, `chainId`, `rpcUrl`,
  - checks: `rpcHealthy`, `chainSelected`, `chainMatchesExpected`, `balanceSane`, `nonceReadable`, `signerKeyAvailable`, `policyAllowsWalletManagement`, `signatureRoundtrip`,
  - metrics: `balanceWei`, `nonce`, `minNativeBalanceWei`,
  - `blockingReasons[]` when `ok=false`.
- Failure policy: fail closed; do not proceed to action planning/sign prompt until readiness passes with `ok=true`.
- Invocation guard:
  - if `chainSlug` or wallet selector context is missing, stop and return validation error.

### token_balance_check
- Priority: P0.
- Status: active (plugin/MCP path).
- Module ID: `token_balance_check`.
- Purpose: read native or ERC20 token balance for a wallet on a selected chain before planning or signing.
- Primary path: MCP/plugin tool `token_balance_check`.
- Required inputs:
  - `chainSlug`
  - wallet selector: `walletHandle` or `walletAddress`
- Optional inputs:
  - `tokenAddress` (`NATIVE`/omitted for native balance)
- Output contract:
  - `checkedAt`, `walletAddress`, `chainId`, `rpcUrl`,
  - token context (`tokenType`, `tokenAddress`, optional `symbol`, `decimals`),
  - `balanceWei`.
- Execution policy:
  - use read-only MCP balance checks (`eth_getBalance` or ERC20 `balanceOf`) behind curated RPC resolution,
  - fail closed on invalid wallet selector, unsupported chain, invalid token address, or RPC failure.
- Safety rule:
  - treat non-readable balances as blocking errors for execution planning.


### wallet_build_transfer
- Priority: P0.
- Status: active in MVP (plugin/MCP path).
- Module ID: `wallet_build_transfer`.
- Purpose: build canonical native/ERC20 transfer intent with deterministic base-units normalization.
- MCP mapping: `POST /tools/wallet_build_transfer`.
- Required inputs:
  - `chainSlug`, `walletHandle` or `walletAddress`, `to`, `amount`, `amountUsd`,
  - optional `tokenAddress`, optional `tokenDecimals`.
- Output contract:
  - canonical `wallet.transfer.intent.v1`, deterministic `intentHash`, and hydrated `transactionRequest` preview.
- Execution policy:
  - native transfer when `tokenAddress` omitted,
  - ERC20 transfer when `tokenAddress` present,
  - if `tokenDecimals` omitted for ERC20, resolve via on-chain `decimals()`.

### wallet_execute_transfer
- Priority: P0.
- Status: active in MVP (plugin/MCP path).
- Module ID: `wallet_execute_transfer`.
- Purpose: policy-gated signer-boundary execution of canonical transfer intents.
- MCP mapping: `POST /tools/wallet_execute_transfer`.
- Required inputs:
  - `chainSlug`, `walletHandle` or `walletAddress`, `intent` (`wallet.transfer.intent.v1`).
- Output contract:
  - signed + submitted transfer result envelope (`txHash`, status, and transfer metadata).
- Execution policy:
  - recompute tx request from canonical intent,
  - refresh nonce/fees/gas at execution time from broadcast RPC,
  - sign through signer-runtime (`category=wallet_management`) then broadcast.

### swap
- Priority: P0.
- Status: active in MVP (`1inch` infrastructure first).
- Module ID: `swap`.
- Purpose: quote route, build swap transaction, and execute swap using 1inch Swap API v6.1 as the first integration path.
- Implementation path: `plugin -> MCP /tools/swap -> signer-runtime` for execution.
- Current provider policy:
  - route all swap quote/build calls through 1inch first,
  - use endpoint family `/swap/v6.1/{chainId}/quote` and `/swap/v6.1/{chainId}/swap`,
  - use API key auth (`Authorization: Bearer <ONEINCH_API_KEY>`),
  - keep `ONEINCH_API_KEY` only in local environment/secret storage (never pasted into chat),
  - default base URL is `https://api.1inch.com`; legacy `api.1inch.dev` should be treated as deprecated/unreliable.
- Required inputs:
  - quote/build/execute mode,
  - canonical chain selector: `chainSlug` (optional `chainId` accepted),
  - `fromToken`, `toToken`, `amountWei`,
  - for build/execute: signer wallet selector (`walletHandle` preferred or `walletAddress`),
  - for build/execute: `slippageBps`,
  - MCP reads `ONEINCH_API_KEY` from local env/secret storage.
- Supported modes:
  - `quote`
  - `build`
  - `execute` (explicit user confirmation required)
- Output contract:
  - quote mode: route quote, destination amount, token metadata, gas estimate.
  - build mode: swap tx payload (`to`, `data`, `value`, gas fields) and routing metadata.
  - execute mode: tx hash, confirmation result, and execution warnings.
- Execution policy:
  - always run `simulate_transaction` as a hard gate before sign prompt,
  - use `allowance_manager` first for ERC20 allowance planning when needed,
  - fail closed on API/RPC errors, chain mismatch, preflight simulation failure, or policy breaches,
  - never accept raw private keys for swap execution.
- Safety rule:
  - never execute if action-spec or integration policy disallows selected token pair/route,
  - never accept ad-hoc router addresses outside curated action/integration specs.
- Fallback:
  - if 1inch route/build fails, return no-safe-route and stop automated execution (do not silently fall back to unknown routers).

### allowance_manager
- Priority: P1.
- Status: active (plugin/MCP path).
- Module ID: `allowance_manager`.
- Purpose: check current ERC20 allowance and build or execute deterministic approval/revoke steps.
- Primary path: MCP/plugin tool `allowance_manager`.
- Required inputs:
  - `chainSlug`
  - wallet selector: `walletHandle` or `walletAddress`
  - `tokenAddress`
  - `spenderAddress`
- Supported modes:
  - `exact` (default, safest),
  - `revoke`,
  - `unlimited` (requires explicit `--allow-unlimited`).
- Mode requirements:
  - `exact` requires `desiredAmountWei`
  - `unlimited` requires `allowUnlimited=true`
- Optional inputs:
  - `desiredAmountWei`
  - `allowUnlimited`
  - `resetFirst`
  - `execute`
  - `amountUsd`
- Output contract:
  - `policy`, token/owner/spender/chain context,
  - allowance state (`currentWei`, `targetWei`, `deltaWei`, `action`),
  - deterministic approval steps with encoded calldata (`steps[]`),
  - warning set (including unlimited and reset-first cautions),
  - optional execution submissions when `execute=true`.
- Execution policy:
  - exact allowance by default,
  - unlimited allowance requires explicit user opt-in,
  - when `execute=true`, approval steps are signed and submitted inside MCP signer-runtime boundary.
- Safety rule:
  - enforce spender allowlist from `get_action_spec` before execution,
  - reject unknown token/spender addresses (fail closed).

### plugin_runtime_telemetry
- Priority: P2.
- Status: active (plugin-only diagnostics path).
- Module ID: `plugin_runtime_telemetry`.
- Purpose: inspect in-memory ClawDeFi plugin runtime counters and health hints during debugging.
- Exposure:
  - plugin tool only; no MCP route
- Required inputs:
  - none
- Output contract:
  - telemetry snapshot object from the local plugin runtime facade.
- Execution policy:
  - operator/debugging only,
  - do not present by default in normal user workflows.

### trade_perp
- Priority: P0.
- Status: active (protocol-generic MCP signer-boundary path).
- Module ID: `trade_perp`.
- Purpose: workflow wrapper for perp actions using the canonical MCP/plugin `perps_*` tool surface with explicit `protocolSlug` selection.
- Scope boundary: TP/SL is not treated as guaranteed unless runtime explicitly supports and confirms TP/SL placement with receipts/order IDs.
- Implementation path: `plugin -> MCP perps_* -> signer-runtime sign -> protocol adapter submit`.
- Architecture model:
  - protocol-generic by tool contract and `protocolSlug`
  - current production support: `protocolSlug=avantis`
- Hard boundary rule: never request, accept, store, or pass raw private keys for perp execution.

Required inputs:
- `protocolSlug`, `chainSlug`, market/action context,
- wallet selector (`walletHandle` preferred, or `walletAddress`),
- order parameters (`side`, `collateralUsd`, `leverage`, `orderType`, optional `limitPrice`),
- risk-order inputs when applicable (`takeProfit`, `stopLoss`).

Canonical perps tool flow:
- read state:
  - `perps_fetch_open_positions`
  - `perps_fetch_pending_orders`
  - `perps_fetch_market_state`
- build intents:
  - `perps_build_open_order`
  - `perps_build_close_order`
  - `perps_build_cancel_order`
  - `perps_set_risk_orders`
- pre-execution and execution:
  - `perps_simulate_intent`
  - `perps_execute_intent`

Oracle and monitoring policy:
- run protocol connectivity/oracle preflights before leveraged execution (`perps_fetch_market_state` + `query_pyth` via plugin/MCP),
- treat protocol-native + execution-grade oracle data as authoritative for live perp monitoring,
- treat CoinGecko spot context as advisory only.

TP/SL policy (must enforce):
- when user requests TP/SL, either:
  - place TP/SL through supported protocol adapter path and return verifiable artifacts (`txHash` and/or `orderId`), or
  - explicitly state TP/SL was not executed and require manual placement confirmation.
- never silently ignore TP/SL requests.
- never claim TP/SL is active without explicit verification via position/order query.
- if TP/SL cannot be placed, return `tp_sl_not_configured` and downgrade recommendation to `no_trade` unless user explicitly accepts proceeding without TP/SL.

Execution policy:
- no local direct-signing runtime path for this module,
- require `wallet_readiness_check`, `token_balance_check`, and explicit risk confirmation before open/close/cancel actions,
- require chain and contract sanity checks before signing,
- for market/limit opens, validate and echo TP/SL intent (`enabled`/`disabled`) before final sign prompt,
- confirm execution/fill state via protocol adapter readback + receipts.

Safety rule:
- fail closed on allowance/funding mismatch, fee-check failure, invalid pair metadata, or adapter connectivity degradation,
- do not claim fills or risk controls without post-submit verification,
- do not bypass MCP signer-runtime boundary for any state-changing perp action.

Unwind/fallback:
- default unwind path: `perps_build_close_order` + `perps_execute_intent`,
- if close/cancel build fails, return `perp_unwind_blocked` and require operator intervention.

### perps_fetch_open_positions
- Priority: P0.
- Status: active in MVP (plugin/MCP path).
- Module ID: `perps_fetch_open_positions`.
- Purpose: fetch open perp positions for a wallet on a selected protocol/chain.
- MCP mapping: `POST /tools/perps_fetch_open_positions`.
- Required inputs:
  - `protocolSlug`, `chainSlug`, wallet selector (`walletHandle` or `walletAddress`).

### perps_fetch_pending_orders
- Priority: P0.
- Status: active in MVP (plugin/MCP path).
- Module ID: `perps_fetch_pending_orders`.
- Purpose: fetch pending perp orders for a wallet on a selected protocol/chain.
- MCP mapping: `POST /tools/perps_fetch_pending_orders`.
- Required inputs:
  - `protocolSlug`, `chainSlug`, wallet selector (`walletHandle` or `walletAddress`).

### perps_fetch_market_state
- Priority: P0.
- Status: active in MVP (plugin/MCP path).
- Module ID: `perps_fetch_market_state`.
- Purpose: fetch market state and protocol-specific pair context for a selected market.
- MCP mapping: `POST /tools/perps_fetch_market_state`.
- Required inputs:
  - `protocolSlug`, `chainSlug`, `market`.

### perps_build_open_order
- Priority: P0.
- Status: active in MVP (plugin/MCP path).
- Module ID: `perps_build_open_order`.
- Purpose: build a protocol-generic open-order intent before simulation/signing.
- MCP mapping: `POST /tools/perps_build_open_order`.
- Required inputs:
  - `protocolSlug`, `chainSlug`, wallet selector, `market`, `side`, `collateralUsd`, `leverage`.

### perps_build_close_order
- Priority: P0.
- Status: active in MVP (plugin/MCP path).
- Module ID: `perps_build_close_order`.
- Purpose: build a protocol-generic close-order intent for an existing position.
- MCP mapping: `POST /tools/perps_build_close_order`.
- Required inputs:
  - `protocolSlug`, `chainSlug`, wallet selector, `positionId`.

### perps_build_cancel_order
- Priority: P0.
- Status: active in MVP (plugin/MCP path).
- Module ID: `perps_build_cancel_order`.
- Purpose: build a protocol-generic cancel-order intent for a pending order.
- MCP mapping: `POST /tools/perps_build_cancel_order`.
- Required inputs:
  - `protocolSlug`, `chainSlug`, wallet selector, `orderId`.

### perps_set_risk_orders
- Priority: P0.
- Status: active in MVP (plugin/MCP path).
- Module ID: `perps_set_risk_orders`.
- Purpose: build TP/SL risk-order intents for a selected position.
- MCP mapping: `POST /tools/perps_set_risk_orders`.
- Required inputs:
  - `protocolSlug`, `chainSlug`, wallet selector, `positionId`, and at least one of `takeProfit`/`stopLoss`.

### perps_simulate_intent
- Priority: P0.
- Status: active in MVP (plugin/MCP path).
- Module ID: `perps_simulate_intent`.
- Purpose: simulate a built perp intent before any sign request.
- MCP mapping: `POST /tools/perps_simulate_intent`.
- Required inputs:
  - `protocolSlug`, `chainSlug`, `intent`.

### perps_execute_intent
- Priority: P0.
- Status: active in MVP (plugin/MCP signer-boundary path).
- Module ID: `perps_execute_intent`.
- Purpose: sign and submit a protocol-generic perp intent through signer-runtime.
- MCP mapping: `POST /tools/perps_execute_intent`.
- Required inputs:
  - `protocolSlug`, `chainSlug`, wallet selector, `intent`.

### list_protocols
- Priority: P0.
- Status: active in MVP (plugin/MCP path).
- Module ID: `list_protocols`.
- Purpose: query `clawdefi-core` for curated protocol catalog listings.
- MCP mapping: `POST /tools/list_protocols`.
- Required inputs:
  - optional `type`, `chainSlug`, `limit`.
- Output contract:
  - protocol catalog and count.
- Execution policy:
  - read-only path via `clawdefi-core`,
  - never invent or rank unsupported protocols when core returns empty.

### get_protocol_profile
- Priority: P0.
- Status: active in MVP (plugin/MCP path).
- Module ID: `get_protocol_profile`.
- Purpose: fetch canonical protocol profile/intel for a specific protocol slug.
- MCP mapping: `POST /tools/get_protocol_profile`.
- Required inputs:
  - `slug`.
- Output contract:
  - protocol overview, supported chains, contracts, and latest risk context.
- Execution policy:
  - read-only path via `clawdefi-core`,
  - return not-found signal and request clarification on slug when missing.

### query_protocol
- Priority: P1.
- Status: active in MVP (plugin/MCP path).
- Module ID: `query_protocol`.
- Purpose: preserve the older protocol-intel interface while routing into canonical curated Core reads.
- MCP mapping: `POST /tools/query_protocol`.
- Supported modes:
  - `list`
  - `profile`
  - `action_spec`
- Output contract:
  - returns `{ mode, data }` where `data` is the underlying curated Core result.
- Execution policy:
  - prefer canonical tool names (`list_protocols`, `get_protocol_profile`, `get_action_spec`) in new flows,
  - allow `query_protocol` as a stable OpenClaw-facing wrapper when callers want a single protocol-intel entrypoint.

### query_coingecko
- Priority: P0.
- Status: active in MVP (plugin/MCP path).
- Module ID: `query_coingecko`.
- Purpose: query CoinGecko market data for advisory market context (pricing, movement, liquidity metrics, token discovery).
- Implementation path: `plugin -> MCP /tools/query_coingecko`.
- Supported MCP modes (current):
  - `simple_price` -> `/api/v3/simple/price`,
  - `token_price` -> `/api/v3/simple/token_price/{assetPlatform}`,
  - `coin` -> `/api/v3/coins/{coinId}`,
  - `search` -> `/api/v3/search`.
- Credential policy:
  - optional API key in local env (`COINGECKO_API_KEY`),
  - `demo` plan uses header `x-cg-demo-api-key`,
  - `pro` plan uses header `x-cg-pro-api-key`,
  - key is local-only and must never be pasted into chat.
- Output contract:
  - returns provider metadata + parsed payload from MCP wrapper response.
- Execution policy:
  - read-only HTTP data retrieval,
  - treat API failures/rate-limit responses as advisory failure, not execution authorization.
- Safety rule:
  - never use CoinGecko as sole execution authority; reconcile all execution-critical fields with `clawdefi-core`,
  - never use CoinGecko as authoritative source for perp liquidation/PnL monitoring.

### query_token_audit
- Priority: P1.
- Status: active in MVP (plugin/MCP path).
- Module ID: `query_token_audit`.
- Purpose: fetch Binance Web3 token security/audit intel (scam, honeypot, tax, verification, supported-result flags).
- Implementation path: `plugin -> MCP /tools/query_token_audit`.
- Supported chains:
  - Ethereum (`1` / `ethereum` / `ethereum-mainnet`),
  - BSC (`56` / `bsc` / `bsc-mainnet`),
  - Base (`8453` / `base` / `base-mainnet`),
  - Solana (`CT_501` / `solana` / `solana-mainnet`).
- Required inputs:
  - `contractAddress`,
  - `chainSlug` or `chainId`.
- Output contract:
  - provider metadata + Binance Web3 audit payload.
- Safety rule:
  - for unknown or meme tokens, run this before suggesting user entry,
  - treat `hasResult=false` or `isSupported=false` as unresolved, not safe.

### query_token_info
- Priority: P1.
- Status: active in MVP (plugin/MCP path).
- Module ID: `query_token_info`.
- Purpose: fetch Binance Web3 token search, metadata, dynamic market info, and kline/candle intel.
- Implementation path: `plugin -> MCP /tools/query_token_info`.
- Supported modes:
  - `search` -> token search across supported chain ids,
  - `metadata` -> token metadata/social details by contract,
  - `dynamic` -> live market metrics by contract,
  - `kline` -> kline/candle data.
- Chain constraints:
  - `search`: chain ids may be supplied directly,
  - `metadata` / `dynamic`: Ethereum, BSC, Base, Solana,
  - `kline`: Ethereum, BSC, Base, Solana platform mapping.
- Safety rule:
  - treat token metadata and market stats as advisory intel,
  - do not treat Binance token info as canonical execution contract metadata.

### query_address_info
- Priority: P1.
- Status: active in MVP (plugin/MCP path).
- Module ID: `query_address_info`.
- Purpose: fetch Binance Web3 wallet/address holdings intel.
- Implementation path: `plugin -> MCP /tools/query_address_info`.
- Supported chains:
  - BSC (`56`),
  - Base (`8453`),
  - Solana (`CT_501`).
- Required inputs:
  - `address`,
  - `chainSlug` or `chainId`.
- Optional inputs:
  - `offset`.
- Output contract:
  - provider metadata + holdings/position payload for the address.

### crypto_market_rank
- Priority: P1.
- Status: active in MVP (plugin/MCP path).
- Module ID: `crypto_market_rank`.
- Purpose: fetch ranked market-discovery feeds from Binance Web3.
- Implementation path: `plugin -> MCP /tools/crypto_market_rank`.
- Supported modes:
  - `social_hype`,
  - `unified_rank`,
  - `smart_money_inflow`,
  - `meme_rank`,
  - `address_pnl_rank`.
- Coverage constraints:
  - `smart_money_inflow`: BSC and Solana only,
  - `meme_rank`: BSC only,
  - `address_pnl_rank`: BSC and Solana only,
  - other modes depend on Binance Web3 chain coverage.
- Safety rule:
  - treat rankings as discovery inputs, not endorsement or execution authority.

### trading_signal
- Priority: P1.
- Status: active in MVP (plugin/MCP path).
- Module ID: `trading_signal`.
- Purpose: fetch Binance Web3 smart-money buy/sell signal feeds.
- Implementation path: `plugin -> MCP /tools/trading_signal`.
- Supported chains:
  - BSC (`56`),
  - Solana (`CT_501`).
- Required inputs:
  - `smartSignalType` (`BUY` or `SELL`),
  - `chainSlug` or `chainId`.
- Optional inputs:
  - `page`,
  - `pageSize`.
- Safety rule:
  - signals are research input only; do not describe them as guaranteed alpha.

### meme_rush
- Priority: P1.
- Status: active in MVP (plugin/MCP path).
- Module ID: `meme_rush`.
- Purpose: fetch Binance Web3 meme-launch and topic-rush discovery feeds.
- Implementation path: `plugin -> MCP /tools/meme_rush`.
- Supported chains:
  - BSC (`56`),
  - Solana (`CT_501`).
- Supported modes:
  - `meme_rank_list`,
  - `topic_rush_rank_list`.
- Safety rule:
  - treat meme/token-rush results as high-volatility discovery only,
  - combine with `query_token_audit` before any execution recommendation.

### query_avantis
- Priority: P0.
- Status: active in MVP (plugin/MCP path).
- Module ID: `query_avantis`.
- Purpose: preflight Avantis market/feed context used by perp monitoring and execution.
- Implementation path: `plugin -> MCP /tools/query_avantis`.
- Supported MCP modes (current):
  - `health` -> monitoring health/dependency status,
  - `pair_feeds` -> normalized pair/feed snapshot for a requested symbol.
- Required inputs:
  - `health`: none,
  - `pair_feeds`: `pairSymbol` (for example `ETH-USD`).
- Output contract:
  - health mode returns dependency status, DNS/reachability checks, and degraded reasons,
  - pair-feed mode returns normalized symbol/feed linkage and snapshot context.
- Execution policy:
  - run before live Avantis monitoring claims and before Avantis position assertions,
  - keep feed/monitoring reads inside MCP adapter path by default.
- Safety rule:
  - if health checks fail or pair-feed linkage is missing, mark monitoring as degraded,
  - do not present precise platform PnL as authoritative when preflight is degraded.
- Fallback:
  - run `query_pyth` via plugin/MCP as default oracle fallback context and state Avantis feed/market path is degraded.

### query_pyth
- Priority: P0.
- Status: active in MVP (plugin/MCP path).
- Module ID: `query_pyth`.
- Purpose: query Pyth oracle data and endpoint metadata for monitoring paths.
- Implementation path: `plugin -> MCP /tools/query_pyth`.
- Supported MCP modes (current):
  - `latest` -> Hermes REST `GET /v2/updates/price/latest?ids[]=...`,
  - `stream` -> bounded raw SSE capture with parsed event output,
  - `stream_metadata` -> endpoint guidance (`transport: sse|pro-wss`),
  - `pro_wss` -> authenticated WebSocket endpoint metadata.
- Required inputs:
  - `latest`: `feedIds`,
  - `stream`: `feedIds`, optional `maxEvents`, `includeBinary`, `includeRawEvents`,
  - `stream_metadata`: `feedIds`, optional `transport`,
  - `pro_wss`: no feed ids required.
- Output contract:
  - MCP path returns provider metadata + payload, raw stream sample, or endpoint metadata depending on mode.
- Execution policy:
  - read-only market/oracle query path,
  - treat oracle query failure as a blocking signal for real-time perp monitoring confidence.
- Safety rule:
  - for Avantis/perp monitoring, treat Pyth/Avantis-native values as authoritative over CoinGecko.

### query_pyth_stream_open
- Priority: P0.
- Status: active in MVP (plugin/MCP path).
- Module ID: `query_pyth_stream_open`.
- Purpose: open a managed Pyth live-update session for one or more feed IDs.
- Implementation path: `plugin -> MCP /tools/query_pyth_stream_open`.
- Required inputs:
  - `feedIds` (array or comma-separated logical set),
  - optional stream/session settings supported by MCP runtime.
- Output contract:
  - session identifier,
  - stream metadata (`provider`, `transport`, heartbeat/TTL context),
  - initial status and cursor state.
- Execution policy:
  - open before polling,
  - treat the returned session id as required input for follow-on polling/close.

### query_pyth_stream_poll
- Priority: P0.
- Status: active in MVP (plugin/MCP path).
- Module ID: `query_pyth_stream_poll`.
- Purpose: poll incremental events from an existing managed Pyth live-update session.
- Implementation path: `plugin -> MCP /tools/query_pyth_stream_poll`.
- Required inputs:
  - stream/session identifier returned by `query_pyth_stream_open`.
- Output contract:
  - incremental update batch,
  - next cursor/session state,
  - stream health metadata.
- Execution policy:
  - use after `query_pyth_stream_open`,
  - if poll returns degraded or expired session state, reopen or fail closed for monitoring confidence.

### query_pyth_stream_close
- Priority: P0.
- Status: active in MVP (plugin/MCP path).
- Module ID: `query_pyth_stream_close`.
- Purpose: close a managed Pyth live-update session explicitly.
- Implementation path: `plugin -> MCP /tools/query_pyth_stream_close`.
- Required inputs:
  - stream/session identifier returned by `query_pyth_stream_open`.
- Output contract:
  - close acknowledgement with final session status.
- Execution policy:
  - call when monitoring session is no longer needed,
  - do not leave long-lived sessions open unnecessarily.

### query_contract_verification
- Priority: P0.
- Status: active in MVP (plugin/MCP path, Etherscan-backed).
- Module ID: `query_contract_verification`.
- Purpose: check whether a contract is source-verified before execution planning.
- Implementation path: `plugin -> MCP /tools/query_contract_verification`.
- Required inputs:
  - `chainId`,
  - `contractAddress`.
- Optional inputs:
  - `apiBaseUrl`,
  - `timeoutMs`.
- Output contract:
  - `verification.isVerified`, `verification.status`,
  - contract metadata (`contractName`, `compilerVersion`, `licenseType`, `isProxy`, `implementationAddress`),
  - `explorerCodeUrl`, `provider`, `checkedAt`.
- Credential policy:
  - MCP reads `ETHERSCAN_API_KEY` from local env/secret storage,
  - never ask users to paste explorer API keys into chat,
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
