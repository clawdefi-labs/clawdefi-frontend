'use strict'

const {
  PENDLE_CHAIN_ID_BY_SLUG,
  PENDLE_CHAIN_SLUG_BY_ID,
  computeIntentHash,
  normalizeChainForYield,
  stringifyBigInts
} = require('./yield-common.js')

const APPROVAL_MODE_SET = new Set(['exact', 'unlimited', 'skip'])

function parseBooleanFlag (value, fieldName, fallback = false) {
  if (value === undefined || value === null || value === '') {
    return fallback
  }
  if (typeof value === 'boolean') return value
  const raw = String(value).trim().toLowerCase()
  if (raw === 'true' || raw === '1' || raw === 'yes' || raw === 'on') return true
  if (raw === 'false' || raw === '0' || raw === 'no' || raw === 'off') return false
  throw new Error(`--${fieldName} must be true/false.`)
}

function parseOptionalInteger (value, fieldName, { min = null, max = null } = {}) {
  if (value === undefined || value === null || value === '') {
    return null
  }
  const parsed = Number.parseInt(String(value), 10)
  if (!Number.isInteger(parsed)) {
    throw new Error(`--${fieldName} must be an integer.`)
  }
  if (min !== null && parsed < min) {
    throw new Error(`--${fieldName} must be >= ${min}.`)
  }
  if (max !== null && parsed > max) {
    throw new Error(`--${fieldName} must be <= ${max}.`)
  }
  return parsed
}

function parseOptionalNumber (value, fieldName, { min = null, max = null } = {}) {
  if (value === undefined || value === null || value === '') {
    return null
  }
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    throw new Error(`--${fieldName} must be numeric.`)
  }
  if (min !== null && parsed < min) {
    throw new Error(`--${fieldName} must be >= ${min}.`)
  }
  if (max !== null && parsed > max) {
    throw new Error(`--${fieldName} must be <= ${max}.`)
  }
  return parsed
}

function parseAddress (value, fieldName) {
  const raw = String(value || '').trim()
  if (!raw) {
    throw new Error(`Missing required --${fieldName}.`)
  }
  const normalized = raw.includes('-') ? raw.split('-', 2)[1] : raw
  if (!/^0x[a-fA-F0-9]{40}$/.test(normalized)) {
    throw new Error(`--${fieldName} must be a valid EVM address.`)
  }
  return normalized
}

function parseAddressList (args, pluralField, singleField) {
  const plural = String(args[pluralField] || '').trim()
  const single = String(args[singleField] || '').trim()

  const tokens = []
  if (plural) {
    for (const part of plural.split(',')) {
      const trimmed = part.trim()
      if (!trimmed) continue
      tokens.push(parseAddress(trimmed, pluralField))
    }
  }
  if (single) {
    tokens.push(parseAddress(single, singleField))
  }

  if (!tokens.length) {
    throw new Error(`Provide --${pluralField} (comma-separated) or --${singleField}.`)
  }

  return tokens
}

function parseAmountString (value, fieldName) {
  const parsed = String(value || '').trim()
  if (!parsed) {
    throw new Error(`Missing required --${fieldName}.`)
  }
  if (!/^\d+$/.test(parsed)) {
    throw new Error(`--${fieldName} must be an integer string in base units.`)
  }
  if (parsed === '0') {
    throw new Error(`--${fieldName} must be > 0.`)
  }
  return parsed
}

function parseAmountList (args) {
  const plural = String(args['amounts-in'] || '').trim()
  const single = String(args['amount-in'] || '').trim()

  const amounts = []
  if (plural) {
    for (const part of plural.split(',')) {
      const trimmed = part.trim()
      if (!trimmed) continue
      amounts.push(parseAmountString(trimmed, 'amounts-in'))
    }
  }
  if (single) {
    amounts.push(parseAmountString(single, 'amount-in'))
  }

  if (!amounts.length) {
    throw new Error('Provide --amounts-in (comma-separated) or --amount-in.')
  }

  return amounts
}

function parseAggregators (value) {
  const raw = String(value || '').trim()
  if (!raw) return []
  return raw
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
}

function resolveChainInput (args, selectionChain) {
  const explicitChainId = parseOptionalInteger(args['chain-id'] || args.chainId, 'chain-id', { min: 1 })
  const explicitChain = normalizeChainForYield(args.chain || '')

  if (explicitChainId !== null) {
    const chainSlug = PENDLE_CHAIN_SLUG_BY_ID[String(explicitChainId)] || explicitChain || `chain-${explicitChainId}`
    return {
      chainId: explicitChainId,
      chainSlug,
      warnings: []
    }
  }

  const candidate = explicitChain || normalizeChainForYield(selectionChain || '') || 'ethereum-mainnet'
  const chainId = PENDLE_CHAIN_ID_BY_SLUG[candidate]
  if (!chainId) {
    if (explicitChain) {
      throw new Error(`Pendle yield currently does not support chain=${explicitChain}.`)
    }
    return {
      chainId: PENDLE_CHAIN_ID_BY_SLUG['ethereum-mainnet'],
      chainSlug: 'ethereum-mainnet',
      warnings: [`unsupported_default_chain_fallback:${candidate}->ethereum-mainnet`]
    }
  }

  return {
    chainId,
    chainSlug: candidate,
    warnings: []
  }
}

function parseSlippageDecimal (args) {
  const slippageBps = parseOptionalInteger(args['slippage-bps'], 'slippage-bps', { min: 1, max: 5000 })
  if (slippageBps !== null) {
    return Number((slippageBps / 10000).toFixed(8))
  }

  const slippage = parseOptionalNumber(args.slippage, 'slippage', { min: 0.000001, max: 1 })
  if (slippage !== null) {
    return Number(slippage.toFixed(8))
  }

  return 0.005
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

function parseQuoteInput (args, selectionChain) {
  const chainResolution = resolveChainInput(args, selectionChain)
  const tokensIn = parseAddressList(args, 'tokens-in', 'token-in')
  const amountsIn = parseAmountList(args)
  const tokensOut = parseAddressList(args, 'tokens-out', 'token-out')

  if (tokensIn.length !== amountsIn.length) {
    throw new Error('tokens-in and amounts-in must have the same number of entries.')
  }

  const routeIndex = parseOptionalInteger(args['route-index'], 'route-index', { min: 0 }) || 0

  const receiverRaw = String(args.receiver || '').trim()
  const receiver = receiverRaw ? parseAddress(receiverRaw, 'receiver') : null

  const walletAddressRaw = String(args.address || '').trim()
  const walletAddress = walletAddressRaw ? parseAddress(walletAddressRaw, 'address') : null

  return {
    chainId: chainResolution.chainId,
    chainSlug: chainResolution.chainSlug,
    tokensIn,
    amountsIn,
    tokensOut,
    receiver,
    walletAddress,
    slippage: parseSlippageDecimal(args),
    enableAggregator: parseBooleanFlag(args['enable-aggregator'], 'enable-aggregator', true),
    aggregators: parseAggregators(args.aggregators),
    additionalData: String(args['additional-data'] || '').trim() || null,
    routeIndex,
    warnings: chainResolution.warnings
  }
}

function buildYieldIntent ({
  walletAddress,
  quote,
  plan,
  input
}) {
  const now = new Date().toISOString()

  const intent = {
    intentVersion: 'yield.intent.v1',
    adapter: 'pendle',
    chain: {
      chainId: quote.chainId,
      chainSlug: quote.chain
    },
    wallet: {
      walletAddress,
      receiver: input.receiver
    },
    action: {
      type: 'yield_convert',
      tokensIn: input.tokensIn,
      amountsIn: input.amountsIn,
      tokensOut: input.tokensOut,
      routeIndex: input.routeIndex,
      slippage: input.slippage
    },
    approval: {
      mode: plan.approvalMode,
      requiredCount: plan.approvalChecks.filter((entry) => entry.approvalRequired).length
    },
    policy: {
      category: 'yield',
      simulateBeforeExecute: true
    },
    metadata: {
      provider: quote.provider,
      sourceTool: 'yield_build'
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
  buildYieldIntent,
  normalizeBuildOutput,
  parseApprovalMode,
  parseBooleanFlag,
  parseQuoteInput
}
