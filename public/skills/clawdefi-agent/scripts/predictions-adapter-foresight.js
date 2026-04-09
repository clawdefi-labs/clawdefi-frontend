'use strict'

const {
  MCP_DIR,
  parseChainSelector
} = require('./wallet-common.js')

const {
  computeIntentHash,
  normalizeChainForPredictions,
  parseBooleanFlag,
  parseOptionalInteger,
  parseOptionalNumber,
  parseOptionalString,
  parseStrictString,
  stringifyBigInts,
  toWdkTxRequest
} = require('./predictions-common.js')

const DEFAULT_API_URL = (process.env.FORESIGHT_API_URL || 'https://api.foresight.now').replace(/\/+$/, '')
const DEFAULT_TIMEOUT_MS = Number.parseInt(String(process.env.FORESIGHT_TIMEOUT_MS || '12000'), 10)
const INCLUDE_RAW = String(process.env.CLAWDEFI_INCLUDE_RAW || '').trim() === '1'

const FORESIGHT_CHAIN_CONFIG = {
  'base-mainnet': {
    chainId: 8453,
    rpcFallback: process.env.CLAWDEFI_BASE_RPC_URL || 'https://mainnet.base.org',
    usdc: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'
  }
}

const ERC20_ABI = [
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)'
]

function normalizeChainInput (value) {
  const chainSlug = normalizeChainForPredictions(value || 'base-mainnet')
  const config = FORESIGHT_CHAIN_CONFIG[chainSlug]
  if (!config) {
    throw new Error(`Foresight adapter does not support chain=${chainSlug}. Use base-mainnet.`)
  }
  return { chainSlug, chainId: config.chainId }
}

function withTimeout (promise, timeoutMs, label) {
  const ms = Number.isInteger(timeoutMs) && timeoutMs > 0 ? timeoutMs : DEFAULT_TIMEOUT_MS
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms))
  ])
}

async function fetchJson (url, { timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const response = await withTimeout(
    fetch(url, { method: 'GET', headers: { Accept: 'application/json' } }),
    timeoutMs,
    `GET ${url}`
  )

  const bodyText = await response.text()
  let body = null
  if (bodyText.trim()) {
    body = JSON.parse(bodyText)
  }

  if (!response.ok) {
    const detail = body && typeof body === 'object' ? (body.message || body.error || JSON.stringify(body)) : bodyText
    throw new Error(`http_${response.status}: ${String(detail).slice(0, 320)}`)
  }

  return body
}

async function postJson (url, payload, { timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const response = await withTimeout(
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload)
    }),
    timeoutMs,
    `POST ${url}`
  )

  const bodyText = await response.text()
  let body = null
  if (bodyText.trim()) {
    body = JSON.parse(bodyText)
  }

  if (!response.ok) {
    const detail = body && typeof body === 'object' ? (body.message || body.error || JSON.stringify(body)) : bodyText
    throw new Error(`http_${response.status}: ${String(detail).slice(0, 320)}`)
  }

  return body
}

function toFiniteNumber (value) {
  const num = Number(value)
  return Number.isFinite(num) ? num : null
}

function normalizeOutcomeLabel (value) {
  return String(value || '').trim().toLowerCase()
}

function toUsdcBaseUnitsString (amountUi) {
  const numeric = Number(amountUi)
  if (!Number.isFinite(numeric) || numeric <= 0) {
    throw new Error('Amount must be a positive number.')
  }
  return String(BigInt(Math.round(numeric * 1_000_000)))
}

function normalizeForesightMarket (raw) {
  const marketId = String(raw.id || raw.marketId || raw.market_id || raw.address || '')
  const yesPrice = toFiniteNumber(raw.yesPrice ?? raw.yes_price ?? raw.outcomeYes ?? raw.outcome1Price)
  const noPrice = toFiniteNumber(raw.noPrice ?? raw.no_price ?? raw.outcomeNo ?? raw.outcome0Price)

  return {
    source: 'foresight',
    marketId,
    slug: raw.slug ? String(raw.slug) : null,
    conditionId: null,
    question: raw.question || raw.title || null,
    description: raw.description || null,
    active: typeof raw.active === 'boolean' ? raw.active : (raw.status === 'active' || raw.resolved !== true),
    closed: typeof raw.closed === 'boolean' ? raw.closed : (raw.resolved === true || raw.status === 'resolved'),
    archived: typeof raw.archived === 'boolean' ? raw.archived : null,
    volume: toFiniteNumber(raw.volume),
    liquidity: toFiniteNumber(raw.liquidity),
    endDate: raw.expiration || raw.endDate || raw.end_date || null,
    outcomes: [
      { index: 0, label: 'Yes', tradeTokenId: `${marketId}-yes`, price: yesPrice },
      { index: 1, label: 'No', tradeTokenId: `${marketId}-no`, price: noPrice }
    ],
    ...(INCLUDE_RAW ? { raw } : {})
  }
}

function parseTradeTokenId (tradeTokenId) {
  const raw = String(tradeTokenId || '')
  const dashIdx = raw.lastIndexOf('-')
  if (dashIdx < 0) {
    throw new Error(`Invalid Foresight tradeTokenId: ${raw}`)
  }
  const marketId = raw.slice(0, dashIdx)
  const side = raw.slice(dashIdx + 1).toLowerCase()
  if (side !== 'yes' && side !== 'no') {
    throw new Error(`Invalid Foresight tradeTokenId outcome: ${side}`)
  }
  return { marketId, outcomeSide: side, outcomeIndex: side === 'yes' ? 0 : 1 }
}

function resolveOutcomeSelection ({ market, outcome, tokenId }) {
  if (tokenId) {
    const normalizedTokenId = String(tokenId).trim()
    if (!normalizedTokenId) throw new Error('Invalid --token-id.')

    const matched = (market.outcomes || []).find((entry) => String(entry.tradeTokenId) === normalizedTokenId)
    if (!matched) {
      throw new Error(`Token ID "${normalizedTokenId}" does not belong to market ${market.marketId}. Valid: ${(market.outcomes || []).map(o => o.tradeTokenId).join(', ')}`)
    }
    return {
      tokenId: normalizedTokenId,
      outcomeLabel: matched.label,
      outcomeIndex: matched.index
    }
  }

  const entries = (market.outcomes || []).filter((entry) => entry.tradeTokenId)
  if (!entries.length) {
    throw new Error('No trade token IDs available for this market.')
  }

  if (!outcome) {
    throw new Error('Market has multiple outcomes. Provide --outcome (yes/no) or --token-id.')
  }

  const normalized = normalizeOutcomeLabel(outcome)

  if (/^\d+$/.test(normalized)) {
    const index = Number.parseInt(normalized, 10)
    const byIndex = entries.find((entry) => entry.index === index)
    if (!byIndex) throw new Error(`Outcome index ${index} is not available for this market.`)
    return { tokenId: String(byIndex.tradeTokenId), outcomeLabel: byIndex.label, outcomeIndex: byIndex.index }
  }

  const byLabel = entries.find((entry) => normalizeOutcomeLabel(entry.label) === normalized)
  if (!byLabel) throw new Error(`Unable to resolve outcome "${outcome}" for this market.`)
  return { tokenId: String(byLabel.tradeTokenId), outcomeLabel: byLabel.label, outcomeIndex: byLabel.index }
}

async function fetchForesightMarkets () {
  const payload = await fetchJson(`${DEFAULT_API_URL}/trade/markets`)
  const items = Array.isArray(payload) ? payload : (payload && Array.isArray(payload.markets) ? payload.markets : [])
  return items
}

async function resolveMarketSelection ({ marketId, slug, conditionId, tokenId, outcome }) {
  const markets = await fetchForesightMarkets()

  let resolvedMarketId = marketId
  if (!resolvedMarketId && tokenId) {
    const parsed = parseTradeTokenId(tokenId)
    resolvedMarketId = parsed.marketId
  }

  if (!resolvedMarketId) {
    if (slug || conditionId) {
      throw new Error('Foresight does not support --slug or --condition-id. Use --market-id or --token-id.')
    }
    throw new Error('Provide --market-id or --token-id to identify a Foresight market.')
  }

  const match = markets.find((m) => String(m.id || m.marketId || m.market_id || m.address) === String(resolvedMarketId))
  if (!match) {
    throw new Error(`Foresight market not found: ${resolvedMarketId}`)
  }

  const market = normalizeForesightMarket(match)
  const selection = resolveOutcomeSelection({ market, outcome, tokenId })

  const parsed = parseTradeTokenId(selection.tokenId)

  return {
    market,
    tokenId: selection.tokenId,
    outcomeLabel: selection.outcomeLabel,
    outcomeIndex: selection.outcomeIndex,
    foresightMarketId: resolvedMarketId,
    outcomeSide: parsed.outcomeSide,
    outcomeApiValue: parsed.outcomeIndex
  }
}

async function resolveRpcContext (chain) {
  const normalized = normalizeChainInput(chain)
  const selector = parseChainSelector(normalized.chainSlug)

  if (selector) {
    try {
      const { callChainRegistry } = require('./wallet-common.js')
      const resolved = await callChainRegistry(selector, 'broadcast')
      return {
        chainSlug: resolved.chainSlug || normalized.chainSlug,
        chainId: resolved.chainId || normalized.chainId,
        rpcUrl: resolved.rpcUrl
      }
    } catch {
      // fallback below
    }
  }

  const config = FORESIGHT_CHAIN_CONFIG[normalized.chainSlug]
  return {
    chainSlug: normalized.chainSlug,
    chainId: normalized.chainId,
    rpcUrl: config ? config.rpcFallback : null
  }
}

async function discoverMarkets (input) {
  const mode = String(input.mode || 'list').trim().toLowerCase()

  if (mode === 'get') {
    const resolved = await resolveMarketSelection({
      marketId: input.marketId,
      slug: input.slug,
      conditionId: input.conditionId,
      tokenId: input.tokenId,
      outcome: input.outcome
    })

    return {
      adapter: 'foresight',
      mode,
      market: resolved.market,
      selection: {
        tradeTokenId: resolved.tokenId,
        outcome: resolved.outcomeLabel,
        outcomeIndex: resolved.outcomeIndex
      },
      warnings: []
    }
  }

  let rawMarkets = await fetchForesightMarkets()
  let markets = rawMarkets.map((m) => normalizeForesightMarket(m))

  if (mode === 'search' && input.query) {
    const query = String(input.query).trim().toLowerCase()
    markets = markets.filter((entry) => {
      const haystack = [entry.question, entry.description, entry.slug]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return haystack.includes(query)
    })
  }

  if (input.active != null) {
    markets = markets.filter((m) => m.active === input.active)
  }
  if (input.closed != null) {
    markets = markets.filter((m) => m.closed === input.closed)
  }

  const offset = Number(input.offset) || 0
  const limit = Number(input.limit) || 25
  markets = markets.slice(offset, offset + limit)

  return {
    adapter: 'foresight',
    mode,
    count: markets.length,
    markets,
    warnings: []
  }
}

async function quoteTrade (input) {
  const chain = normalizeChainInput(input.chain || 'base-mainnet')

  const resolved = await resolveMarketSelection({
    marketId: input.marketId,
    slug: input.slug,
    conditionId: input.conditionId,
    tokenId: input.tokenId,
    outcome: input.outcome
  })

  const warnings = []
  if (input.orderKind === 'limit') {
    warnings.push('foresight_limit_orders_not_supported_using_market')
  }

  const amount = input.amount || (input.price != null && input.size != null ? input.price * input.size : null)
  if (amount == null || amount <= 0) {
    throw new Error('Foresight quote requires --amount (USDC) or both --price and --size.')
  }

  const amountBaseUnits = toUsdcBaseUnitsString(amount)

  const quoteResponse = await postJson(`${DEFAULT_API_URL}/trade/quote`, {
    market: resolved.foresightMarketId,
    outcome: resolved.outcomeApiValue,
    amount: amountBaseUnits,
    type: input.side === 'buy' ? 'Buy' : 'Sell'
  })

  const estimatedShares = toFiniteNumber(quoteResponse.shares ?? quoteResponse.estimatedShares)
  const estimatedSpendUsd = toFiniteNumber(quoteResponse.cost ?? quoteResponse.estimatedCost ?? amount)
  const avgPrice = toFiniteNumber(quoteResponse.avgPrice ?? quoteResponse.averagePrice ?? quoteResponse.price)

  return {
    adapter: 'foresight',
    chain: chain.chainSlug,
    chainId: chain.chainId,
    market: resolved.market,
    selection: {
      tradeTokenId: resolved.tokenId,
      outcome: resolved.outcomeLabel,
      outcomeIndex: resolved.outcomeIndex
    },
    marketData: {
      yesPrice: resolved.market.outcomes[0] ? resolved.market.outcomes[0].price : null,
      noPrice: resolved.market.outcomes[1] ? resolved.market.outcomes[1].price : null
    },
    quote: {
      side: input.side,
      orderKind: 'market',
      amount,
      estimatedShares,
      estimatedSpendUsd,
      estimatedMarketPrice: avgPrice
    },
    warnings
  }
}

async function buildApprovalPlan ({
  accountAddress,
  chain,
  spenderAddress,
  amountUsdc,
  approvalMode,
  allowUnlimited
}) {
  const mode = String(approvalMode || 'exact').trim().toLowerCase()
  if (mode === 'skip') {
    return {
      required: false,
      mode,
      steps: [],
      checks: { skipped: true },
      warnings: ['approval_skipped_by_user']
    }
  }

  if (mode === 'unlimited' && !allowUnlimited) {
    throw new Error('approval-mode unlimited requires --allow-unlimited true.')
  }

  const config = FORESIGHT_CHAIN_CONFIG[chain]
  if (!config) {
    throw new Error(`No Foresight chain config for ${chain}.`)
  }

  let ethersLib = null
  try {
    ethersLib = require('ethers')
  } catch {
    try {
      const { createRequire } = require('node:module')
      const runtimeRequire = createRequire(require('node:path').join(MCP_DIR, 'package.json'))
      ethersLib = runtimeRequire('ethers')
    } catch {
      return {
        required: true,
        mode,
        checks: { ethers_unavailable: true },
        steps: [],
        warnings: ['approval_check_skipped_ethers_unavailable']
      }
    }
  }

  const rpc = await resolveRpcContext(chain)
  const provider = new ethersLib.JsonRpcProvider(rpc.rpcUrl, rpc.chainId)

  const usdcDecimals = 6
  const requiredAllowance = BigInt(Math.ceil(amountUsdc * (10 ** usdcDecimals)))

  const collateralContract = new ethersLib.Contract(config.usdc, ERC20_ABI, provider)
  const currentAllowance = BigInt((await collateralContract.allowance(accountAddress, spenderAddress)).toString())

  const checks = {
    spender: spenderAddress,
    collateralToken: config.usdc,
    requiredCollateralAllowance: requiredAllowance.toString(),
    currentCollateralAllowance: currentAllowance.toString()
  }

  const steps = []
  const warnings = []

  if (currentAllowance < requiredAllowance) {
    const amountToApprove = mode === 'unlimited' ? ((1n << 256n) - 1n) : requiredAllowance
    const iface = new ethersLib.Interface(ERC20_ABI)
    const data = iface.encodeFunctionData('approve', [spenderAddress, amountToApprove])

    steps.push({
      name: 'approve_usdc',
      reason: 'allowance_too_low',
      txRequest: {
        to: config.usdc,
        data,
        value: '0'
      },
      details: {
        spender: spenderAddress,
        mode,
        amount: amountToApprove.toString()
      }
    })
  }

  if (steps.length === 0) {
    warnings.push('approval_not_required')
  }

  return {
    required: steps.length > 0,
    mode,
    checks,
    steps,
    warnings
  }
}

async function buildTrade (input) {
  const chain = normalizeChainInput(input.chain || 'base-mainnet')
  const quote = await quoteTrade(input)

  const amount = input.amount || (input.price != null && input.size != null ? input.price * input.size : null)
  const amountBaseUnits = toUsdcBaseUnitsString(amount)

  const tradeResponse = await postJson(`${DEFAULT_API_URL}/trade`, {
    market: quote.market.marketId,
    outcome: quote.selection.outcomeIndex,
    amount: amountBaseUnits,
    type: input.side === 'buy' ? 'Buy' : 'Sell',
    account: input.walletAddress
  })

  const tradeTx = tradeResponse.tx || tradeResponse.transaction || tradeResponse
  const txRequest = {
    to: tradeTx.to,
    data: tradeTx.data,
    value: tradeTx.value || '0'
  }

  const spenderAddress = tradeTx.to
  const approvalPlan = await buildApprovalPlan({
    accountAddress: input.walletAddress,
    chain: chain.chainSlug,
    spenderAddress,
    amountUsdc: amount,
    approvalMode: input.approvalMode,
    allowUnlimited: input.allowUnlimited
  })

  const intent = {
    adapter: 'foresight',
    chain: chain.chainSlug,
    chainId: chain.chainId,
    market: {
      marketId: quote.market.marketId,
      tradeTokenId: quote.selection.tradeTokenId,
      outcome: quote.selection.outcome,
      outcomeIndex: quote.selection.outcomeIndex
    },
    txRequest,
    approvalPlan
  }

  return {
    adapter: 'foresight',
    chain: chain.chainSlug,
    chainId: chain.chainId,
    market: quote.market,
    selection: quote.selection,
    quote: quote.quote,
    marketData: quote.marketData,
    signedOrder: null,
    txRequest,
    approvalPlan,
    intentHash: computeIntentHash(intent),
    warnings: [...(quote.warnings || []), ...(approvalPlan.warnings || [])]
  }
}

async function submitBuiltOrder ({
  account,
  buildResult,
  overrideCreds = null,
  persistApiCreds = true
}) {
  if (!buildResult.txRequest) {
    throw new Error('Foresight build result missing txRequest calldata.')
  }

  const txRequest = toWdkTxRequest(buildResult.txRequest)
  const sent = await account.sendTransaction(txRequest)

  return {
    orderResult: {
      type: 'onchain_transaction',
      txHash: sent.hash || sent.transactionHash || null,
      transaction: stringifyBigInts(sent)
    },
    warnings: [],
    apiCredentials: null
  }
}

module.exports = {
  discoverMarkets,
  quoteTrade,
  buildTrade,
  submitBuiltOrder,
  parseBooleanFlag,
  parseOptionalInteger,
  parseOptionalNumber,
  parseOptionalString,
  stringifyBigInts,
  toWdkTxRequest
}
