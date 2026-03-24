'use strict'

const {
  PENDLE_CHAIN_ID_BY_SLUG,
  PENDLE_CHAIN_SLUG_BY_ID,
  loadAdapter,
  normalizeChainForYield,
  parseArgs,
  printFailure,
  printSuccess,
  readSelection,
  resolveWalletAddress
} = require('./yield-common.js')

function parseBooleanFlag (value, fieldName, fallback = false) {
  if (value === undefined || value === null || value === '') {
    return fallback
  }
  const raw = String(value).trim().toLowerCase()
  if (raw === 'true' || raw === '1' || raw === 'yes' || raw === 'on') return true
  if (raw === 'false' || raw === '0' || raw === 'no' || raw === 'off') return false
  throw new Error(`--${fieldName} must be true/false.`)
}

function parseOptionalInteger (value, fieldName, { min = null, max = null } = {}) {
  if (value === undefined || value === null || value === '') return null
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

function parseOptionalNumber (value, fieldName, { min = null } = {}) {
  if (value === undefined || value === null || value === '') return null
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    throw new Error(`--${fieldName} must be numeric.`)
  }
  if (min !== null && parsed < min) {
    throw new Error(`--${fieldName} must be >= ${min}.`)
  }
  return parsed
}

function parseCategories (args) {
  const raw = args.categories || args.category || args['category-ids'] || ''
  if (!raw) return []
  return String(raw)
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
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

function parseSortBy (value) {
  const normalized = String(value || 'liquidity').trim().toLowerCase().replace(/_/g, '-')
  if (!normalized) return 'liquidity'
  return normalized
}

function parseSortOrder (value) {
  const normalized = String(value || 'desc').trim().toLowerCase()
  if (normalized !== 'asc' && normalized !== 'desc') {
    throw new Error('--sort-order must be asc or desc.')
  }
  return normalized
}

;(async () => {
  const args = parseArgs(process.argv.slice(2))
  const { adapter, impl } = loadAdapter(args.adapter)

  const selection = await readSelection()
  const includeAccount = parseBooleanFlag(args['include-account'], 'include-account', false)
  const categories = parseCategories(args)

  const chainResolution = resolveChainInput(args, selection.chain)
  const limit = parseOptionalInteger(args.limit, 'limit', { min: 1, max: 200 }) || 20
  const offset = parseOptionalInteger(args.offset, 'offset', { min: 0 }) || 0

  const input = {
    chainId: chainResolution.chainId,
    chainSlug: chainResolution.chainSlug,
    categories,
    query: String(args.query || args.q || '').trim() || null,
    minLiquidityUsd: parseOptionalNumber(args['min-liquidity-usd'], 'min-liquidity-usd', { min: 0 }),
    minPendleApy: parseOptionalNumber(args['min-pendle-apy'], 'min-pendle-apy', { min: 0 }),
    minImpliedApy: parseOptionalNumber(args['min-implied-apy'], 'min-implied-apy', { min: 0 }),
    minAggregatedApy: parseOptionalNumber(args['min-aggregated-apy'], 'min-aggregated-apy', { min: 0 }),
    primeOnly: parseBooleanFlag(args['prime-only'], 'prime-only', false),
    newOnly: parseBooleanFlag(args['new-only'], 'new-only', false),
    sortBy: parseSortBy(args['sort-by']),
    sortOrder: parseSortOrder(args['sort-order']),
    limit,
    offset,
    walletAddress: null
  }

  const params = {
    adapter,
    chain: input.chainSlug,
    chainId: input.chainId,
    categories: input.categories,
    query: input.query,
    minLiquidityUsd: input.minLiquidityUsd,
    minPendleApy: input.minPendleApy,
    minImpliedApy: input.minImpliedApy,
    minAggregatedApy: input.minAggregatedApy,
    primeOnly: input.primeOnly,
    newOnly: input.newOnly,
    sortBy: input.sortBy,
    sortOrder: input.sortOrder,
    limit: input.limit,
    offset: input.offset,
    includeAccount
  }

  try {
    if (args.address || includeAccount) {
      input.walletAddress = await resolveWalletAddress(args)
      params.address = input.walletAddress
    }

    const data = await impl.listOpportunities(input)
    const warnings = [
      ...chainResolution.warnings,
      ...(data.warnings || [])
    ]

    printSuccess({
      module: 'yield_opportunities',
      adapter,
      params,
      data,
      warnings
    })
  } catch (error) {
    printFailure('yield_opportunities', adapter, params, error)
  }
})()

