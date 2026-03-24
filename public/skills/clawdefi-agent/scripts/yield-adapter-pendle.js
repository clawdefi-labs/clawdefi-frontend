'use strict'

const DEFAULT_API_BASE_URL = String(process.env.PENDLE_CORE_API_BASE_URL || 'https://api-v2.pendle.finance/api/core')
  .trim()
  .replace(/\/+$/, '')

const SUPPORTED_SORT_BY = new Set([
  'liquidity',
  'aggregated-apy',
  'implied-apy',
  'pendle-apy',
  'expiry',
  'name'
])

const ERC20_ABI = [
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)'
]

function normalizeAddressRef (value) {
  const raw = String(value || '').trim()
  if (!raw) return null
  const normalized = raw.includes('-') ? raw.split('-', 2)[1] : raw
  return normalized.toLowerCase()
}

function normalizeAmountRef (value) {
  const raw = String(value || '').trim()
  if (!raw) return '0'
  if (!/^\d+$/.test(raw)) {
    throw new Error(`Invalid amount format: ${raw}`)
  }
  return raw
}

function normalizeMarket (market, { chainId, chainSlug }) {
  const details = market && typeof market.details === 'object' && market.details
    ? market.details
    : {}

  return {
    chainId,
    chain: chainSlug,
    name: String(market.name || ''),
    marketAddress: normalizeAddressRef(market.address),
    expiry: market.expiry || null,
    isNew: Boolean(market.isNew),
    isPrime: Boolean(market.isPrime),
    categoryIds: Array.isArray(market.categoryIds) ? market.categoryIds.map((entry) => String(entry).toLowerCase()) : [],
    tokens: {
      pt: normalizeAddressRef(market.pt),
      yt: normalizeAddressRef(market.yt),
      sy: normalizeAddressRef(market.sy),
      underlyingAsset: normalizeAddressRef(market.underlyingAsset)
    },
    metrics: {
      liquidityUsd: Number(details.liquidity || 0),
      pendleApy: Number(details.pendleApy || 0),
      impliedApy: Number(details.impliedApy || 0),
      aggregatedApy: Number(details.aggregatedApy || 0),
      maxBoostedApy: Number(details.maxBoostedApy || 0),
      feeRate: Number(details.feeRate || 0),
      yieldRange: details.yieldRange || null
    }
  }
}

function matchesQuery (item, query) {
  if (!query) return true
  const q = String(query).trim().toLowerCase()
  if (!q) return true
  const haystack = [
    item.name,
    item.marketAddress,
    item.tokens.pt,
    item.tokens.yt,
    item.tokens.sy,
    item.tokens.underlyingAsset,
    ...(item.categoryIds || [])
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
  return haystack.includes(q)
}

function compareValues (a, b, { sortBy, order }) {
  const direction = order === 'asc' ? 1 : -1

  if (sortBy === 'name') {
    return direction * String(a.name || '').localeCompare(String(b.name || ''))
  }
  if (sortBy === 'expiry') {
    const left = Date.parse(a.expiry || '') || 0
    const right = Date.parse(b.expiry || '') || 0
    return direction * (left - right)
  }
  if (sortBy === 'aggregated-apy') {
    return direction * ((a.metrics.aggregatedApy || 0) - (b.metrics.aggregatedApy || 0))
  }
  if (sortBy === 'implied-apy') {
    return direction * ((a.metrics.impliedApy || 0) - (b.metrics.impliedApy || 0))
  }
  if (sortBy === 'pendle-apy') {
    return direction * ((a.metrics.pendleApy || 0) - (b.metrics.pendleApy || 0))
  }

  return direction * ((a.metrics.liquidityUsd || 0) - (b.metrics.liquidityUsd || 0))
}

function normalizeCategories (input) {
  if (!Array.isArray(input)) return []
  return input
    .map((value) => String(value || '').trim().toLowerCase())
    .filter(Boolean)
}

async function fetchActiveMarkets ({ chainId }) {
  const url = `${DEFAULT_API_BASE_URL}/v1/${chainId}/markets/active`
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Accept: 'application/json'
    }
  })

  const bodyText = await response.text()
  let body = null
  if (bodyText.trim()) {
    body = JSON.parse(bodyText)
  }

  if (!response.ok) {
    const detail = body && typeof body === 'object'
      ? (body.message || body.error || JSON.stringify(body))
      : bodyText
    throw new Error(`Pendle active markets request failed: HTTP ${response.status} ${String(detail).slice(0, 220)}`)
  }

  if (!body || !Array.isArray(body.markets)) {
    throw new Error('Unexpected Pendle active markets response shape.')
  }

  return body.markets
}

async function fetchConvertQuote ({
  chainId,
  tokensIn,
  amountsIn,
  tokensOut,
  receiver,
  slippage,
  enableAggregator,
  aggregators,
  additionalData
}) {
  const url = new URL(`${DEFAULT_API_BASE_URL}/v2/sdk/${chainId}/convert`)
  url.searchParams.set('tokensIn', tokensIn.join(','))
  url.searchParams.set('amountsIn', amountsIn.join(','))
  url.searchParams.set('tokensOut', tokensOut.join(','))
  url.searchParams.set('receiver', receiver)
  url.searchParams.set('slippage', String(slippage))
  if (enableAggregator) {
    url.searchParams.set('enableAggregator', 'true')
  }
  if (aggregators && aggregators.length) {
    url.searchParams.set('aggregators', aggregators.join(','))
  }
  if (additionalData) {
    url.searchParams.set('additionalData', additionalData)
  }

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      Accept: 'application/json'
    }
  })

  const bodyText = await response.text()
  let body = null
  if (bodyText.trim()) {
    body = JSON.parse(bodyText)
  }

  if (!response.ok) {
    const detail = body && typeof body === 'object'
      ? (body.message || body.error || JSON.stringify(body))
      : bodyText
    throw new Error(`Pendle convert quote failed: HTTP ${response.status} ${String(detail).slice(0, 220)}`)
  }

  if (!body || !Array.isArray(body.routes)) {
    throw new Error('Unexpected Pendle convert response shape.')
  }

  return {
    data: body,
    headers: {
      computingUnit: response.headers.get('x-computing-unit')
    }
  }
}

function normalizeTokenAmount (input) {
  return {
    token: normalizeAddressRef(input.token),
    amount: normalizeAmountRef(input.amount)
  }
}

function selectRoute (routes, routeIndex) {
  const index = Number(routeIndex || 0)
  if (!Number.isInteger(index) || index < 0) {
    throw new Error('--route-index must be a non-negative integer.')
  }
  if (index >= routes.length) {
    throw new Error(`--route-index ${index} is out of range (routes=${routes.length}).`)
  }
  const selected = routes[index]
  if (!selected || !selected.tx || typeof selected.tx !== 'object') {
    throw new Error(`Selected Pendle route ${index} is missing tx payload.`)
  }
  return {
    routeIndex: index,
    route: selected
  }
}

function normalizeRouteSummary (route) {
  return {
    method: route.contractParamInfo && route.contractParamInfo.method
      ? String(route.contractParamInfo.method)
      : null,
    outputs: Array.isArray(route.outputs) ? route.outputs.map((entry) => normalizeTokenAmount(entry)) : [],
    data: route.data || null,
    tx: {
      to: normalizeAddressRef(route.tx.to),
      data: String(route.tx.data || ''),
      value: normalizeAmountRef(route.tx.value || '0')
    }
  }
}

async function quoteYield (input) {
  const quote = await fetchConvertQuote({
    chainId: input.chainId,
    tokensIn: input.tokensIn,
    amountsIn: input.amountsIn,
    tokensOut: input.tokensOut,
    receiver: input.receiver,
    slippage: input.slippage,
    enableAggregator: input.enableAggregator,
    aggregators: input.aggregators,
    additionalData: input.additionalData
  })

  const requiredApprovals = Array.isArray(quote.data.requiredApprovals)
    ? quote.data.requiredApprovals.map((entry) => normalizeTokenAmount(entry))
    : []
  const routes = Array.isArray(quote.data.routes) ? quote.data.routes : []
  const selected = selectRoute(routes, input.routeIndex)

  return {
    provider: 'pendle-hosted-sdk',
    chainId: input.chainId,
    chain: input.chainSlug,
    action: String(quote.data.action || ''),
    walletAddress: input.walletAddress || null,
    receiver: input.receiver,
    inputs: Array.isArray(quote.data.inputs) ? quote.data.inputs.map((entry) => normalizeTokenAmount(entry)) : [],
    requiredApprovals,
    routeCount: routes.length,
    routeIndex: selected.routeIndex,
    route: normalizeRouteSummary(selected.route),
    metadata: {
      computingUnit: quote.headers.computingUnit || null
    },
    warnings: []
  }
}

async function buildExecutionPlan ({
  quote,
  walletAddress,
  approvalMode,
  rpcUrl,
  ethersLib
}) {
  const routeTx = quote.route && quote.route.tx ? quote.route.tx : null
  if (!routeTx || !routeTx.to || !routeTx.data) {
    throw new Error('Pendle quote route tx payload is missing.')
  }

  const warnings = []
  const steps = []
  const approvalChecks = []

  if (approvalMode !== 'skip') {
    if (!rpcUrl) {
      throw new Error('RPC URL is required to evaluate required approvals.')
    }
    const provider = new ethersLib.JsonRpcProvider(rpcUrl, quote.chainId)
    const spender = routeTx.to
    const iface = new ethersLib.Interface(ERC20_ABI)

    for (const approval of quote.requiredApprovals || []) {
      const token = approval.token
      const requiredAllowance = BigInt(approval.amount)
      const contract = new ethersLib.Contract(token, ERC20_ABI, provider)
      const currentAllowance = BigInt((await contract.allowance(walletAddress, spender)).toString())
      const required = currentAllowance < requiredAllowance

      let txRequest = null
      if (required) {
        const targetAmount = approvalMode === 'unlimited'
          ? ((1n << 256n) - 1n)
          : requiredAllowance
        txRequest = {
          to: token,
          data: iface.encodeFunctionData('approve', [spender, targetAmount]),
          value: '0'
        }
        steps.push({
          name: `approval_${token}`,
          txRequest
        })
      }

      approvalChecks.push({
        token,
        spender,
        requiredAllowance: requiredAllowance.toString(),
        currentAllowance: currentAllowance.toString(),
        approvalRequired: required,
        approvalMode
      })
    }
  } else if ((quote.requiredApprovals || []).length > 0) {
    warnings.push('approval_checks_skipped_by_mode')
  }

  steps.push({
    name: 'yield_convert',
    txRequest: {
      to: routeTx.to,
      data: routeTx.data,
      value: routeTx.value || '0'
    }
  })

  return {
    approvalMode,
    approvalChecks,
    steps,
    warnings
  }
}

async function listOpportunities (input) {
  const warnings = []
  const categories = normalizeCategories(input.categories)
  const rawMarkets = await fetchActiveMarkets({
    chainId: input.chainId
  })

  const normalized = rawMarkets.map((entry) =>
    normalizeMarket(entry, {
      chainId: input.chainId,
      chainSlug: input.chainSlug
    })
  )

  const categoryCounter = {}
  for (const market of normalized) {
    for (const categoryId of market.categoryIds) {
      categoryCounter[categoryId] = (categoryCounter[categoryId] || 0) + 1
    }
  }

  let filtered = normalized.filter((entry) => matchesQuery(entry, input.query))

  if (categories.length) {
    filtered = filtered.filter((entry) => entry.categoryIds.some((categoryId) => categories.includes(categoryId)))
  }

  if (input.minLiquidityUsd !== null) {
    filtered = filtered.filter((entry) => entry.metrics.liquidityUsd >= input.minLiquidityUsd)
  }
  if (input.minPendleApy !== null) {
    filtered = filtered.filter((entry) => entry.metrics.pendleApy >= input.minPendleApy)
  }
  if (input.minImpliedApy !== null) {
    filtered = filtered.filter((entry) => entry.metrics.impliedApy >= input.minImpliedApy)
  }
  if (input.minAggregatedApy !== null) {
    filtered = filtered.filter((entry) => entry.metrics.aggregatedApy >= input.minAggregatedApy)
  }
  if (input.primeOnly) {
    filtered = filtered.filter((entry) => entry.isPrime)
  }
  if (input.newOnly) {
    filtered = filtered.filter((entry) => entry.isNew)
  }

  const sortBy = SUPPORTED_SORT_BY.has(input.sortBy) ? input.sortBy : 'liquidity'
  filtered.sort((left, right) => compareValues(left, right, { sortBy, order: input.sortOrder }))

  const offset = input.offset || 0
  const limit = input.limit || 20
  const sliced = filtered.slice(offset, offset + limit)

  if (!sliced.length) {
    warnings.push('no_yield_opportunities_matched_filters')
  }

  return {
    provider: 'pendle-hosted-sdk',
    chainId: input.chainId,
    chain: input.chainSlug,
    walletAddress: input.walletAddress || null,
    filter: {
      categories,
      query: input.query || null,
      minLiquidityUsd: input.minLiquidityUsd,
      minPendleApy: input.minPendleApy,
      minImpliedApy: input.minImpliedApy,
      minAggregatedApy: input.minAggregatedApy,
      primeOnly: input.primeOnly,
      newOnly: input.newOnly,
      sortBy,
      sortOrder: input.sortOrder
    },
    counts: {
      beforeFilter: normalized.length,
      afterFilter: filtered.length,
      returned: sliced.length
    },
    pagination: {
      offset,
      limit
    },
    categoriesObserved: categoryCounter,
    opportunities: sliced,
    warnings
  }
}

module.exports = {
  buildExecutionPlan,
  listOpportunities,
  quoteYield
}
