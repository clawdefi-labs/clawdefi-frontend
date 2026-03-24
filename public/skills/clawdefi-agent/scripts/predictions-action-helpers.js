'use strict'

const {
  normalizeAddress,
  normalizeChainForPredictions,
  parseBooleanFlag,
  parseOptionalInteger,
  parseOptionalNumber,
  parseOptionalString,
  parseStrictString
} = require('./predictions-common.js')

const ORDER_KIND = {
  LIMIT: 'limit',
  MARKET: 'market'
}

const ORDER_TYPE_SET = new Set(['GTC', 'FOK', 'GTD', 'FAK'])
const SIGNATURE_TYPE_SET = new Set(['eoa', 'poly-proxy', 'poly-gnosis-safe'])
const APPROVAL_MODE_SET = new Set(['exact', 'unlimited', 'skip'])

function parseMode (value, fallback) {
  const mode = String(value || fallback).trim().toLowerCase()
  if (!mode) {
    throw new Error('Missing mode.')
  }
  return mode
}

function parseMarketSelector (args) {
  const marketId = parseOptionalString(args['market-id'] || args.marketId || args.id)
  const slug = parseOptionalString(args.slug)
  const conditionId = parseOptionalString(args['condition-id'] || args.conditionId)
  const tokenId = parseOptionalString(args['token-id'] || args.tokenId)
  const outcome = parseOptionalString(args.outcome)

  return {
    marketId,
    slug,
    conditionId,
    tokenId,
    outcome
  }
}

function parseDiscoveryArgs (args) {
  const mode = parseMode(args.mode, args.query ? 'search' : 'list')
  if (!['list', 'search', 'get'].includes(mode)) {
    throw new Error('--mode must be list, search, or get.')
  }

  const limit = parseOptionalInteger(args.limit, 'limit', { min: 1, max: 500 }) || 25
  const offset = parseOptionalInteger(args.offset, 'offset', { min: 0 }) || 0
  const active = args.active === undefined ? null : parseBooleanFlag(args.active, 'active')
  const closed = args.closed === undefined ? null : parseBooleanFlag(args.closed, 'closed')
  const archived = args.archived === undefined ? null : parseBooleanFlag(args.archived, 'archived')
  const query = parseOptionalString(args.query || args.search || args.q)

  const selector = parseMarketSelector(args)

  if (mode === 'get' && !selector.marketId && !selector.slug && !selector.conditionId && !selector.tokenId) {
    throw new Error('For --mode get, provide one selector: --market-id, --slug, --condition-id, or --token-id.')
  }

  return {
    mode,
    limit,
    offset,
    active,
    closed,
    archived,
    query,
    ...selector
  }
}

function parseSide (value) {
  const side = parseMode(value, '')
  if (side !== 'buy' && side !== 'sell') {
    throw new Error('--side must be buy or sell.')
  }
  return side
}

function parseOrderKind (value, fallback = ORDER_KIND.LIMIT) {
  const orderKind = parseMode(value, fallback)
  if (!Object.values(ORDER_KIND).includes(orderKind)) {
    throw new Error('--order-kind must be limit or market.')
  }
  return orderKind
}

function parseOrderType (value, orderKind) {
  const fallback = orderKind === ORDER_KIND.MARKET ? 'FOK' : 'GTC'
  const orderType = String(value || fallback).trim().toUpperCase()
  if (!ORDER_TYPE_SET.has(orderType)) {
    throw new Error('--order-type must be one of: GTC, FOK, GTD, FAK.')
  }

  if (orderKind === ORDER_KIND.LIMIT && (orderType === 'FOK' || orderType === 'FAK')) {
    throw new Error('Limit orders use GTC or GTD. Use --order-type GTC or GTD.')
  }
  if (orderKind === ORDER_KIND.MARKET && (orderType === 'GTC' || orderType === 'GTD')) {
    throw new Error('Market orders use FOK or FAK. Use --order-type FOK or FAK.')
  }

  return orderType
}

function parseSignatureType (value) {
  const signatureType = parseMode(value, process.env.POLYMARKET_SIGNATURE_TYPE || 'eoa')
  if (!SIGNATURE_TYPE_SET.has(signatureType)) {
    throw new Error('--signature-type must be eoa, poly-proxy, or poly-gnosis-safe.')
  }
  return signatureType
}

function parseApprovalMode (value) {
  const approvalMode = parseMode(value, 'exact')
  if (!APPROVAL_MODE_SET.has(approvalMode)) {
    throw new Error('--approval-mode must be exact, unlimited, or skip.')
  }
  return approvalMode
}

function parseTradeArgs (args, { requireOrderParams = true } = {}) {
  const selector = parseMarketSelector(args)

  if (!selector.tokenId && !selector.marketId && !selector.slug && !selector.conditionId) {
    throw new Error('Provide one selector: --token-id, --market-id, --slug, or --condition-id.')
  }

  const side = args.side ? parseSide(args.side) : null
  const orderKind = parseOrderKind(args['order-kind'] || args.orderKind || (args.amount ? ORDER_KIND.MARKET : ORDER_KIND.LIMIT))
  const orderType = parseOrderType(args['order-type'] || args.orderType, orderKind)
  const chain = normalizeChainForPredictions(args.chain || 'polygon-pos')

  const price = parseOptionalNumber(args.price, 'price', { minExclusive: 0 })
  const size = parseOptionalNumber(args.size, 'size', { minExclusive: 0 })
  const amount = parseOptionalNumber(args.amount, 'amount', { minExclusive: 0 })

  const postOnly = parseBooleanFlag(args['post-only'] || args.postOnly, 'post-only', false)
  const nonce = parseOptionalInteger(args.nonce, 'nonce', { min: 0 })
  const expiration = parseOptionalInteger(args.expiration, 'expiration', { min: 0 })
  const feeRateBps = parseOptionalInteger(args['fee-rate-bps'] || args.feeRateBps, 'fee-rate-bps', { min: 0, max: 10000 })

  const signatureType = parseSignatureType(args['signature-type'] || args.signatureType)
  const funderAddress = normalizeAddress(args['funder-address'] || args.funderAddress, 'funder-address')

  const approvalMode = parseApprovalMode(args['approval-mode'] || args.approvalMode)
  const allowUnlimited = parseBooleanFlag(args['allow-unlimited'] || args.allowUnlimited, 'allow-unlimited', false)
  const persistApiCreds = parseBooleanFlag(
    args['persist-api-creds'] || args.persistApiCreds,
    'persist-api-creds',
    true
  )
  const confirmExecute = parseBooleanFlag(args['confirm-execute'] || args.confirmExecute, 'confirm-execute', false)

  const apiKey = parseOptionalString(args['api-key'] || args.apiKey)
  const apiSecret = parseOptionalString(args['api-secret'] || args.apiSecret)
  const apiPassphrase = parseOptionalString(args['api-passphrase'] || args.apiPassphrase)

  if (requireOrderParams) {
    if (!side) {
      throw new Error('Missing required --side (buy or sell).')
    }
    if (orderKind === ORDER_KIND.LIMIT) {
      if (price === null) throw new Error('Limit order requires --price.')
      if (size === null) throw new Error('Limit order requires --size.')
      if (orderType === 'GTD' && (expiration === null || expiration <= 0)) {
        throw new Error('GTD order requires --expiration (unix timestamp).')
      }
    }
    if (orderKind === ORDER_KIND.MARKET && amount === null) {
      throw new Error('Market order requires --amount.')
    }
  }

  if (approvalMode === 'unlimited' && !allowUnlimited) {
    throw new Error('--approval-mode unlimited requires explicit --allow-unlimited true.')
  }

  if (signatureType !== 'eoa' && !funderAddress) {
    throw new Error(`--signature-type ${signatureType} requires --funder-address.`)
  }

  if ((apiKey || apiSecret || apiPassphrase) && !(apiKey && apiSecret && apiPassphrase)) {
    throw new Error('When overriding API credentials, provide all: --api-key, --api-secret, --api-passphrase.')
  }

  return {
    chain,
    side,
    orderKind,
    orderType,
    price,
    size,
    amount,
    postOnly,
    nonce,
    expiration,
    feeRateBps,
    signatureType,
    funderAddress,
    approvalMode,
    allowUnlimited,
    persistApiCreds,
    confirmExecute,
    apiCreds: apiKey && apiSecret && apiPassphrase
      ? {
          key: apiKey,
          secret: apiSecret,
          passphrase: apiPassphrase
        }
      : null,
    ...selector
  }
}

function normalizeBuildOutput (buildResult) {
  return {
    ...buildResult,
    signedOrder: buildResult.signedOrder || null,
    approvalPlan: buildResult.approvalPlan || null,
    market: buildResult.market || null,
    selection: buildResult.selection || null,
    quote: buildResult.quote || null
  }
}

module.exports = {
  parseDiscoveryArgs,
  parseMarketSelector,
  parseTradeArgs,
  normalizeBuildOutput
}
