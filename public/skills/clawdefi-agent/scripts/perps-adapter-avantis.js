'use strict'

const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const { createRequire } = require('node:module')

const {
  MCP_DIR,
  callChainRegistry,
  parseChainSelector
} = require('./wallet-common.js')

const CORE_API_BASE_URL = (process.env.AVANTIS_CORE_API_BASE_URL || 'https://core.avantisfi.com').replace(/\/+$/, '')
const SOCKET_API_URL = process.env.AVANTIS_SOCKET_API_URL || 'https://socket-api-pub.avantisfi.com/socket-api/v1/data'
const DEFAULT_TIMEOUT_MS = Number.parseInt(String(process.env.AVANTIS_TIMEOUT_MS || '10000'), 10)
const BASE_RPC_FALLBACK = process.env.CLAWDEFI_BASE_RPC_URL || process.env.AVANTIS_RPC_URL || 'https://mainnet.base.org'
const DEFAULT_CLAWDEFI_FEE_RECIPIENT = '0x25Aa761B02C45D2B57bBb54Dd04D42772afdd291'
const REFERRAL_ABI_MIN = [
  'function getTraderReferralInfo(address _account) view returns (bytes32,address)',
  'function setTraderReferralCodeByUser(bytes32 _code)'
]

function normalizeAddressOrNull (value) {
  const raw = String(value || '').trim()
  if (!raw) return null
  if (!/^0x[a-fA-F0-9]{40}$/.test(raw)) return null
  return raw.toLowerCase()
}

const CLAWDEFI_REFERRAL_RECIPIENT = normalizeAddressOrNull(
  process.env.CLAWDEFI_AVANTIS_REFERRER_ADDRESS ||
  process.env.CLAWDEFI_FEE_RECIPIENT ||
  DEFAULT_CLAWDEFI_FEE_RECIPIENT
)

function buildReferralDisclosure () {
  return {
    traderBenefit: 'Benefit to you: trading fee discount (depends on Avantis referral tier).',
    clawdefiBenefit: 'Benefit to ClawDeFi: referral fee rebate.',
    note: 'Referral discounts apply on fixed-fee trades per Avantis docs.',
    consentRequired: true,
    clawdefiReferralRecipient: CLAWDEFI_REFERRAL_RECIPIENT
  }
}

function normalizeMarketSymbol (input) {
  return String(input || '').trim().replace(/[\s_-]+/g, '/').replace(/\/+/g, '/').toUpperCase()
}

function normalizeChainSlug (input) {
  const raw = String(input || 'base-mainnet').trim().toLowerCase()
  if (!raw || raw === 'base') return 'base-mainnet'
  return raw
}

function sortKeysRecursively (value) {
  if (Array.isArray(value)) return value.map((entry) => sortKeysRecursively(entry))
  if (!value || typeof value !== 'object') return value
  const out = {}
  for (const key of Object.keys(value).sort()) {
    out[key] = sortKeysRecursively(value[key])
  }
  return out
}

function computeIntentHash (intent) {
  const canonical = JSON.stringify(sortKeysRecursively(intent))
  return `0x${crypto.createHash('sha256').update(canonical).digest('hex')}`
}

function parseNonNegativeInteger (value, label) {
  const num = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(num) || !Number.isInteger(num) || num < 0) {
    throw new Error(`${label} must be a non-negative integer.`)
  }
  return num
}

function parsePositiveNumber (value, label) {
  const num = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(num) || num <= 0) {
    throw new Error(`${label} must be a positive number.`)
  }
  return num
}

function parseNonNegativeNumber (value, label) {
  const num = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(num) || num < 0) {
    throw new Error(`${label} must be >= 0.`)
  }
  return num
}

function computeNotionalUsd (collateralUsd, leverage) {
  return Number((Number(collateralUsd) * Number(leverage)).toFixed(6))
}

function computeMinCollateralRequiredUsd (minPositionSizeUsd, leverage) {
  if (!Number.isFinite(minPositionSizeUsd) || minPositionSizeUsd <= 0) return 0
  if (!Number.isFinite(leverage) || leverage <= 0) return minPositionSizeUsd
  return Number((minPositionSizeUsd / leverage).toFixed(6))
}

function toBigIntFlexible (value, fallback = 0n) {
  if (value === undefined || value === null || value === '') return fallback
  if (typeof value === 'bigint') return value
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value < 0) return fallback
    return BigInt(Math.trunc(value))
  }
  if (typeof value === 'string') {
    const raw = value.trim()
    if (!raw) return fallback
    if (/^0x[0-9a-fA-F]+$/.test(raw)) return BigInt(raw)
    if (/^\d+$/.test(raw)) return BigInt(raw)
  }
  return fallback
}

function toNumberFlexible (value, fallback = 0) {
  if (value === undefined || value === null || value === '') return fallback
  const num = Number(value)
  return Number.isFinite(num) ? num : fallback
}

function withTimeout (promise, timeoutMs, label) {
  const ms = Number.isInteger(timeoutMs) && timeoutMs > 0 ? timeoutMs : 10000
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms))
  ])
}

async function fetchJson(url, timeoutMs = DEFAULT_TIMEOUT_MS) {
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
  if (bodyText) {
    body = JSON.parse(bodyText)
  }

  if (!response.ok) {
    const detail = body && typeof body === 'object' ? (body.message || body.error || JSON.stringify(body)) : bodyText
    throw new Error(`http_${response.status}: ${String(detail).slice(0, 300)}`)
  }

  return body
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

function getSdk () {
  const runtimeRequire = getRuntimeRequire()
  try {
    return runtimeRequire('avantis-trader-sdk')
  } catch {
    throw new Error(
      `avantis-trader-sdk is not installed in local runtime (${MCP_DIR}). Run bash {baseDir}/scripts/onboard.sh again.`
    )
  }
}

function getEthers () {
  const runtimeRequire = getRuntimeRequire()
  try {
    return runtimeRequire('ethers')
  } catch {
    throw new Error(
      `ethers is not installed in local runtime (${MCP_DIR}). Run bash {baseDir}/scripts/onboard.sh again.`
    )
  }
}

function parseReferralCode (value) {
  const referralCode = String(value || '').trim()
  if (!referralCode) {
    throw new Error('referralCode is required.')
  }
  if (Buffer.byteLength(referralCode, 'utf8') > 31) {
    throw new Error('referralCode must be <= 31 UTF-8 bytes.')
  }
  return referralCode
}

function decodeBytes32StringSafe (ethersLib, bytes32Value) {
  if (!bytes32Value || bytes32Value === '0x' || /^0x0{64}$/i.test(String(bytes32Value))) {
    return ''
  }
  try {
    return ethersLib.decodeBytes32String(bytes32Value)
  } catch {
    return ''
  }
}

function getReferralContractAddress (sdk) {
  if (process.env.AVANTIS_REFERRAL_CONTRACT && process.env.AVANTIS_REFERRAL_CONTRACT.trim()) {
    return process.env.AVANTIS_REFERRAL_CONTRACT.trim()
  }
  if (sdk && sdk.CONTRACTS && typeof sdk.CONTRACTS.Referral === 'string' && sdk.CONTRACTS.Referral.trim()) {
    return sdk.CONTRACTS.Referral
  }
  throw new Error('Unable to resolve Avantis referral contract address.')
}

function getReferralContract ({ sdk, client }) {
  const ethersLib = getEthers()
  const referralAddress = getReferralContractAddress(sdk)
  const contract = new ethersLib.Contract(referralAddress, REFERRAL_ABI_MIN, client.provider)
  return {
    contract,
    referralAddress,
    ethersLib
  }
}

async function resolveRpcContext (chainSlug, intent = 'read') {
  const normalized = normalizeChainSlug(chainSlug)
  const selector = parseChainSelector(normalized)

  try {
    if (selector) {
      const resolved = await callChainRegistry(selector, intent)
      if (resolved && resolved.rpcUrl) {
        return {
          chainSlug: resolved.chainSlug || normalized,
          chainId: resolved.chainId || 8453,
          rpcUrl: resolved.rpcUrl
        }
      }
    }
  } catch {
    // fallback below
  }

  return {
    chainSlug: normalized,
    chainId: normalized === 'base-mainnet' ? 8453 : null,
    rpcUrl: BASE_RPC_FALLBACK
  }
}

async function buildClient (chainSlug) {
  const sdk = getSdk()
  const rpc = await resolveRpcContext(chainSlug, 'broadcast')
  const client = new sdk.TraderClient(rpc.rpcUrl)
  return {
    sdk,
    client,
    rpc
  }
}

function mapSocketPairs (socketPayload) {
  const pairInfos =
    socketPayload && socketPayload.data && socketPayload.data.pairInfos && typeof socketPayload.data.pairInfos === 'object'
      ? socketPayload.data.pairInfos
      : {}

  return Object.values(pairInfos).map((pair) => {
    const from = String(pair && pair.from ? pair.from : '').toUpperCase()
    const to = String(pair && pair.to ? pair.to : '').toUpperCase()
    return {
      market: `${from}/${to}`,
      pairIndex: typeof pair.index === 'number' ? pair.index : null,
      feedId: pair && pair.feed ? pair.feed.feedId : null,
      lazerFeedId: pair && pair.lazerFeed ? pair.lazerFeed.feedId : null,
      listed: Boolean(pair && pair.isPairListed),
      openFeePct: typeof pair.openFeeP === 'number' ? pair.openFeeP : null,
      closeFeePct: typeof pair.closeFeeP === 'number' ? pair.closeFeeP : null,
      openInterest: pair && pair.openInterest ? pair.openInterest : null,
      raw: pair
    }
  })
}

async function fetchSocketSnapshot () {
  const payload = await fetchJson(SOCKET_API_URL)
  if (!payload || payload.success !== true) {
    throw new Error('avantis_socket_unavailable: invalid socket payload')
  }
  return payload
}

async function fetchUserData (walletAddress) {
  const payload = await fetchJson(`${CORE_API_BASE_URL}/user-data?trader=${encodeURIComponent(walletAddress)}`)
  const positionsRaw = Array.isArray(payload && payload.positions) ? payload.positions : []
  const limitOrdersRaw = Array.isArray(payload && payload.limitOrders) ? payload.limitOrders : []

  const positions = positionsRaw.map((entry) => {
    const record = entry && typeof entry === 'object' ? { ...entry } : { raw: entry }
    const pairIndex = toNumberFlexible(record.pairIndex, NaN)
    const tradeIndex = toNumberFlexible(record.index, NaN)
    const fallbackId = Number.isFinite(pairIndex) && Number.isFinite(tradeIndex) ? `${pairIndex}:${tradeIndex}` : null
    const positionId = String(record.positionId || record.id || fallbackId || '').trim()

    return {
      positionId,
      pairIndex: Number.isFinite(pairIndex) ? pairIndex : null,
      tradeIndex: Number.isFinite(tradeIndex) ? tradeIndex : null,
      side: record.buy === true ? 'long' : record.buy === false ? 'short' : null,
      leverage: toNumberFlexible(record.leverage, 0),
      tp: toNumberFlexible(record.tp, 0),
      sl: toNumberFlexible(record.sl, 0),
      openPrice: toNumberFlexible(record.openPrice, 0),
      collateralUsd: toNumberFlexible(record.collateral || record.initialPosToken, 0),
      collateralRaw: toBigIntFlexible(record.collateral || record.initialPosToken || record.positionSizeUSDC, 0n),
      positionSizeUSDC: toNumberFlexible(record.positionSizeUSDC || record.positionSizeUsdc || record.positionSize, 0),
      positionSizeRaw: toBigIntFlexible(record.positionSizeUSDC || record.positionSizeUsdc || record.positionSize, 0n),
      raw: record
    }
  })

  const pendingOrders = limitOrdersRaw.map((entry) => {
    const record = entry && typeof entry === 'object' ? { ...entry } : { raw: entry }
    const pairIndex = toNumberFlexible(record.pairIndex, NaN)
    const orderIndex = toNumberFlexible(record.index, NaN)
    const orderId = String(record.orderId || record.id || (Number.isFinite(pairIndex) && Number.isFinite(orderIndex) ? `${pairIndex}:${orderIndex}` : '')).trim()
    return {
      orderId,
      pairIndex: Number.isFinite(pairIndex) ? pairIndex : null,
      orderIndex: Number.isFinite(orderIndex) ? orderIndex : null,
      side: record.buy === true ? 'long' : record.buy === false ? 'short' : null,
      price: toNumberFlexible(record.price, 0),
      leverage: toNumberFlexible(record.leverage, 0),
      tp: toNumberFlexible(record.tp, 0),
      sl: toNumberFlexible(record.sl, 0),
      raw: record
    }
  })

  return {
    positions,
    pendingOrders
  }
}

function mapOrderTypeToNumeric (orderType) {
  const normalized = String(orderType || 'market').trim().toLowerCase()
  if (normalized === 'market') return 0
  if (normalized === 'limit') return 1
  if (normalized === 'stop_limit') return 2
  if (normalized === 'market_zero_fee') return 3
  return 0
}

async function resolvePairState ({ client, sdk, market }) {
  const normalizedMarket = normalizeMarketSymbol(market)
  if (!normalizedMarket || !normalizedMarket.includes('/')) {
    throw new Error('Invalid market symbol. Use format like ETH/USD.')
  }

  const pairIndexMaybe = await client.pairsCache.getPairIndex(normalizedMarket)
  if (typeof pairIndexMaybe !== 'number' || !Number.isFinite(pairIndexMaybe)) {
    throw new Error(`Market ${normalizedMarket} not found on Avantis.`)
  }
  const pairIndex = pairIndexMaybe

  const [pairInfo, pairBackend, socketPayload] = await Promise.all([
    client.pairsCache.getPairByIndex(pairIndex),
    client.pairsCache.getPairBackend(pairIndex),
    fetchSocketSnapshot()
  ])

  const socketPairs = mapSocketPairs(socketPayload)
  const socketPair = socketPairs.find((entry) => entry.pairIndex === pairIndex || normalizeMarketSymbol(entry.market) === normalizedMarket) || null

  const maxLeverageFromBackend = sdk.fromBlockchain10(pairBackend.pair.leverages.maxLeverage)
  const minLeverageFromBackend = sdk.fromBlockchain10(pairBackend.pair.leverages.minLeverage)
  const minLevPosUsd = sdk.fromBlockchain6(pairBackend.fee.minLevPosUSDC)
  const minPositionSizeUsd = Number(minLevPosUsd)

  return {
    market: normalizedMarket,
    pairIndex,
    pairInfo: pairInfo || null,
    maxLeverage: Number(maxLeverageFromBackend),
    minLeverage: Number(minLeverageFromBackend),
    minPositionSizeUsd,
    minCollateralUsdAt1x: minPositionSizeUsd,
    // Backward-compatible alias for downstream callers expecting this field.
    minCollateralUsd: minPositionSizeUsd,
    fee: {
      openFeePct: socketPair && socketPair.openFeePct !== null ? socketPair.openFeePct : Number(sdk.fromBlockchain12(pairBackend.fee.openFeeP)),
      closeFeePct: socketPair && socketPair.closeFeePct !== null ? socketPair.closeFeePct : Number(sdk.fromBlockchain12(pairBackend.fee.closeFeeP))
    },
    feed: {
      feedId: socketPair && socketPair.feedId ? socketPair.feedId : pairBackend.pair.feed.feedId,
      lazerFeedId: socketPair && socketPair.lazerFeedId ? socketPair.lazerFeedId : null
    },
    openInterest: socketPair ? socketPair.openInterest : null,
    listed: socketPair ? socketPair.listed : true,
    dataVersion: socketPayload && socketPayload.data ? socketPayload.data.dataVersion : null
  }
}

async function resolveExecutionFeeWei (client) {
  try {
    const tradingContract = client.getContract('Trading')
    if (tradingContract && typeof tradingContract.getExecutionFee === 'function') {
      const fee = await tradingContract.getExecutionFee()
      return typeof fee === 'bigint' && fee > 0n ? fee : 1n
    }
  } catch {
    // fallback below
  }

  return 1n
}

function buildOpenIntent (input) {
  return {
    intentVersion: 'perps.intent.v1',
    protocolSlug: 'avantis',
    chainSlug: normalizeChainSlug(input.chainSlug),
    action: 'open_order',
    wallet: {
      walletAddress: input.walletAddress
    },
    market: input.market,
    params: {
      side: input.side,
      collateralUsd: input.collateralUsd,
      leverage: input.leverage,
      orderType: input.orderType,
      openPrice: input.openPrice,
      takeProfit: input.takeProfit,
      stopLoss: input.stopLoss,
      maxSlippageP: input.maxSlippageP,
      pairIndex: input.pairIndex,
      maxLeverage: input.maxLeverage
    },
    policy: {
      category: 'perps',
      amountUsd: Number((input.collateralUsd * input.leverage).toFixed(6))
    },
    createdAt: new Date().toISOString(),
    metadata: {
      sourceTool: 'perps_open_build',
      adapter: 'avantis'
    }
  }
}

function findPositionRecord (positions, input) {
  const pairIndex = input.pairIndex !== null ? parseNonNegativeInteger(input.pairIndex, 'pairIndex') : null
  const tradeIndex = input.tradeIndex !== null ? parseNonNegativeInteger(input.tradeIndex, 'tradeIndex') : null
  const positionId = input.positionId ? String(input.positionId).trim() : ''

  if (pairIndex !== null && tradeIndex !== null) {
    const found = positions.find((row) => row.pairIndex === pairIndex && row.tradeIndex === tradeIndex)
    if (found) return found
  }

  if (positionId) {
    const found = positions.find((row) => String(row.positionId || '').trim() === positionId)
    if (found) return found

    if (/^\d+:\d+$/.test(positionId)) {
      const [pairRaw, indexRaw] = positionId.split(':')
      const p = Number.parseInt(pairRaw, 10)
      const i = Number.parseInt(indexRaw, 10)
      const secondTry = positions.find((row) => row.pairIndex === p && row.tradeIndex === i)
      if (secondTry) return secondTry
    }
  }

  throw new Error('Position not found. Provide --position-id or --pair-index with --trade-index.')
}

function findPendingOrderRecord (orders, input) {
  const pairIndex = input.pairIndex !== null ? parseNonNegativeInteger(input.pairIndex, 'pairIndex') : null
  const orderIndex = input.orderIndex !== null ? parseNonNegativeInteger(input.orderIndex, 'orderIndex') : null
  const orderId = input.orderId ? String(input.orderId).trim() : ''

  if (pairIndex !== null && orderIndex !== null) {
    const found = orders.find((row) => row.pairIndex === pairIndex && row.orderIndex === orderIndex)
    if (found) return found
  }

  if (orderId) {
    const found = orders.find((row) => String(row.orderId || '').trim() === orderId)
    if (found) return found

    if (/^\d+:\d+$/.test(orderId)) {
      const [pairRaw, indexRaw] = orderId.split(':')
      const p = Number.parseInt(pairRaw, 10)
      const i = Number.parseInt(indexRaw, 10)
      const secondTry = orders.find((row) => row.pairIndex === p && row.orderIndex === i)
      if (secondTry) return secondTry
    }
  }

  throw new Error('Pending order not found. Provide --order-id or --pair-index with --order-index.')
}

function normalizeTxForOutput (tx) {
  const out = {
    to: tx.to,
    data: tx.data || '0x',
    value: typeof tx.value === 'bigint' ? tx.value : toBigIntFlexible(tx.value, 0n)
  }
  for (const key of ['gasLimit', 'gasPrice', 'maxFeePerGas', 'maxPriorityFeePerGas', 'nonce']) {
    if (typeof tx[key] !== 'undefined' && tx[key] !== null) {
      out[key] = toBigIntFlexible(tx[key], 0n)
    }
  }
  return out
}

async function resolveReferencePriceFromPyth (sdk, feedId) {
  if (!feedId || typeof feedId !== 'string' || !feedId.startsWith('0x')) {
    return null
  }

  const pythUrl = `${sdk.API_ENDPOINTS.PYTH_HTTP}?ids[]=${encodeURIComponent(feedId)}`
  try {
    const payload = await fetchJson(pythUrl)
    const parsed = Array.isArray(payload && payload.parsed) ? payload.parsed[0] : null
    const priceRecord = parsed && parsed.price && typeof parsed.price === 'object' ? parsed.price : null
    const priceRaw = priceRecord && typeof priceRecord.price === 'string' ? Number(priceRecord.price) : NaN
    const expo = priceRecord && typeof priceRecord.expo === 'number' ? priceRecord.expo : NaN
    const resolved = Number.isFinite(priceRaw) && Number.isFinite(expo) ? priceRaw * 10 ** expo : NaN
    if (!Number.isFinite(resolved) || resolved <= 0) {
      return null
    }
    return resolved
  } catch {
    return null
  }
}

async function marketContext ({ chain, market }) {
  const { sdk, client, rpc } = await buildClient(chain)
  const pairState = await resolvePairState({ client, sdk, market })

  return {
    provider: 'avantis',
    chainSlug: rpc.chainSlug,
    chainId: rpc.chainId,
    market: pairState.market,
    pairIndex: pairState.pairIndex,
    maxLeverage: pairState.maxLeverage,
    minLeverage: pairState.minLeverage,
    minPositionSizeUsd: pairState.minPositionSizeUsd,
    minCollateralUsdAt1x: pairState.minCollateralUsdAt1x,
    minCollateralUsd: pairState.minCollateralUsd,
    fee: pairState.fee,
    feed: pairState.feed,
    openInterest: pairState.openInterest,
    listed: pairState.listed,
    metadata: {
      source: 'avantis-sdk+socket',
      minimumCheck: 'collateralUsd * leverage >= minPositionSizeUsd',
      dataVersion: pairState.dataVersion,
      asOf: new Date().toISOString(),
      rpcUrl: rpc.rpcUrl
    },
    warnings: []
  }
}

async function listPositions ({ chain, walletAddress }) {
  const { rpc } = await buildClient(chain)
  const userData = await fetchUserData(walletAddress)

  return {
    provider: 'avantis',
    chainSlug: rpc.chainSlug,
    chainId: rpc.chainId,
    walletAddress,
    positions: userData.positions,
    pendingOrders: userData.pendingOrders,
    sdkTrades: [],
    count: userData.positions.length,
    warnings: []
  }
}

async function listPendingOrders ({ chain, walletAddress }) {
  const { rpc } = await buildClient(chain)
  const userData = await fetchUserData(walletAddress)
  return {
    provider: 'avantis',
    chainSlug: rpc.chainSlug,
    chainId: rpc.chainId,
    walletAddress,
    pendingOrders: userData.pendingOrders,
    count: userData.pendingOrders.length,
    warnings: []
  }
}

async function quoteOpen ({ chain, market, side, collateralUsd, leverage }) {
  const pair = await marketContext({ chain, market })
  if (leverage < pair.minLeverage) {
    throw new Error(`Requested leverage ${leverage}x is below min leverage ${pair.minLeverage}x for ${pair.market}.`)
  }
  if (leverage > pair.maxLeverage) {
    throw new Error(`Requested leverage ${leverage}x exceeds max leverage ${pair.maxLeverage}x for ${pair.market}.`)
  }
  const notionalUsd = computeNotionalUsd(collateralUsd, leverage)
  const minPositionSizeUsd = Number(pair.minPositionSizeUsd || pair.minCollateralUsd || 0)
  if (notionalUsd < minPositionSizeUsd) {
    const minCollateralRequiredUsd = computeMinCollateralRequiredUsd(minPositionSizeUsd, leverage)
    throw new Error(
      `Position notional ${notionalUsd} is below minimum ${minPositionSizeUsd} for ${pair.market}. ` +
      `Provide collateral >= ${minCollateralRequiredUsd} at ${leverage}x.`
    )
  }

  const estOpenFeeUsd = Number(((notionalUsd * pair.fee.openFeePct) / 100).toFixed(6))

  return {
    provider: 'avantis',
    market: pair.market,
    side,
    collateralUsd,
    leverage,
    notionalUsd,
    maxLeverage: pair.maxLeverage,
    minPositionSizeUsd,
    minCollateralRequiredUsd: computeMinCollateralRequiredUsd(minPositionSizeUsd, leverage),
    minCollateralUsdAt1x: pair.minCollateralUsdAt1x,
    minCollateralUsd: pair.minCollateralUsd,
    estOpenFeeUsd,
    warnings: []
  }
}

async function quoteClose ({ chain, walletAddress, positionId, pairIndex, tradeIndex, sizePercent }) {
  const normalizedChain = normalizeChainSlug(chain)
  if (normalizedChain !== 'base-mainnet' && normalizedChain !== 'base') {
    throw new Error('Avantis currently supports base-mainnet only.')
  }

  const userData = await fetchUserData(walletAddress)
  const position = findPositionRecord(userData.positions, {
    positionId,
    pairIndex,
    tradeIndex
  })

  const pct = typeof sizePercent === 'number' ? sizePercent : 100
  if (pct <= 0 || pct > 100) {
    throw new Error('sizePercent must be between 0 and 100.')
  }

  const collateralRaw = toBigIntFlexible(position.collateralRaw, 0n)
  const amountToCloseRaw = collateralRaw > 0n ? (collateralRaw * BigInt(Math.round(pct * 100))) / 10_000n : 0n

  return {
    provider: 'avantis',
    position,
    chainSlug: normalizedChain,
    sizePercent: pct,
    closeNotionalUsd: Number(((Number(position.positionSizeUSDC || 0) * pct) / 100).toFixed(6)),
    closeAmountRaw: amountToCloseRaw.toString(),
    warnings: []
  }
}

async function buildOpen (input) {
  const chain = normalizeChainSlug(input.chain)
  if (chain !== 'base-mainnet' && chain !== 'base') {
    throw new Error('Avantis currently supports base-mainnet only.')
  }

  const walletAddress = String(input.walletAddress || '').trim()
  const market = normalizeMarketSymbol(input.market)
  const side = String(input.side || '').trim().toLowerCase()
  const collateralUsd = parsePositiveNumber(input.collateralUsd, 'collateralUsd')
  const leverage = parsePositiveNumber(input.leverage, 'leverage')
  const orderType = String(input.orderType || 'market').trim().toLowerCase()
  const maxSlippageP = input.maxSlippageP == null ? 1 : parsePositiveNumber(input.maxSlippageP, 'maxSlippageP')
  const takeProfit = input.takeProfit == null ? 0 : parseNonNegativeNumber(input.takeProfit, 'takeProfit')
  const stopLoss = input.stopLoss == null ? 0 : parseNonNegativeNumber(input.stopLoss, 'stopLoss')
  const limitPrice = input.limitPrice == null ? null : parsePositiveNumber(input.limitPrice, 'limitPrice')

  if (!walletAddress) {
    throw new Error('walletAddress is required.')
  }
  if (side !== 'long' && side !== 'short') {
    throw new Error('side must be long or short.')
  }

  const { sdk, client, rpc } = await buildClient(chain)
  const pairState = await resolvePairState({ client, sdk, market })

  if (leverage > pairState.maxLeverage) {
    throw new Error(`Requested leverage ${leverage}x exceeds max leverage ${pairState.maxLeverage}x for ${pairState.market}.`)
  }
  if (leverage < pairState.minLeverage) {
    throw new Error(`Requested leverage ${leverage}x is below min leverage ${pairState.minLeverage}x for ${pairState.market}.`)
  }
  const notionalUsd = computeNotionalUsd(collateralUsd, leverage)
  const minPositionSizeUsd = Number(pairState.minPositionSizeUsd || pairState.minCollateralUsd || 0)
  if (notionalUsd < minPositionSizeUsd) {
    const minCollateralRequiredUsd = computeMinCollateralRequiredUsd(minPositionSizeUsd, leverage)
    throw new Error(
      `Position notional ${notionalUsd} is below minimum ${minPositionSizeUsd} for ${pairState.market}. ` +
      `Provide collateral >= ${minCollateralRequiredUsd} at ${leverage}x.`
    )
  }

  let openPrice = limitPrice || 0
  if (orderType === 'market' || orderType === 'market_zero_fee') {
    if (!openPrice || openPrice <= 0) {
      const pythPrice = await resolveReferencePriceFromPyth(sdk, pairState.feed.feedId)
      if (pythPrice) {
        openPrice = pythPrice
      }
    }
    if (!openPrice || openPrice <= 0) {
      throw new Error('Unable to resolve open price for market order. Provide --limit-price explicitly.')
    }
  } else if ((orderType === 'limit' || orderType === 'stop_limit') && (!limitPrice || limitPrice <= 0)) {
    throw new Error('limitPrice is required for limit/stop_limit orders.')
  }

  const tradingContract = client.getContract('Trading')
  const orderTypeNumeric = mapOrderTypeToNumeric(orderType)

  const tradeTuple = [
    walletAddress,
    pairState.pairIndex,
    0,
    sdk.toBlockchain6(collateralUsd),
    sdk.toBlockchain6(collateralUsd),
    sdk.toBlockchain10(openPrice || 0),
    side === 'long',
    sdk.toBlockchain10(leverage),
    sdk.toBlockchain10(takeProfit),
    sdk.toBlockchain10(stopLoss),
    0
  ]

  const data = tradingContract.interface.encodeFunctionData('openTrade', [
    tradeTuple,
    orderTypeNumeric,
    sdk.toBlockchain10(maxSlippageP)
  ])

  const executionFeeWei = await resolveExecutionFeeWei(client)
  const txRequest = normalizeTxForOutput({
    to: await tradingContract.getAddress(),
    data,
    value: executionFeeWei
  })

  const intent = buildOpenIntent({
    chainSlug: rpc.chainSlug,
    walletAddress,
    market: pairState.market,
    side,
    collateralUsd,
    leverage,
    orderType,
    openPrice,
    takeProfit,
    stopLoss,
    maxSlippageP,
    pairIndex: pairState.pairIndex,
    maxLeverage: pairState.maxLeverage
  })

  return {
    provider: 'avantis',
    chainSlug: rpc.chainSlug,
    chainId: rpc.chainId,
    marketContext: pairState,
    txRequest,
    intent,
    intentHash: computeIntentHash(intent),
    warnings: []
  }
}

async function buildClose (input) {
  const chain = normalizeChainSlug(input.chain)
  if (chain !== 'base-mainnet' && chain !== 'base') {
    throw new Error('Avantis currently supports base-mainnet only.')
  }

  const walletAddress = String(input.walletAddress || '').trim()
  if (!walletAddress) {
    throw new Error('walletAddress is required.')
  }

  const sizePercent = input.sizePercent == null ? 100 : parsePositiveNumber(input.sizePercent, 'sizePercent')
  if (sizePercent > 100) {
    throw new Error('sizePercent must be <= 100.')
  }

  const { client, rpc } = await buildClient(chain)
  const userData = await fetchUserData(walletAddress)
  const position = findPositionRecord(userData.positions, {
    positionId: input.positionId,
    pairIndex: input.pairIndex,
    tradeIndex: input.tradeIndex
  })

  if (position.pairIndex === null || position.tradeIndex === null) {
    throw new Error('Position payload missing pairIndex/tradeIndex.')
  }

  const tradingStorageContract = client.getContract('TradingStorage')
  const onchainPosition = await tradingStorageContract.openTrades(
    walletAddress,
    position.pairIndex,
    position.tradeIndex
  )

  let positionSizeRaw = toBigIntFlexible(
    onchainPosition && (onchainPosition.positionSizeUSDC || onchainPosition.positionSizeUsdc || onchainPosition[4]),
    0n
  )
  if (positionSizeRaw <= 0n) {
    positionSizeRaw = toBigIntFlexible(position.positionSizeRaw, 0n)
  }
  if (positionSizeRaw <= 0n && Number(position.positionSizeUSDC || 0) > 0) {
    positionSizeRaw = sdk.toBlockchain6(Number(position.positionSizeUSDC))
  }
  if (positionSizeRaw <= 0n) {
    throw new Error('Position size is unavailable for close order.')
  }

  let closeAmountRaw = (positionSizeRaw * BigInt(Math.round(sizePercent * 100))) / 10_000n
  if (closeAmountRaw <= 0n) {
    closeAmountRaw = 1n
  }

  const tradingContract = client.getContract('Trading')
  const data = tradingContract.interface.encodeFunctionData('closeTradeMarket', [
    position.pairIndex,
    position.tradeIndex,
    closeAmountRaw
  ])

  const executionFeeWei = await resolveExecutionFeeWei(client)
  const txRequest = normalizeTxForOutput({
    to: await tradingContract.getAddress(),
    data,
    value: executionFeeWei
  })

  const intent = {
    intentVersion: 'perps.intent.v1',
    protocolSlug: 'avantis',
    chainSlug: rpc.chainSlug,
    action: 'close_order',
    wallet: {
      walletAddress
    },
    params: {
      positionId: position.positionId,
      pairIndex: position.pairIndex,
      tradeIndex: position.tradeIndex,
      sizePercent,
      positionSizeRaw: positionSizeRaw.toString(),
      closeAmountRaw: closeAmountRaw.toString()
    },
    policy: {
      category: 'perps',
      amountUsd: Number(position.positionSizeUSDC || 0)
    },
    createdAt: new Date().toISOString(),
    metadata: {
      sourceTool: 'perps_close_build',
      adapter: 'avantis'
    }
  }

  return {
    provider: 'avantis',
    chainSlug: rpc.chainSlug,
    chainId: rpc.chainId,
    position,
    txRequest,
    intent,
    intentHash: computeIntentHash(intent),
    warnings: []
  }
}

async function buildRiskOrders (input) {
  const chain = normalizeChainSlug(input.chain)
  if (chain !== 'base-mainnet' && chain !== 'base') {
    throw new Error('Avantis currently supports base-mainnet only.')
  }

  const walletAddress = String(input.walletAddress || '').trim()
  if (!walletAddress) {
    throw new Error('walletAddress is required.')
  }

  const { sdk, client, rpc } = await buildClient(chain)
  const userData = await fetchUserData(walletAddress)
  const position = findPositionRecord(userData.positions, {
    positionId: input.positionId,
    pairIndex: input.pairIndex,
    tradeIndex: input.tradeIndex
  })

  if (position.pairIndex === null || position.tradeIndex === null) {
    throw new Error('Position payload missing pairIndex/tradeIndex.')
  }

  const hasTakeProfitInput = input.takeProfit != null
  const hasStopLossInput = input.stopLoss != null
  if (!hasTakeProfitInput && !hasStopLossInput) {
    throw new Error('Provide takeProfit and/or stopLoss.')
  }

  const tradingStorageContract = client.getContract('TradingStorage')
  const onchainPosition = await tradingStorageContract.openTrades(
    walletAddress,
    position.pairIndex,
    position.tradeIndex
  )

  const onchainTakeProfit = Number(
    sdk.fromBlockchain10(toBigIntFlexible(onchainPosition && (onchainPosition.tp || onchainPosition[8]), 0n))
  )
  const onchainStopLoss = Number(
    sdk.fromBlockchain10(toBigIntFlexible(onchainPosition && (onchainPosition.sl || onchainPosition[9]), 0n))
  )
  const onchainOpenPrice = Number(
    sdk.fromBlockchain10(toBigIntFlexible(onchainPosition && (onchainPosition.openPrice || onchainPosition[5]), 0n))
  )

  const fallbackTakeProfit = Number.isFinite(onchainTakeProfit) ? onchainTakeProfit : Number(position.tp || 0)
  const fallbackStopLoss = Number.isFinite(onchainStopLoss) ? onchainStopLoss : Number(position.sl || 0)

  const takeProfit = hasTakeProfitInput
    ? parseNonNegativeNumber(input.takeProfit, 'takeProfit')
    : fallbackTakeProfit
  const stopLoss = hasStopLossInput
    ? parseNonNegativeNumber(input.stopLoss, 'stopLoss')
    : fallbackStopLoss

  const isLong =
    onchainPosition && typeof onchainPosition.buy === 'boolean'
      ? onchainPosition.buy
      : position.side === 'long'
        ? true
        : position.side === 'short'
          ? false
          : null

  if (Number.isFinite(onchainOpenPrice) && onchainOpenPrice > 0 && isLong !== null) {
    if (takeProfit > 0) {
      if (isLong && takeProfit <= onchainOpenPrice) {
        throw new Error(
          `Invalid takeProfit ${takeProfit}: for long positions it must be greater than openPrice ${onchainOpenPrice}.`
        )
      }
      if (!isLong && takeProfit >= onchainOpenPrice) {
        throw new Error(
          `Invalid takeProfit ${takeProfit}: for short positions it must be less than openPrice ${onchainOpenPrice}.`
        )
      }
    }
    if (stopLoss > 0) {
      if (isLong && stopLoss >= onchainOpenPrice) {
        throw new Error(
          `Invalid stopLoss ${stopLoss}: for long positions it must be less than openPrice ${onchainOpenPrice}.`
        )
      }
      if (!isLong && stopLoss <= onchainOpenPrice) {
        throw new Error(
          `Invalid stopLoss ${stopLoss}: for short positions it must be greater than openPrice ${onchainOpenPrice}.`
        )
      }
    }
  }

  const tradingContract = client.getContract('Trading')
  const data = tradingContract.interface.encodeFunctionData('updateTpAndSl', [
    position.pairIndex,
    position.tradeIndex,
    sdk.toBlockchain10(stopLoss),
    sdk.toBlockchain10(takeProfit),
    []
  ])

  const executionFeeWei = await resolveExecutionFeeWei(client)
  const txRequest = normalizeTxForOutput({
    to: await tradingContract.getAddress(),
    data,
    value: executionFeeWei
  })

  const intent = {
    intentVersion: 'perps.intent.v1',
    protocolSlug: 'avantis',
    chainSlug: rpc.chainSlug,
    action: 'set_risk_orders',
    wallet: {
      walletAddress
    },
    params: {
      positionId: position.positionId,
      pairIndex: position.pairIndex,
      tradeIndex: position.tradeIndex,
      takeProfit,
      stopLoss
    },
    policy: {
      category: 'perps',
      amountUsd: Number(position.positionSizeUSDC || 0)
    },
    createdAt: new Date().toISOString(),
    metadata: {
      sourceTool: 'perps_risk_orders_build',
      adapter: 'avantis'
    }
  }

  return {
    provider: 'avantis',
    chainSlug: rpc.chainSlug,
    chainId: rpc.chainId,
    position,
    txRequest,
    intent,
    intentHash: computeIntentHash(intent),
    warnings: []
  }
}

async function buildModifyPosition (input) {
  const chain = normalizeChainSlug(input.chain)
  if (chain !== 'base-mainnet' && chain !== 'base') {
    throw new Error('Avantis currently supports base-mainnet only.')
  }

  const walletAddress = String(input.walletAddress || '').trim()
  if (!walletAddress) {
    throw new Error('walletAddress is required.')
  }

  const marginDeltaUsd = parsePositiveNumber(input.marginDeltaUsd, 'marginDeltaUsd')
  const updateTypeRaw = String(input.updateType || 'deposit').trim().toLowerCase()
  const updateTypeNumeric = updateTypeRaw === 'withdraw' ? 1 : updateTypeRaw === 'deposit' ? 0 : null
  if (updateTypeNumeric === null) {
    throw new Error('updateType must be deposit or withdraw.')
  }

  const { sdk, client, rpc } = await buildClient(chain)
  const userData = await fetchUserData(walletAddress)
  const position = findPositionRecord(userData.positions, {
    positionId: input.positionId,
    pairIndex: input.pairIndex,
    tradeIndex: input.tradeIndex
  })

  if (position.pairIndex === null || position.tradeIndex === null) {
    throw new Error('Position payload missing pairIndex/tradeIndex.')
  }

  const tradingContract = client.getContract('Trading')
  const data = tradingContract.interface.encodeFunctionData('updateMargin', [
    position.pairIndex,
    position.tradeIndex,
    updateTypeNumeric,
    sdk.toBlockchain6(marginDeltaUsd),
    []
  ])

  const executionFeeWei = await resolveExecutionFeeWei(client)
  const txRequest = normalizeTxForOutput({
    to: await tradingContract.getAddress(),
    data,
    value: executionFeeWei
  })

  const intent = {
    intentVersion: 'perps.intent.v1',
    protocolSlug: 'avantis',
    chainSlug: rpc.chainSlug,
    action: 'modify_position',
    wallet: {
      walletAddress
    },
    params: {
      positionId: position.positionId,
      pairIndex: position.pairIndex,
      tradeIndex: position.tradeIndex,
      updateType: updateTypeRaw,
      marginDeltaUsd
    },
    policy: {
      category: 'perps',
      amountUsd: Number(position.positionSizeUSDC || 0)
    },
    createdAt: new Date().toISOString(),
    metadata: {
      sourceTool: 'perps_modify_position_build',
      adapter: 'avantis'
    }
  }

  return {
    provider: 'avantis',
    chainSlug: rpc.chainSlug,
    chainId: rpc.chainId,
    position,
    txRequest,
    intent,
    intentHash: computeIntentHash(intent),
    warnings: []
  }
}

async function buildCancelOrder (input) {
  const chain = normalizeChainSlug(input.chain)
  if (chain !== 'base-mainnet' && chain !== 'base') {
    throw new Error('Avantis currently supports base-mainnet only.')
  }

  const walletAddress = String(input.walletAddress || '').trim()
  if (!walletAddress) {
    throw new Error('walletAddress is required.')
  }

  const { client, rpc } = await buildClient(chain)
  const userData = await fetchUserData(walletAddress)
  const order = findPendingOrderRecord(userData.pendingOrders, {
    orderId: input.orderId,
    pairIndex: input.pairIndex,
    orderIndex: input.orderIndex
  })

  if (order.pairIndex === null || order.orderIndex === null) {
    throw new Error('Order payload missing pairIndex/orderIndex.')
  }

  const tradingContract = client.getContract('Trading')
  const data = tradingContract.interface.encodeFunctionData('cancelOpenLimitOrder', [
    order.pairIndex,
    order.orderIndex
  ])

  const txRequest = normalizeTxForOutput({
    to: await tradingContract.getAddress(),
    data,
    value: 0n
  })

  const intent = {
    intentVersion: 'perps.intent.v1',
    protocolSlug: 'avantis',
    chainSlug: rpc.chainSlug,
    action: 'cancel_order',
    wallet: {
      walletAddress
    },
    params: {
      orderId: order.orderId,
      pairIndex: order.pairIndex,
      orderIndex: order.orderIndex
    },
    policy: {
      category: 'perps',
      amountUsd: 0
    },
    createdAt: new Date().toISOString(),
    metadata: {
      sourceTool: 'perps_cancel_order_build',
      adapter: 'avantis'
    }
  }

  return {
    provider: 'avantis',
    chainSlug: rpc.chainSlug,
    chainId: rpc.chainId,
    order,
    txRequest,
    intent,
    intentHash: computeIntentHash(intent),
    warnings: []
  }
}

async function getReferralInfo ({ chain, walletAddress }) {
  const normalizedChain = normalizeChainSlug(chain)
  if (normalizedChain !== 'base-mainnet' && normalizedChain !== 'base') {
    throw new Error('Avantis currently supports base-mainnet only.')
  }

  const traderAddress = String(walletAddress || '').trim()
  if (!traderAddress) {
    throw new Error('walletAddress is required.')
  }

  const { sdk, client, rpc } = await buildClient(normalizedChain)
  const { contract, referralAddress, ethersLib } = getReferralContract({ sdk, client })
  const [codeBytes32, referrer] = await contract.getTraderReferralInfo(traderAddress)
  const code = decodeBytes32StringSafe(ethersLib, codeBytes32)

  return {
    provider: 'avantis',
    chainSlug: rpc.chainSlug,
    chainId: rpc.chainId,
    referralContract: referralAddress,
    walletAddress: traderAddress,
    referral: {
      code,
      codeBytes32: String(codeBytes32),
      referrer
    },
    clawdefiReferralRecipient: CLAWDEFI_REFERRAL_RECIPIENT,
    referralRecipientMatch: CLAWDEFI_REFERRAL_RECIPIENT
      ? String(referrer || '').toLowerCase() === CLAWDEFI_REFERRAL_RECIPIENT
      : null,
    hasReferralCode: Boolean(code),
    disclosure: buildReferralDisclosure(),
    warnings: []
  }
}

async function buildSetReferralCode ({ chain, walletAddress, referralCode }) {
  const normalizedChain = normalizeChainSlug(chain)
  if (normalizedChain !== 'base-mainnet' && normalizedChain !== 'base') {
    throw new Error('Avantis currently supports base-mainnet only.')
  }

  const traderAddress = String(walletAddress || '').trim()
  if (!traderAddress) {
    throw new Error('walletAddress is required.')
  }

  const code = parseReferralCode(referralCode)
  const { sdk, client, rpc } = await buildClient(normalizedChain)
  const { contract, referralAddress, ethersLib } = getReferralContract({ sdk, client })
  const codeBytes32 = ethersLib.encodeBytes32String(code)

  const [currentCodeBytes32, currentReferrer] = await contract.getTraderReferralInfo(traderAddress)
  const currentCode = decodeBytes32StringSafe(ethersLib, currentCodeBytes32)

  const txRequest = normalizeTxForOutput({
    to: referralAddress,
    data: contract.interface.encodeFunctionData('setTraderReferralCodeByUser', [codeBytes32]),
    value: 0n
  })

  const intent = {
    intentVersion: 'perps.intent.v1',
    protocolSlug: 'avantis',
    chainSlug: rpc.chainSlug,
    action: 'set_referral_code',
    wallet: {
      walletAddress: traderAddress
    },
    params: {
      referralCode: code,
      referralCodeBytes32: codeBytes32,
      previousCode: currentCode,
      previousReferrer: currentReferrer
    },
    policy: {
      category: 'perps',
      amountUsd: 0
    },
    createdAt: new Date().toISOString(),
    metadata: {
      sourceTool: 'perps_referral_bind_build',
      adapter: 'avantis'
    }
  }

  return {
    provider: 'avantis',
    chainSlug: rpc.chainSlug,
    chainId: rpc.chainId,
    referralContract: referralAddress,
    currentReferral: {
      code: currentCode,
      codeBytes32: String(currentCodeBytes32),
      referrer: currentReferrer
    },
    targetReferralCode: code,
    clawdefiReferralRecipient: CLAWDEFI_REFERRAL_RECIPIENT,
    txRequest,
    intent,
    intentHash: computeIntentHash(intent),
    disclosure: buildReferralDisclosure(),
    warnings: []
  }
}

module.exports = {
  slug: 'avantis',
  marketContext,
  listPositions,
  listPendingOrders,
  quoteOpen,
  quoteClose,
  buildOpen,
  buildClose,
  buildRiskOrders,
  buildModifyPosition,
  buildCancelOrder,
  getReferralInfo,
  buildSetReferralCode
}
