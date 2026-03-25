'use strict'

const {
  DEFAULT_REFERRAL_WALLET,
  loadRuntimeEthers,
  loadRuntimeThetanutsClient,
  normalizeEvmAddress,
  resolveOptionsExecutionContext,
  stringifyBigInts
} = require('./options-common.js')

const MAX_UINT256 = (1n << 256n) - 1n
const BTC_PRICE_FEED = '0x64c911996d3c6ac71f9b455b1e8e7266bcbd848f'
const ETH_PRICE_FEED = '0x71041dddad3595f9ced3dccfbe3d1f4b0a16bb70'

function normalizeAddressRef (value) {
  const raw = String(value || '').trim()
  if (!raw) return null
  if (!/^0x[a-fA-F0-9]{40}$/.test(raw)) return null
  return raw.toLowerCase()
}

function makeOrderKey (order) {
  const maker = String(order && order.makerAddress ? order.makerAddress : order.order && order.order.maker ? order.order.maker : '').trim().toLowerCase()
  const nonce = order && order.order && typeof order.order.nonce !== 'undefined'
    ? order.order.nonce.toString()
    : '0'
  return `${maker}:${nonce}`
}

function strikeFrom8Decimals (value) {
  try {
    const raw = BigInt(value)
    const whole = raw / 100000000n
    const frac = raw % 100000000n
    if (frac === 0n) return whole.toString()
    return `${whole.toString()}.${frac.toString().padStart(8, '0').replace(/0+$/, '')}`
  } catch {
    return String(value)
  }
}

function buildTokenMaps (chainConfig) {
  const byAddress = {}
  const bySymbol = {}
  const tokenEntries = chainConfig && chainConfig.tokens && typeof chainConfig.tokens === 'object'
    ? Object.entries(chainConfig.tokens)
    : []

  for (const [symbol, token] of tokenEntries) {
    const address = normalizeAddressRef(token && token.address ? token.address : null)
    if (!address) continue
    byAddress[address] = symbol.toUpperCase()
    bySymbol[symbol.toUpperCase()] = address
  }

  return { byAddress, bySymbol }
}

function resolveUnderlyingFromOrder (order, chainConfig) {
  const priceFeed = normalizeAddressRef(order && order.rawApiData ? order.rawApiData.priceFeed : null)
  if (priceFeed === BTC_PRICE_FEED) return 'BTC'
  if (priceFeed === ETH_PRICE_FEED) return 'ETH'

  const underlyingAddress = normalizeAddressRef(order && order.order ? order.order.underlyingToken : null)
  if (underlyingAddress) {
    const { byAddress } = buildTokenMaps(chainConfig)
    const symbol = byAddress[underlyingAddress]
    if (symbol === 'CBBTC' || symbol === 'WBTC' || symbol === 'BTCB') return 'BTC'
    if (symbol === 'WETH' || symbol === 'ETH') return 'ETH'
  }

  return null
}

function matchesOrderFilters (order, input, chainConfig) {
  const now = Math.floor(Date.now() / 1000)
  const optionExpiry = Number(order && order.order ? order.order.expiry.toString() : '0')
  const orderExpiry = Number(order && order.rawApiData && order.rawApiData.orderExpiryTimestamp ? order.rawApiData.orderExpiryTimestamp : 0)

  if (!input.includeExpired) {
    if (optionExpiry > 0 && optionExpiry <= now) return false
    if (orderExpiry > 0 && orderExpiry <= now) return false
  }

  if (input.optionType) {
    const isCall = Boolean(order && order.rawApiData ? order.rawApiData.isCall : false)
    if (input.optionType === 'call' && !isCall) return false
    if (input.optionType === 'put' && isCall) return false
  }

  if (input.underlying) {
    const underlying = resolveUnderlyingFromOrder(order, chainConfig)
    if (!underlying || underlying !== input.underlying) return false
  }

  if (input.maker) {
    const maker = String(order && order.makerAddress ? order.makerAddress : '').trim().toLowerCase()
    if (maker !== String(input.maker).trim().toLowerCase()) return false
  }

  if (input.minAvailable) {
    const available = BigInt(order.availableAmount.toString())
    if (available < BigInt(input.minAvailable)) return false
  }

  if (input.collateral) {
    const { byAddress, bySymbol } = buildTokenMaps(chainConfig)
    const collateralAddress = normalizeAddressRef(order && order.rawApiData ? order.rawApiData.collateral : null)
    if (!collateralAddress) return false

    const normalizedInput = String(input.collateral).trim()
    if (normalizedInput.startsWith('0x')) {
      if (collateralAddress !== normalizedInput.toLowerCase()) return false
    } else {
      const targetAddress = bySymbol[normalizedInput.toUpperCase()]
      if (!targetAddress || targetAddress !== collateralAddress) return false
      if (!byAddress[collateralAddress]) return false
    }
  }

  return true
}

function compareOrder (a, b, input) {
  const direction = input.sortOrder === 'desc' ? -1 : 1
  const priceA = BigInt(a && a.order ? a.order.price.toString() : '0')
  const priceB = BigInt(b && b.order ? b.order.price.toString() : '0')
  const expiryA = BigInt(a && a.order ? a.order.expiry.toString() : '0')
  const expiryB = BigInt(b && b.order ? b.order.expiry.toString() : '0')
  const availableA = BigInt(a.availableAmount.toString())
  const availableB = BigInt(b.availableAmount.toString())

  if (input.sortBy === 'expiry') {
    if (expiryA < expiryB) return -1 * direction
    if (expiryA > expiryB) return 1 * direction
  } else if (input.sortBy === 'available') {
    if (availableA < availableB) return -1 * direction
    if (availableA > availableB) return 1 * direction
  } else {
    if (priceA < priceB) return -1 * direction
    if (priceA > priceB) return 1 * direction
  }

  const nonceA = BigInt(a && a.order ? a.order.nonce.toString() : '0')
  const nonceB = BigInt(b && b.order ? b.order.nonce.toString() : '0')
  if (nonceA < nonceB) return -1
  if (nonceA > nonceB) return 1
  return 0
}

function summarizeOrder (order, chainConfig) {
  const { byAddress } = buildTokenMaps(chainConfig)
  const collateralAddress = normalizeAddressRef(order && order.rawApiData ? order.rawApiData.collateral : null)
  const collateralSymbol = collateralAddress ? (byAddress[collateralAddress] || null) : null
  const strikesRaw = order && order.rawApiData && Array.isArray(order.rawApiData.strikes)
    ? order.rawApiData.strikes
    : []

  return {
    orderKey: makeOrderKey(order),
    maker: String(order.makerAddress || order.order.maker || ''),
    nonce: order.order.nonce.toString(),
    optionType: order.rawApiData && order.rawApiData.isCall ? 'call' : 'put',
    underlying: resolveUnderlyingFromOrder(order, chainConfig),
    collateral: {
      token: collateralAddress,
      symbol: collateralSymbol
    },
    implementation: order.rawApiData ? String(order.rawApiData.implementation || '') : '',
    strikes: strikesRaw.map((entry) => ({
      raw: String(entry),
      decimal: strikeFrom8Decimals(entry)
    })),
    pricePerContract: order.order.price.toString(),
    availableAmount: order.availableAmount.toString(),
    optionExpiry: Number(order.order.expiry.toString()),
    orderExpiry: Number(order.rawApiData && order.rawApiData.orderExpiryTimestamp ? order.rawApiData.orderExpiryTimestamp : 0),
    signaturePrefix: String(order.signature || '').slice(0, 16),
    greeks: order.rawApiData && order.rawApiData.greeks ? order.rawApiData.greeks : null
  }
}

function normalizePricingEntry (entry) {
  const ticker = String(entry && entry.ticker ? entry.ticker : '')
  return stringifyBigInts({
    ticker: ticker || null,
    underlying: entry && entry.underlying ? String(entry.underlying).toUpperCase() : null,
    optionType: typeof entry.isCall === 'boolean' ? (entry.isCall ? 'call' : 'put') : null,
    strike: typeof entry.strike !== 'undefined' ? strikeFrom8Decimals(entry.strike) : null,
    expiry: entry && entry.expiry ? entry.expiry : null,
    rawBidPrice: typeof entry.rawBidPrice !== 'undefined' ? entry.rawBidPrice : null,
    rawAskPrice: typeof entry.rawAskPrice !== 'undefined' ? entry.rawAskPrice : null,
    feeAdjustedBid: typeof entry.feeAdjustedBid !== 'undefined' ? entry.feeAdjustedBid : null,
    feeAdjustedAsk: typeof entry.feeAdjustedAsk !== 'undefined' ? entry.feeAdjustedAsk : null,
    byCollateral: entry && entry.byCollateral ? entry.byCollateral : null
  })
}

async function buildClient (input, intent = 'read') {
  const execution = await resolveOptionsExecutionContext(input.chain, intent)
  if (execution.chainId !== 8453) {
    throw new Error(`Thetanuts options currently supports Base only (8453). Received chainId=${execution.chainId}.`)
  }

  const ethersLib = await loadRuntimeEthers()
  const { ThetanutsClient } = await loadRuntimeThetanutsClient()
  const provider = new ethersLib.JsonRpcProvider(execution.rpcUrl, execution.chainId)

  const client = new ThetanutsClient({
    chainId: execution.chainId,
    provider,
    referrer: input.referrer || undefined
  })

  return {
    execution,
    client
  }
}

async function getFilteredSortedOrders (client, input) {
  const allOrders = await client.api.fetchOrders()
  const filtered = allOrders.filter((order) => matchesOrderFilters(order, input, client.chainConfig))
  filtered.sort((a, b) => compareOrder(a, b, input))
  return filtered
}

function selectOrder (orders, input, chainConfig) {
  if (!orders.length) {
    throw new Error('No matching options order found for current filters.')
  }

  let selected = null

  if (input.orderKey) {
    const target = String(input.orderKey).trim().toLowerCase()
    selected = orders.find((order) => makeOrderKey(order).toLowerCase() === target) || null
    if (!selected) {
      throw new Error(`Unable to find order by --order-key ${input.orderKey}.`)
    }
  } else if (input.orderIndex !== null && input.orderIndex !== undefined) {
    selected = orders[input.orderIndex] || null
    if (!selected) {
      throw new Error(`--order-index ${input.orderIndex} is out of range (orders=${orders.length}).`)
    }
  } else {
    selected = orders[0]
  }

  return {
    selected,
    selectedSummary: summarizeOrder(selected, chainConfig)
  }
}

function normalizeAmountInput (amount) {
  if (amount === null || amount === undefined || amount === '') return undefined
  const raw = String(amount).trim()
  if (!/^\d+$/.test(raw)) {
    throw new Error('Order amount must be an integer string in base units.')
  }
  if (raw === '0') {
    throw new Error('Order amount must be > 0.')
  }
  return BigInt(raw)
}

async function buildQuoteContext (input) {
  const { execution, client } = await buildClient(input, 'read')
  const orders = await getFilteredSortedOrders(client, input)
  const { selected, selectedSummary } = selectOrder(orders, input, client.chainConfig)

  const amount = normalizeAmountInput(input.amount)
  const preview = client.optionBook.previewFillOrder(selected, amount, input.referrer)
  const encodedFill = client.optionBook.encodeFillOrder(selected, amount, input.referrer)

  const quote = {
    provider: 'thetanuts-sdk',
    chain: execution.chainSlug,
    chainId: execution.chainId,
    referrer: preview.referrer,
    amountBaseUnits: amount ? amount.toString() : null,
    selectedOrder: selectedSummary,
    fillPreview: {
      numContracts: preview.numContracts.toString(),
      maxContracts: preview.maxContracts.toString(),
      collateralToken: preview.collateralToken,
      pricePerContract: preview.pricePerContract.toString(),
      totalCollateral: preview.totalCollateral.toString(),
      maker: preview.maker,
      optionExpiry: preview.expiry.toString(),
      optionType: preview.isCall ? 'call' : 'put',
      strikes: preview.strikes.map((entry) => entry.toString())
    },
    fillTxRequest: {
      to: encodedFill.to,
      data: encodedFill.data,
      value: '0'
    }
  }

  return {
    execution,
    client,
    selected,
    selectedSummary,
    quote,
    encodedFill,
    preview
  }
}

async function getChainInfo (input) {
  const { execution, client } = await buildClient(input, 'read')
  const chainConfig = client.chainConfig

  let referrerFeeBps = null
  try {
    referrerFeeBps = (await client.optionBook.getReferrerFeeSplit(input.referrer || DEFAULT_REFERRAL_WALLET)).toString()
  } catch {
    referrerFeeBps = null
  }

  return {
    provider: 'thetanuts-sdk',
    chain: execution.chainSlug,
    chainId: execution.chainId,
    rpcUrl: execution.rpcUrl,
    contracts: chainConfig.contracts,
    tokens: chainConfig.tokens,
    endpoints: {
      apiBaseUrl: client.apiBaseUrl,
      indexerApiUrl: client.indexerApiUrl,
      pricingApiUrl: client.pricingApiUrl,
      stateApiUrl: client.stateApiUrl,
      wsBaseUrl: client.wsBaseUrl
    },
    referral: {
      defaultReferrer: input.referrer || DEFAULT_REFERRAL_WALLET,
      feeSplitBps: referrerFeeBps
    }
  }
}

async function getMarketData (input) {
  const { execution, client } = await buildClient(input, 'read')

  const warnings = []
  const marketData = await client.api.getMarketData()
  const pricing = []

  if (input.includePricing) {
    const underlyings = input.underlying ? [input.underlying] : ['ETH', 'BTC']

    for (const underlying of underlyings) {
      let allPricingMap
      try {
        allPricingMap = await client.mmPricing.getAllPricing(underlying)
      } catch (error) {
        warnings.push(`pricing_fetch_failed:${underlying}:${error.message}`)
        continue
      }

      const entries = allPricingMap && typeof allPricingMap === 'object'
        ? Object.values(allPricingMap)
        : []

      const filtered = input.includeExpired
        ? entries
        : client.mmPricing.filterExpired(entries)

      for (const entry of filtered) {
        if (input.optionType && typeof entry.isCall === 'boolean') {
          if (input.optionType === 'call' && !entry.isCall) continue
          if (input.optionType === 'put' && entry.isCall) continue
        }
        pricing.push(normalizePricingEntry(entry))
      }
    }
  }

  let stats = null
  if (input.includeStats) {
    try {
      stats = await client.api.getStatsFromIndexer()
    } catch (error) {
      warnings.push(`stats_fetch_failed:${error.message}`)
    }
  }

  return {
    provider: 'thetanuts-sdk',
    chain: execution.chainSlug,
    chainId: execution.chainId,
    prices: marketData.prices,
    metadata: marketData.metadata,
    pricing: pricing.slice(0, input.limit),
    pricingTotal: pricing.length,
    stats: stats ? stringifyBigInts(stats) : null,
    warnings
  }
}

async function listOrderbook (input) {
  const { execution, client } = await buildClient(input, 'read')
  const orders = await getFilteredSortedOrders(client, input)

  const paged = orders.slice(input.offset, input.offset + input.limit)
  const items = paged.map((order) => summarizeOrder(order, client.chainConfig))

  return {
    provider: 'thetanuts-sdk',
    chain: execution.chainSlug,
    chainId: execution.chainId,
    total: orders.length,
    offset: input.offset,
    limit: input.limit,
    items
  }
}

async function quoteFillOrder (input) {
  const context = await buildQuoteContext(input)
  return {
    ...context.quote,
    warnings: []
  }
}

function matchesPositionStatus (position, targetStatus) {
  if (targetStatus === 'all') return true
  const rawStatus = String(position.status || position.optionStatus || '').trim().toLowerCase()

  if (targetStatus === 'open') {
    return rawStatus.includes('open') || rawStatus.includes('active')
  }
  if (targetStatus === 'closed') {
    return rawStatus.includes('closed')
  }
  if (targetStatus === 'settled') {
    return rawStatus.includes('settled')
  }
  return true
}

function summarizePosition (position) {
  return stringifyBigInts({
    id: position.id,
    optionAddress: position.optionAddress,
    side: position.side,
    status: position.status,
    optionStatus: position.optionStatus || null,
    amount: position.amount,
    entryPrice: position.entryPrice,
    currentValue: position.currentValue,
    pnl: position.pnl,
    pnlUsd: position.pnlUsd || null,
    pnlPct: position.pnlPct || null,
    underlying: position.option && position.option.underlying ? position.option.underlying : null,
    optionType: position.option && typeof position.option.optionType !== 'undefined'
      ? Number(position.option.optionType) === 0 ? 'call' : 'put'
      : null,
    expiry: position.option ? position.option.expiry : null,
    strikes: position.option && Array.isArray(position.option.strikes)
      ? position.option.strikes.map((entry) => entry.toString())
      : [],
    collateral: {
      symbol: position.collateralSymbol || null,
      decimals: position.collateralDecimals || null,
      amount: position.collateralAmount || null
    },
    buyer: position.buyer,
    seller: position.seller,
    referrer: position.referrer,
    entryTxHash: position.entryTxHash || null,
    closeTxHash: position.closeTxHash || null,
    settlement: position.settlement || null
  })
}

async function getPositions (input) {
  const { execution, client } = await buildClient(input, 'read')
  const address = normalizeEvmAddress(input.address, 'address')
  if (!address) {
    throw new Error('Wallet address is required for options positions.')
  }

  const raw = await client.api.getUserPositionsFromIndexer(address)
  const filtered = raw.filter((position) => matchesPositionStatus(position, input.status))
  const paged = filtered.slice(input.offset, input.offset + input.limit)

  return {
    provider: 'thetanuts-sdk',
    chain: execution.chainSlug,
    chainId: execution.chainId,
    address,
    status: input.status,
    total: filtered.length,
    offset: input.offset,
    limit: input.limit,
    items: paged.map((position) => summarizePosition(position))
  }
}

async function buildFillPlan (input) {
  const context = await buildQuoteContext(input)

  const walletAddress = normalizeEvmAddress(input.walletAddress, 'walletAddress')
  if (!walletAddress) {
    throw new Error('walletAddress is required for options build flow.')
  }

  const collateralToken = normalizeAddressRef(context.preview.collateralToken)
  if (!collateralToken) {
    throw new Error('Unable to resolve collateral token for selected options order.')
  }

  const fillSpender = normalizeAddressRef(context.encodedFill.to)
  if (!fillSpender) {
    throw new Error('Unable to resolve OptionBook spender for selected options order.')
  }

  const requiredAllowance = BigInt(context.preview.totalCollateral.toString())
  const currentAllowance = await context.client.erc20.getAllowance(collateralToken, walletAddress, fillSpender)
  const approvalRequired = requiredAllowance > 0n && currentAllowance < requiredAllowance

  const warnings = []
  const steps = []

  if (approvalRequired) {
    if (input.approvalMode === 'skip') {
      warnings.push('approval_required_but_skipped_by_mode')
    } else {
      const approvalAmount = input.approvalMode === 'unlimited'
        ? MAX_UINT256
        : requiredAllowance
      const approvalTx = context.client.erc20.encodeApprove(collateralToken, fillSpender, approvalAmount)
      steps.push({
        name: 'approval',
        txRequest: {
          to: approvalTx.to,
          data: approvalTx.data,
          value: '0'
        }
      })
    }
  }

  steps.push({
    name: 'fill_order',
    txRequest: {
      to: context.encodedFill.to,
      data: context.encodedFill.data,
      value: '0'
    }
  })

  return {
    walletAddress,
    order: context.selectedSummary,
    quote: context.quote,
    plan: {
      approvalMode: input.approvalMode,
      approvalCheck: {
        token: collateralToken,
        spender: fillSpender,
        requiredAllowance: requiredAllowance.toString(),
        currentAllowance: currentAllowance.toString(),
        approvalRequired
      },
      steps
    },
    warnings
  }
}

module.exports = {
  buildFillPlan,
  getChainInfo,
  getMarketData,
  getPositions,
  listOrderbook,
  quoteFillOrder
}
