'use strict'

const {
  DEFAULT_REFERRAL_WALLET,
  computeIntentHash,
  normalizeChainForOptions,
  normalizeEvmAddress,
  parseBooleanFlag,
  parseOptionalInteger,
  parseOptionalString,
  parseStrictString,
  stringifyBigInts
} = require('./options-common.js')

const OPTION_TYPE_SET = new Set(['call', 'put'])
const UNDERLYING_SET = new Set(['ETH', 'BTC'])
const APPROVAL_MODE_SET = new Set(['exact', 'unlimited', 'skip'])
const ORDER_SORT_BY = new Set(['price', 'expiry', 'available'])
const ORDER_SORT_ORDER = new Set(['asc', 'desc'])
const POSITION_STATUS_SET = new Set(['all', 'open', 'closed', 'settled'])

function parseUnderlying (value, { required = false } = {}) {
  const raw = String(value || '').trim().toUpperCase()
  if (!raw) {
    if (required) {
      throw new Error('Missing required --underlying (ETH or BTC).')
    }
    return null
  }
  if (!UNDERLYING_SET.has(raw)) {
    throw new Error('--underlying must be ETH or BTC.')
  }
  return raw
}

function parseOptionType (value, { required = false } = {}) {
  const raw = String(value || '').trim().toLowerCase()
  if (!raw) {
    if (required) {
      throw new Error('Missing required --option-type (call or put).')
    }
    return null
  }
  if (!OPTION_TYPE_SET.has(raw)) {
    throw new Error('--option-type must be call or put.')
  }
  return raw
}

function parseCollateral (value) {
  const raw = String(value || '').trim()
  if (!raw) return null
  if (/^0x[a-fA-F0-9]{40}$/.test(raw)) {
    return raw
  }
  return raw.toUpperCase()
}

function parseOptionalBigIntString (value, fieldName) {
  if (value === undefined || value === null || value === '') {
    return null
  }
  const raw = String(value).trim()
  if (!/^\d+$/.test(raw)) {
    throw new Error(`--${fieldName} must be an integer string in base units.`)
  }
  return raw
}

function parseUsdcAmountToBaseUnits (value) {
  const raw = String(value || '').trim()
  if (!raw) {
    throw new Error('--amount-usdc cannot be empty.')
  }
  if (!/^\d+(\.\d{1,6})?$/.test(raw)) {
    throw new Error('--amount-usdc must be a decimal number with up to 6 decimals.')
  }
  const [whole, frac = ''] = raw.split('.')
  const normalized = `${whole}${frac.padEnd(6, '0')}`.replace(/^0+(?=\d)/, '') || '0'
  if (normalized === '0') {
    throw new Error('--amount-usdc must be > 0.')
  }
  return normalized
}

function parseOrderSortBy (value) {
  const raw = String(value || 'price').trim().toLowerCase()
  if (!ORDER_SORT_BY.has(raw)) {
    throw new Error('--sort-by must be price, expiry, or available.')
  }
  return raw
}

function parseOrderSortOrder (value) {
  const raw = String(value || 'asc').trim().toLowerCase()
  if (!ORDER_SORT_ORDER.has(raw)) {
    throw new Error('--sort-order must be asc or desc.')
  }
  return raw
}

function parseOrderSelection (args) {
  const orderKey = parseOptionalString(args['order-key'] || args.orderKey)
  const orderIndex = parseOptionalInteger(args['order-index'] || args.orderIndex, 'order-index', { min: 0 })
  if (orderKey && orderIndex !== null) {
    throw new Error('Use one selector only: --order-key or --order-index.')
  }
  return {
    orderKey,
    orderIndex
  }
}

function parseOrderbookArgs (args) {
  return {
    chain: normalizeChainForOptions(args.chain || 'base-mainnet'),
    underlying: parseUnderlying(args.underlying),
    optionType: parseOptionType(args['option-type'] || args.optionType),
    collateral: parseCollateral(args.collateral),
    maker: normalizeEvmAddress(args.maker, 'maker'),
    minAvailable: parseOptionalBigIntString(args['min-available'] || args.minAvailable, 'min-available'),
    includeExpired: parseBooleanFlag(args['include-expired'] || args.includeExpired, 'include-expired', false),
    sortBy: parseOrderSortBy(args['sort-by'] || args.sortBy),
    sortOrder: parseOrderSortOrder(args['sort-order'] || args.sortOrder),
    offset: parseOptionalInteger(args.offset, 'offset', { min: 0 }) || 0,
    limit: parseOptionalInteger(args.limit, 'limit', { min: 1, max: 500 }) || 25,
    ...parseOrderSelection(args)
  }
}

function parseMarketDataArgs (args) {
  return {
    chain: normalizeChainForOptions(args.chain || 'base-mainnet'),
    underlying: parseUnderlying(args.underlying),
    optionType: parseOptionType(args['option-type'] || args.optionType),
    includePricing: parseBooleanFlag(args['include-pricing'] || args.includePricing, 'include-pricing', true),
    includeExpired: parseBooleanFlag(args['include-expired'] || args.includeExpired, 'include-expired', false),
    includeStats: parseBooleanFlag(args['include-stats'] || args.includeStats, 'include-stats', false),
    limit: parseOptionalInteger(args.limit, 'limit', { min: 1, max: 500 }) || 40
  }
}

function parseQuoteArgs (args) {
  const base = parseOrderbookArgs(args)
  const amountBase = parseOptionalBigIntString(args.amount || args['amount-base'] || args.amountBase, 'amount')
  const amountUsdcRaw = parseOptionalString(args['amount-usdc'] || args.amountUsdc)
  if (amountBase && amountUsdcRaw) {
    throw new Error('Use one amount input only: --amount (base units) or --amount-usdc.')
  }

  const amount = amountBase || (amountUsdcRaw ? parseUsdcAmountToBaseUnits(amountUsdcRaw) : null)
  if (amount !== null && BigInt(amount) <= 0n) {
    throw new Error('--amount must be > 0.')
  }

  const referrer = normalizeEvmAddress(
    args.referrer || process.env.CLAWDEFI_OPTIONS_REFERRER || DEFAULT_REFERRAL_WALLET,
    'referrer'
  )

  return {
    ...base,
    amount,
    referrer: referrer || DEFAULT_REFERRAL_WALLET
  }
}

function parseApprovalMode (args) {
  const mode = String(args['approval-mode'] || 'exact').trim().toLowerCase()
  if (!APPROVAL_MODE_SET.has(mode)) {
    throw new Error('--approval-mode must be exact, unlimited, or skip.')
  }
  if (mode === 'unlimited' && !parseBooleanFlag(args['allow-unlimited'], 'allow-unlimited', false)) {
    throw new Error('--approval-mode unlimited requires explicit --allow-unlimited true.')
  }
  return mode
}

function parseBuildArgs (args) {
  const quoteInput = parseQuoteArgs(args)
  const approvalMode = parseApprovalMode(args)
  return {
    ...quoteInput,
    approvalMode
  }
}

function parsePositionsArgs (args) {
  const status = String(args.status || 'open').trim().toLowerCase()
  if (!POSITION_STATUS_SET.has(status)) {
    throw new Error('--status must be all, open, closed, or settled.')
  }

  return {
    chain: normalizeChainForOptions(args.chain || 'base-mainnet'),
    address: normalizeEvmAddress(args.address, 'address'),
    status,
    offset: parseOptionalInteger(args.offset, 'offset', { min: 0 }) || 0,
    limit: parseOptionalInteger(args.limit, 'limit', { min: 1, max: 500 }) || 50
  }
}

function buildOptionsIntent ({
  walletAddress,
  order,
  quote,
  plan,
  input
}) {
  const now = new Date().toISOString()

  const intent = {
    intentVersion: 'options.intent.v1',
    adapter: 'thetanuts',
    chain: {
      chainId: 8453,
      chainSlug: input.chain
    },
    wallet: {
      walletAddress
    },
    action: {
      type: 'options_fill_order',
      orderKey: order.orderKey,
      orderNonce: order.nonce,
      optionType: order.optionType,
      underlying: order.underlying,
      amountBaseUnits: input.amount,
      referrer: quote.referrer
    },
    approval: {
      mode: plan.approvalMode,
      approvalRequired: plan.approvalCheck.approvalRequired
    },
    policy: {
      category: 'options',
      simulateBeforeExecute: true
    },
    metadata: {
      provider: quote.provider,
      sourceTool: 'options_build'
    },
    createdAt: now
  }

  return {
    intent,
    intentHash: computeIntentHash(intent)
  }
}

function normalizeBuildOutput (value) {
  return stringifyBigInts(value)
}

module.exports = {
  buildOptionsIntent,
  normalizeBuildOutput,
  parseApprovalMode,
  parseBuildArgs,
  parseMarketDataArgs,
  parseOrderbookArgs,
  parsePositionsArgs,
  parseQuoteArgs,
  parseStrictString
}
