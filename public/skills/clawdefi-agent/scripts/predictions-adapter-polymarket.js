'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { createRequire } = require('node:module')
const { pathToFileURL } = require('node:url')

const {
  MCP_DIR,
  parseChainSelector,
  readEnvMap,
  writeEnvValue
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

const DEFAULT_GAMMA_API_URL = (process.env.POLYMARKET_GAMMA_API_URL || 'https://gamma-api.polymarket.com').replace(/\/+$/, '')
const DEFAULT_CLOB_API_URL = (process.env.POLYMARKET_CLOB_API_URL || 'https://clob.polymarket.com').replace(/\/+$/, '')
const DEFAULT_TIMEOUT_MS = Number.parseInt(String(process.env.POLYMARKET_TIMEOUT_MS || '12000'), 10)
const DEFAULT_API_NONCE = Number.parseInt(String(process.env.POLYMARKET_API_NONCE || '0'), 10)

const FALLBACK_RPC_BY_CHAIN = {
  'polygon-pos': process.env.CLAWDEFI_POLYGON_RPC_URL || 'https://polygon-bor-rpc.publicnode.com',
  'polygon-amoy': process.env.CLAWDEFI_AMOY_RPC_URL || 'https://rpc-amoy.polygon.technology'
}

const POLYMARKET_CHAIN_BY_SLUG = {
  'polygon-pos': 137,
  'polygon-amoy': 80002
}

const API_ENV_KEYS = {
  key: 'POLYMARKET_CLOB_API_KEY',
  secret: 'POLYMARKET_CLOB_API_SECRET',
  passphrase: 'POLYMARKET_CLOB_API_PASSPHRASE',
  signatureType: 'POLYMARKET_SIGNATURE_TYPE',
  funderAddress: 'POLYMARKET_FUNDER_ADDRESS'
}

const ERC20_ABI = [
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)'
]

const ERC1155_ABI = [
  'function isApprovedForAll(address account, address operator) view returns (bool)',
  'function setApprovalForAll(address operator, bool approved)'
]

let cachedDeps = null
const INCLUDE_RAW = String(process.env.CLAWDEFI_INCLUDE_RAW || '').trim() === '1'

function normalizeChainInput (value) {
  const chainSlug = normalizeChainForPredictions(value || 'polygon-pos')
  const chainId = POLYMARKET_CHAIN_BY_SLUG[chainSlug]
  if (!chainId) {
    throw new Error(`Polymarket adapter does not support chain=${chainSlug}. Use polygon-pos (or polygon-amoy).`)
  }
  return {
    chainSlug,
    chainId
  }
}

function getRuntimeRequire () {
  const runtimePackagePath = path.join(MCP_DIR, 'package.json')
  if (fs.existsSync(runtimePackagePath)) {
    return createRequire(runtimePackagePath)
  }

  const fallbackMcpPackagePath = path.join(process.cwd(), 'mcp', 'package.json')
  if (fs.existsSync(fallbackMcpPackagePath)) {
    return createRequire(fallbackMcpPackagePath)
  }

  throw new Error(`WDK runtime not found at ${MCP_DIR}. Run bash {baseDir}/scripts/onboard.sh first.`)
}

async function importRuntimeModule (specifier) {
  const runtimeRequire = getRuntimeRequire()
  const resolved = runtimeRequire.resolve(specifier)
  return import(pathToFileURL(resolved).href)
}

async function loadDeps () {
  if (cachedDeps) return cachedDeps

  const runtimeRequire = getRuntimeRequire()
  let clobClient = null
  try {
    clobClient = await importRuntimeModule('@polymarket/clob-client')
  } catch {
    throw new Error(
      `@polymarket/clob-client is not installed in local runtime (${MCP_DIR}). Run bash {baseDir}/scripts/onboard.sh again.`
    )
  }

  let ethersLib = null
  try {
    ethersLib = runtimeRequire('ethers')
  } catch {
    throw new Error(
      `ethers is not installed in local runtime (${MCP_DIR}). Run bash {baseDir}/scripts/onboard.sh again.`
    )
  }

  cachedDeps = {
    clobClient,
    ethers: ethersLib
  }

  return cachedDeps
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
    fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json'
      }
    }),
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

function parseJsonArrayField (value) {
  if (Array.isArray(value)) {
    return value
  }
  if (typeof value === 'string') {
    const raw = value.trim()
    if (!raw) return []
    try {
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }
  return []
}

function toFiniteNumber (value) {
  const num = Number(value)
  return Number.isFinite(num) ? num : null
}

function normalizeOutcomeLabel (value) {
  return String(value || '').trim().toLowerCase()
}

function normalizeGammaMarket (raw) {
  const outcomes = parseJsonArrayField(raw.outcomes)
  const outcomePrices = parseJsonArrayField(raw.outcomePrices)
  const clobTokenIds = parseJsonArrayField(raw.clobTokenIds)

  const outcomeEntries = outcomes.map((label, index) => ({
    index,
    label: String(label || ''),
    tradeTokenId: clobTokenIds[index] ? String(clobTokenIds[index]) : null,
    price: outcomePrices[index] != null ? toFiniteNumber(outcomePrices[index]) : null
  }))

  return {
    source: 'gamma',
    marketId: raw.id != null ? String(raw.id) : null,
    slug: raw.slug ? String(raw.slug) : null,
    conditionId: raw.conditionId ? String(raw.conditionId) : null,
    question: raw.question ? String(raw.question) : null,
    description: raw.description ? String(raw.description) : null,
    active: typeof raw.active === 'boolean' ? raw.active : null,
    closed: typeof raw.closed === 'boolean' ? raw.closed : null,
    archived: typeof raw.archived === 'boolean' ? raw.archived : null,
    volume: toFiniteNumber(raw.volumeNum != null ? raw.volumeNum : raw.volume),
    liquidity: toFiniteNumber(raw.liquidityNum != null ? raw.liquidityNum : raw.liquidity),
    endDate: raw.endDate || raw.endDateIso || null,
    outcomes: outcomeEntries,
    ...(INCLUDE_RAW ? { raw } : {})
  }
}

function normalizeClobMarket (raw) {
  const tokens = Array.isArray(raw.tokens) ? raw.tokens : []

  return {
    source: 'clob',
    marketId: raw.market_id ? String(raw.market_id) : null,
    slug: raw.market_slug ? String(raw.market_slug) : null,
    conditionId: raw.condition_id ? String(raw.condition_id) : null,
    question: raw.question ? String(raw.question) : null,
    description: raw.description ? String(raw.description) : null,
    active: typeof raw.active === 'boolean' ? raw.active : null,
    closed: typeof raw.closed === 'boolean' ? raw.closed : null,
    archived: typeof raw.archived === 'boolean' ? raw.archived : null,
    acceptingOrders: typeof raw.accepting_orders === 'boolean' ? raw.accepting_orders : null,
    minimumTickSize: raw.minimum_tick_size != null ? String(raw.minimum_tick_size) : null,
    minimumOrderSize: raw.minimum_order_size != null ? String(raw.minimum_order_size) : null,
    outcomes: tokens.map((entry, index) => ({
      index,
      label: String(entry.outcome || ''),
      tradeTokenId: entry.token_id != null ? String(entry.token_id) : null,
      price: toFiniteNumber(entry.price)
    })),
    ...(INCLUDE_RAW ? { raw } : {})
  }
}

function mergeMarketViews (primary, secondary) {
  if (!primary) return secondary
  if (!secondary) return primary

  return {
    source: primary.source || secondary.source,
    marketId: primary.marketId || secondary.marketId || null,
    slug: primary.slug || secondary.slug || null,
    conditionId: primary.conditionId || secondary.conditionId || null,
    question: primary.question || secondary.question || null,
    description: primary.description || secondary.description || null,
    active: primary.active == null ? secondary.active : primary.active,
    closed: primary.closed == null ? secondary.closed : primary.closed,
    archived: primary.archived == null ? secondary.archived : primary.archived,
    acceptingOrders: primary.acceptingOrders == null ? secondary.acceptingOrders : primary.acceptingOrders,
    minimumTickSize: primary.minimumTickSize || secondary.minimumTickSize || null,
    minimumOrderSize: primary.minimumOrderSize || secondary.minimumOrderSize || null,
    volume: primary.volume == null ? secondary.volume : primary.volume,
    liquidity: primary.liquidity == null ? secondary.liquidity : primary.liquidity,
    endDate: primary.endDate || secondary.endDate || null,
    outcomes: (primary.outcomes && primary.outcomes.length ? primary.outcomes : secondary.outcomes) || [],
    raw: primary.raw || secondary.raw || null
  }
}

async function fetchGammaMarketsList ({ limit, offset, active, closed, archived }) {
  const url = new URL('/markets', DEFAULT_GAMMA_API_URL)
  if (limit != null) url.searchParams.set('limit', String(limit))
  if (offset != null) url.searchParams.set('offset', String(offset))
  if (active != null) url.searchParams.set('active', String(active))
  if (closed != null) url.searchParams.set('closed', String(closed))
  if (archived != null) url.searchParams.set('archived', String(archived))

  const payload = await fetchJson(url.toString())
  if (!Array.isArray(payload)) {
    throw new Error('Invalid Gamma markets response.')
  }
  return payload.map((entry) => normalizeGammaMarket(entry))
}

async function fetchGammaMarketById (marketId) {
  const id = parseStrictString(marketId, 'market-id')
  const payload = await fetchJson(`${DEFAULT_GAMMA_API_URL}/markets/${encodeURIComponent(id)}`)
  return normalizeGammaMarket(payload)
}

async function fetchGammaMarketBySlug (slug) {
  const normalizedSlug = parseStrictString(slug, 'slug')
  try {
    const bySlug = await fetchJson(`${DEFAULT_GAMMA_API_URL}/markets/slug/${encodeURIComponent(normalizedSlug)}`)
    return normalizeGammaMarket(bySlug)
  } catch {
    const searchList = await fetchGammaMarketsList({ limit: 50, offset: 0, active: null, closed: null, archived: null })
    const exact = searchList.find((entry) => entry.slug === normalizedSlug)
    if (!exact) {
      throw new Error(`Unable to resolve market slug: ${normalizedSlug}`)
    }
    return exact
  }
}

async function createPublicClient ({ host, chainId }) {
  const { clobClient } = await loadDeps()
  return new clobClient.ClobClient(
    host,
    chainId,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    true
  )
}

function toSignatureTypeEnum (clobClient, signatureType) {
  const normalized = String(signatureType || 'eoa').trim().toLowerCase()
  if (normalized === 'poly-proxy') return clobClient.SignatureType.POLY_PROXY
  if (normalized === 'poly-gnosis-safe') return clobClient.SignatureType.POLY_GNOSIS_SAFE
  return clobClient.SignatureType.EOA
}

function toClobSideEnum (clobClient, side) {
  const normalized = String(side || '').trim().toLowerCase()
  if (normalized === 'buy') return clobClient.Side.BUY
  if (normalized === 'sell') return clobClient.Side.SELL
  throw new Error('Trade side must be buy or sell.')
}

function toClobOrderTypeEnum (clobClient, value) {
  const normalized = String(value || '').trim().toUpperCase()
  if (!normalized) throw new Error('Missing order type.')
  if (typeof clobClient.OrderType[normalized] === 'undefined') {
    throw new Error(`Unsupported order type: ${value}`)
  }
  return clobClient.OrderType[normalized]
}

function createWdkSigner (account) {
  if (!account || typeof account.getAddress !== 'function') {
    throw new Error('WDK account is required for Polymarket signing.')
  }
  if (typeof account.signTypedData !== 'function') {
    throw new Error('Current WDK EVM account does not expose signTypedData().')
  }

  return {
    async getAddress () {
      return account.getAddress()
    },
    async _signTypedData (domain, types, value) {
      return account.signTypedData({
        domain,
        types,
        message: value
      })
    }
  }
}

async function createSignerClient ({ account, chainId, signatureType, funderAddress, creds = undefined, throwOnError = true }) {
  const { clobClient } = await loadDeps()
  const signer = createWdkSigner(account)
  const signatureTypeEnum = toSignatureTypeEnum(clobClient, signatureType)

  return new clobClient.ClobClient(
    DEFAULT_CLOB_API_URL,
    chainId,
    signer,
    creds,
    signatureTypeEnum,
    funderAddress || undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    throwOnError
  )
}

async function resolveRpcContext (chain, intent = 'read') {
  const normalized = normalizeChainInput(chain)
  const selector = parseChainSelector(normalized.chainSlug)

  if (selector) {
    try {
      const { callChainRegistry } = require('./wallet-common.js')
      const resolved = await callChainRegistry(selector, intent)
      return {
        chainSlug: resolved.chainSlug || normalized.chainSlug,
        chainId: resolved.chainId || normalized.chainId,
        rpcUrl: resolved.rpcUrl
      }
    } catch {
      // fallback below
    }
  }

  return {
    chainSlug: normalized.chainSlug,
    chainId: normalized.chainId,
    rpcUrl: FALLBACK_RPC_BY_CHAIN[normalized.chainSlug]
  }
}

async function fetchClobMarketByConditionId (publicClient, conditionId) {
  const normalized = parseStrictString(conditionId, 'condition-id')
  const payload = await publicClient.getMarket(normalized)
  return normalizeClobMarket(payload)
}

function resolveOutcomeSelection ({ market, outcome, tokenId }) {
  if (tokenId) {
    const normalizedTokenId = String(tokenId).trim()
    if (!normalizedTokenId) {
      throw new Error('Invalid --token-id.')
    }

    const matched = (market.outcomes || []).find((entry) => String(entry.tradeTokenId) === normalizedTokenId)
    return {
      tokenId: normalizedTokenId,
      outcomeLabel: matched ? matched.label : null,
      outcomeIndex: matched ? matched.index : null
    }
  }

  const entries = (market.outcomes || []).filter((entry) => entry.tradeTokenId)
  if (!entries.length) {
    throw new Error('No trade token IDs are available for this market.')
  }

  if (entries.length === 1 && !outcome) {
    return {
      tokenId: String(entries[0].tradeTokenId),
      outcomeLabel: entries[0].label,
      outcomeIndex: entries[0].index
    }
  }

  if (!outcome) {
    throw new Error('Market has multiple outcomes. Provide --outcome or --token-id.')
  }

  const normalizedOutcome = normalizeOutcomeLabel(outcome)

  if (/^\d+$/.test(normalizedOutcome)) {
    const index = Number.parseInt(normalizedOutcome, 10)
    const byIndex = entries.find((entry) => entry.index === index)
    if (!byIndex) {
      throw new Error(`Outcome index ${index} is not available for this market.`)
    }
    return {
      tokenId: String(byIndex.tradeTokenId),
      outcomeLabel: byIndex.label,
      outcomeIndex: byIndex.index
    }
  }

  const byLabel = entries.find((entry) => normalizeOutcomeLabel(entry.label) === normalizedOutcome)
  if (!byLabel) {
    throw new Error(`Unable to resolve outcome \"${outcome}\" for this market.`)
  }

  return {
    tokenId: String(byLabel.tradeTokenId),
    outcomeLabel: byLabel.label,
    outcomeIndex: byLabel.index
  }
}

async function resolveMarketSelection ({ publicClient, marketId, slug, conditionId, tokenId, outcome }) {
  let mergedMarket = null

  if (marketId) {
    mergedMarket = mergeMarketViews(mergedMarket, await fetchGammaMarketById(marketId))
  }

  if (!mergedMarket && slug) {
    mergedMarket = mergeMarketViews(mergedMarket, await fetchGammaMarketBySlug(slug))
  }

  if (!mergedMarket && conditionId) {
    mergedMarket = mergeMarketViews(mergedMarket, await fetchClobMarketByConditionId(publicClient, conditionId))
  }

  if (mergedMarket && mergedMarket.conditionId) {
    try {
      const clobMarket = await fetchClobMarketByConditionId(publicClient, mergedMarket.conditionId)
      mergedMarket = mergeMarketViews(mergedMarket, clobMarket)
    } catch {
      // Keep partial market view.
    }
  }

  if (!mergedMarket && tokenId) {
    mergedMarket = {
      source: 'token-only',
      marketId: null,
      slug: null,
      conditionId: conditionId || null,
      question: null,
      description: null,
      active: null,
      closed: null,
      archived: null,
      acceptingOrders: null,
      minimumTickSize: null,
      minimumOrderSize: null,
      volume: null,
      liquidity: null,
      endDate: null,
      outcomes: []
    }
  }

  if (!mergedMarket) {
    throw new Error('Unable to resolve market selector for Polymarket.')
  }

  const outcomeSelection = resolveOutcomeSelection({
    market: mergedMarket,
    outcome,
    tokenId
  })

  return {
    market: mergedMarket,
    tokenId: outcomeSelection.tokenId,
    outcomeLabel: outcomeSelection.outcomeLabel,
    outcomeIndex: outcomeSelection.outcomeIndex
  }
}

function estimateQuote ({ side, orderKind, price, size, amount, marketPrice }) {
  if (!side) return null

  if (orderKind === 'limit') {
    if (price == null || size == null) return null
    return {
      side,
      orderKind,
      price,
      size,
      estimatedNotionalUsd: Number((price * size).toFixed(6))
    }
  }

  if (orderKind === 'market') {
    if (amount == null) return null
    if (side === 'buy') {
      return {
        side,
        orderKind,
        amount,
        estimatedSpendUsd: Number(amount.toFixed(6)),
        estimatedMarketPrice: marketPrice == null ? null : Number(marketPrice.toFixed(6))
      }
    }

    return {
      side,
      orderKind,
      amount,
      estimatedSellShares: Number(amount.toFixed(6)),
      estimatedMarketPrice: marketPrice == null ? null : Number(marketPrice.toFixed(6))
    }
  }

  return null
}

async function discoverMarkets (input) {
  const mode = String(input.mode || 'list').trim().toLowerCase()

  if (mode === 'get') {
    const { chainId } = normalizeChainInput(input.chain || 'polygon-pos')
    const publicClient = await createPublicClient({ host: DEFAULT_CLOB_API_URL, chainId })
    const resolved = await resolveMarketSelection({
      publicClient,
      marketId: input.marketId,
      slug: input.slug,
      conditionId: input.conditionId,
      tokenId: input.tokenId,
      outcome: input.outcome
    })

    return {
      adapter: 'polymarket',
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

  let markets = []
  if (mode === 'search' && input.query) {
    const query = String(input.query).trim().toLowerCase()
    const pageSize = Math.max(50, Math.min(500, Number(input.limit) || 25))
    let offset = Number(input.offset) || 0

    for (let page = 0; page < 12; page++) {
      const batch = await fetchGammaMarketsList({
        limit: pageSize,
        offset,
        active: input.active,
        closed: input.closed,
        archived: input.archived
      })
      if (!batch.length) break

      const filtered = batch.filter((entry) => {
        const haystack = [entry.question, entry.slug, entry.description]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        return haystack.includes(query)
      })
      markets.push(...filtered)

      if (markets.length >= (Number(input.limit) || 25)) break
      offset += pageSize
    }
    markets = markets.slice(0, Number(input.limit) || 25)
  } else {
    markets = await fetchGammaMarketsList({
      limit: input.limit,
      offset: input.offset,
      active: input.active,
      closed: input.closed,
      archived: input.archived
    })
  }

  return {
    adapter: 'polymarket',
    mode,
    count: markets.length,
    markets,
    warnings: []
  }
}

async function quoteTrade (input) {
  const chain = normalizeChainInput(input.chain || 'polygon-pos')
  const publicClient = await createPublicClient({ host: DEFAULT_CLOB_API_URL, chainId: chain.chainId })

  const resolved = await resolveMarketSelection({
    publicClient,
    marketId: input.marketId,
    slug: input.slug,
    conditionId: input.conditionId,
    tokenId: input.tokenId,
    outcome: input.outcome
  })

  const tokenId = resolved.tokenId

  const [orderbook, midpoint, spread, tickSize, negRisk] = await Promise.all([
    publicClient.getOrderBook(tokenId),
    publicClient.getMidpoint(tokenId).catch(() => null),
    publicClient.getSpread(tokenId).catch(() => null),
    publicClient.getTickSize(tokenId).catch(() => null),
    publicClient.getNegRisk(tokenId).catch(() => null)
  ])

  let marketPrice = null
  if (input.side && input.orderKind === 'market' && input.amount != null) {
    const { clobClient } = await loadDeps()
    try {
      marketPrice = await publicClient.calculateMarketPrice(
        tokenId,
        toClobSideEnum(clobClient, input.side),
        input.amount,
        toClobOrderTypeEnum(clobClient, input.orderType || 'FOK')
      )
    } catch {
      marketPrice = null
    }
  }

  const priceForSide = input.side
    ? await publicClient.getPrice(tokenId, String(input.side).trim().toUpperCase()).catch(() => null)
    : null

  const quote = estimateQuote({
    side: input.side,
    orderKind: input.orderKind,
    price: input.price,
    size: input.size,
    amount: input.amount,
    marketPrice
  })

  return {
    adapter: 'polymarket',
    chain: chain.chainSlug,
    chainId: chain.chainId,
    market: resolved.market,
    selection: {
      tradeTokenId: tokenId,
      outcome: resolved.outcomeLabel,
      outcomeIndex: resolved.outcomeIndex
    },
    marketData: {
      orderbook,
      midpoint,
      spread,
      tickSize,
      negRisk,
      priceForSide
    },
    quote,
    warnings: []
  }
}

async function buildApprovalPlan ({
  accountAddress,
  chain,
  side,
  signedOrder,
  approvalMode,
  allowUnlimited,
  negRisk
}) {
  const mode = String(approvalMode || 'exact').trim().toLowerCase()
  if (mode === 'skip') {
    return {
      required: false,
      mode,
      steps: [],
      checks: {
        skipped: true
      },
      warnings: ['approval_skipped_by_user']
    }
  }

  if (mode === 'unlimited' && !allowUnlimited) {
    throw new Error('approval-mode unlimited requires --allow-unlimited true.')
  }

  const { clobClient, ethers: ethersLib } = await loadDeps()
  const rpc = await resolveRpcContext(chain, 'broadcast')
  const provider = new ethersLib.JsonRpcProvider(rpc.rpcUrl, rpc.chainId)

  const contractConfig = clobClient.getContractConfig(rpc.chainId)
  const spender = negRisk ? contractConfig.negRiskExchange : contractConfig.exchange

  const checks = {
    spender,
    collateralToken: contractConfig.collateral,
    conditionalTokens: contractConfig.conditionalTokens
  }

  const steps = []
  const warnings = []

  if (side === 'buy') {
    const requiredAllowance = BigInt(String(signedOrder.makerAmount || '0'))

    const collateralContract = new ethersLib.Contract(contractConfig.collateral, ERC20_ABI, provider)
    const currentAllowance = BigInt((await collateralContract.allowance(accountAddress, spender)).toString())

    checks.requiredCollateralAllowance = requiredAllowance.toString()
    checks.currentCollateralAllowance = currentAllowance.toString()

    if (currentAllowance < requiredAllowance) {
      const amountToApprove = mode === 'unlimited' ? ((1n << 256n) - 1n) : requiredAllowance
      const iface = new ethersLib.Interface(ERC20_ABI)
      const data = iface.encodeFunctionData('approve', [spender, amountToApprove])

      steps.push({
        name: 'approve_collateral',
        reason: 'allowance_too_low',
        txRequest: {
          to: contractConfig.collateral,
          data,
          value: '0'
        },
        details: {
          spender,
          mode,
          amount: amountToApprove.toString()
        }
      })
    }
  } else {
    const erc1155 = new ethersLib.Contract(contractConfig.conditionalTokens, ERC1155_ABI, provider)
    const approved = Boolean(await erc1155.isApprovedForAll(accountAddress, spender))
    checks.conditionalOperatorApproved = approved

    if (!approved) {
      const iface = new ethersLib.Interface(ERC1155_ABI)
      const data = iface.encodeFunctionData('setApprovalForAll', [spender, true])
      steps.push({
        name: 'approve_conditional_tokens',
        reason: 'operator_not_approved',
        txRequest: {
          to: contractConfig.conditionalTokens,
          data,
          value: '0'
        },
        details: {
          spender
        }
      })
    }
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
  const chain = normalizeChainInput(input.chain || 'polygon-pos')
  const signerClient = await createSignerClient({
    account: input.account,
    chainId: chain.chainId,
    signatureType: input.signatureType,
    funderAddress: input.funderAddress,
    creds: undefined,
    throwOnError: true
  })

  const quote = await quoteTrade(input)

  const { clobClient } = await loadDeps()
  const sideEnum = toClobSideEnum(clobClient, input.side)
  const orderTypeEnum = toClobOrderTypeEnum(clobClient, input.orderType)

  const options = {
    tickSize: quote.marketData.tickSize || '0.01',
    negRisk: quote.marketData.negRisk === true
  }

  let signedOrder = null
  if (input.orderKind === 'limit') {
    signedOrder = await signerClient.createOrder(
      {
        tokenID: quote.selection.tradeTokenId,
        price: input.price,
        size: input.size,
        side: sideEnum,
        feeRateBps: input.feeRateBps == null ? undefined : input.feeRateBps,
        nonce: input.nonce == null ? undefined : input.nonce,
        expiration: input.expiration == null ? undefined : input.expiration
      },
      options
    )
  } else {
    signedOrder = await signerClient.createMarketOrder(
      {
        tokenID: quote.selection.tradeTokenId,
        amount: input.amount,
        side: sideEnum,
        orderType: orderTypeEnum,
        price: input.price == null ? undefined : input.price,
        feeRateBps: input.feeRateBps == null ? undefined : input.feeRateBps,
        nonce: input.nonce == null ? undefined : input.nonce
      },
      options
    )
  }

  const approvalPlan = await buildApprovalPlan({
    accountAddress: input.walletAddress,
    chain: chain.chainSlug,
    side: input.side,
    signedOrder,
    approvalMode: input.approvalMode,
    allowUnlimited: input.allowUnlimited,
    negRisk: quote.marketData.negRisk === true
  })

  const intent = {
    adapter: 'polymarket',
    chain: chain.chainSlug,
    chainId: chain.chainId,
    market: {
      marketId: quote.market.marketId,
      slug: quote.market.slug,
      conditionId: quote.market.conditionId,
      tradeTokenId: quote.selection.tradeTokenId,
      outcome: quote.selection.outcome,
      outcomeIndex: quote.selection.outcomeIndex
    },
    order: {
      side: input.side,
      orderKind: input.orderKind,
      orderType: input.orderType,
      price: input.price,
      size: input.size,
      amount: input.amount,
      nonce: input.nonce,
      expiration: input.expiration,
      feeRateBps: input.feeRateBps,
      postOnly: input.postOnly,
      signatureType: input.signatureType,
      funderAddress: input.funderAddress
    },
    signedOrder,
    approvalPlan
  }

  return {
    adapter: 'polymarket',
    chain: chain.chainSlug,
    chainId: chain.chainId,
    market: quote.market,
    selection: quote.selection,
    quote: quote.quote,
    marketData: {
      tickSize: quote.marketData.tickSize,
      negRisk: quote.marketData.negRisk,
      midpoint: quote.marketData.midpoint,
      spread: quote.marketData.spread
    },
    signatureType: input.signatureType,
    funderAddress: input.funderAddress,
    orderKind: input.orderKind,
    orderType: input.orderType,
    postOnly: Boolean(input.postOnly),
    signedOrder,
    approvalPlan,
    intentHash: computeIntentHash(intent),
    warnings: approvalPlan.warnings || []
  }
}

function maskSecret (value) {
  const raw = String(value || '')
  if (!raw) return ''
  if (raw.length <= 8) return `${raw.slice(0, 2)}***${raw.slice(-1)}`
  return `${raw.slice(0, 4)}***${raw.slice(-4)}`
}

function isValidApiCreds (value) {
  return Boolean(
    value &&
      typeof value === 'object' &&
      typeof value.key === 'string' &&
      value.key &&
      typeof value.secret === 'string' &&
      value.secret &&
      typeof value.passphrase === 'string' &&
      value.passphrase
  )
}

function buildApiNonceCandidates () {
  const preferred = Number.isInteger(DEFAULT_API_NONCE) && DEFAULT_API_NONCE >= 0 ? DEFAULT_API_NONCE : 0
  const candidates = [preferred]
  for (const fallback of [0, 1, 2, 3, 4, 5]) {
    if (!candidates.includes(fallback)) {
      candidates.push(fallback)
    }
  }
  return candidates
}

async function withSuppressedClobLogs (callback) {
  const originalLog = console.log
  const originalError = console.error

  const passthrough = (fn) => (...args) => {
    const message = args
      .map((entry) => {
        if (typeof entry === 'string') return entry
        if (entry && typeof entry === 'object' && typeof entry.message === 'string') return entry.message
        return String(entry)
      })
      .join(' ')
    if (message.includes('[CLOB Client]')) {
      return
    }
    return fn(...args)
  }

  console.log = passthrough(originalLog)
  console.error = passthrough(originalError)
  try {
    return await callback()
  } finally {
    console.log = originalLog
    console.error = originalError
  }
}

async function ensureApiCreds ({
  account,
  chainId,
  signatureType,
  funderAddress,
  overrideCreds,
  persistApiCreds
}) {
  if (overrideCreds) {
    return {
      creds: overrideCreds,
      source: 'override'
    }
  }

  const env = await readEnvMap()
  const envCreds = {
    key: env[API_ENV_KEYS.key] || '',
    secret: env[API_ENV_KEYS.secret] || '',
    passphrase: env[API_ENV_KEYS.passphrase] || ''
  }

  if (envCreds.key && envCreds.secret && envCreds.passphrase) {
    return {
      creds: envCreds,
      source: 'env'
    }
  }

  const bootstrapClient = await createSignerClient({
    account,
    chainId,
    signatureType,
    funderAddress,
    creds: undefined,
    throwOnError: false
  })

  let derived = null
  let source = null
  const attemptedNonces = []
  for (const nonce of buildApiNonceCandidates()) {
    attemptedNonces.push(nonce)
    const created = await bootstrapClient.createApiKey(nonce)
    if (isValidApiCreds(created)) {
      derived = created
      source = `created_nonce_${nonce}`
      break
    }

    const recovered = await bootstrapClient.deriveApiKey(nonce)
    if (isValidApiCreds(recovered)) {
      derived = recovered
      source = `derived_nonce_${nonce}`
      break
    }
  }

  if (!isValidApiCreds(derived)) {
    throw new Error(
      `Unable to bootstrap Polymarket API credentials for nonces [${attemptedNonces.join(', ')}]. ` +
      'If your Polymarket account uses proxy/safe mode, set the correct --signature-type and --funder-address.'
    )
  }

  if (persistApiCreds) {
    await writeEnvValue(API_ENV_KEYS.key, derived.key)
    await writeEnvValue(API_ENV_KEYS.secret, derived.secret)
    await writeEnvValue(API_ENV_KEYS.passphrase, derived.passphrase)
    await writeEnvValue(API_ENV_KEYS.signatureType, String(signatureType || 'eoa'))
    if (funderAddress) {
      await writeEnvValue(API_ENV_KEYS.funderAddress, funderAddress)
    }
  }

  return {
    creds: derived,
    source: source || 'derived'
  }
}

async function submitBuiltOrder ({
  account,
  buildResult,
  overrideCreds = null,
  persistApiCreds = true
}) {
  return withSuppressedClobLogs(async () => {
    const chain = normalizeChainInput(buildResult.chain || 'polygon-pos')
    const { clobClient } = await loadDeps()

    const auth = await ensureApiCreds({
      account,
      chainId: chain.chainId,
      signatureType: buildResult.signatureType,
      funderAddress: buildResult.funderAddress,
      overrideCreds,
      persistApiCreds
    })

    const client = await createSignerClient({
      account,
      chainId: chain.chainId,
      signatureType: buildResult.signatureType,
      funderAddress: buildResult.funderAddress,
      creds: auth.creds,
      throwOnError: true
    })

    const warnings = []
    try {
      if (buildResult.orderKind === 'market' || buildResult.orderKind === 'limit') {
        await client.updateBalanceAllowance({
          asset_type: buildResult.orderKind && buildResult.orderKind === 'market' && buildResult.signedOrder.side === 0
            ? clobClient.AssetType.COLLATERAL
            : buildResult.signedOrder.side === 0
              ? clobClient.AssetType.COLLATERAL
              : clobClient.AssetType.CONDITIONAL,
          token_id: buildResult.signedOrder.side === 1 ? buildResult.selection.tradeTokenId : undefined
        })
      }
    } catch {
      warnings.push('balance_allowance_refresh_failed')
    }

    const orderTypeEnum = toClobOrderTypeEnum(clobClient, buildResult.orderType)
    const orderResult = await client.postOrder(
      buildResult.signedOrder,
      orderTypeEnum,
      false,
      Boolean(buildResult.postOnly)
    )

    if (orderResult && orderResult.error) {
      throw new Error(`Polymarket order rejected: ${orderResult.error}`)
    }
    if (orderResult && orderResult.errorMsg) {
      throw new Error(`Polymarket order rejected: ${orderResult.errorMsg}`)
    }

    return {
      orderResult,
      warnings,
      apiCredentials: {
        source: auth.source,
        key: maskSecret(auth.creds.key),
        passphrase: maskSecret(auth.creds.passphrase),
        secret: auth.source === 'override' ? '[override]' : '[hidden]'
      }
    }
  })
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
