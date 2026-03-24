'use strict'

const {
  parseOptionalInteger,
  parseOptionalNumber,
  parseSide,
  parseStrictNumber,
  parseStrictString,
  stringifyBigInts,
  withWalletContext
} = require('./perps-common.js')

async function resolveWalletAddress (args) {
  if (args.address) {
    return String(args.address).trim()
  }

  const wallet = await withWalletContext(args, 'read', async ({ address }) => ({ address }))
  return wallet.address
}

function parseOpenArgs (args) {
  const market = parseStrictString(args.market || args.pair, 'market')
  const side = parseSide(args.side)
  const collateralUsd = parseStrictNumber(
    args['collateral-usd'] !== undefined ? args['collateral-usd'] : args['size-usd'],
    'collateral-usd',
    { minExclusive: 0 }
  )
  const leverage = parseStrictNumber(args.leverage, 'leverage', { minExclusive: 0 })
  const orderType = String(args['order-type'] || args.orderType || 'market').trim().toLowerCase()
  const limitPrice = parseOptionalNumber(args['limit-price'] || args.limitPrice, 'limit-price', { minExclusive: 0 })
  const takeProfit = parseOptionalNumber(
    args['take-profit'] !== undefined ? args['take-profit'] : args.tp,
    'take-profit',
    { minExclusive: -1 }
  )
  const stopLoss = parseOptionalNumber(
    args['stop-loss'] !== undefined ? args['stop-loss'] : args.sl,
    'stop-loss',
    { minExclusive: -1 }
  )
  const maxSlippageP = parseOptionalNumber(
    args['max-slippage-p'] !== undefined ? args['max-slippage-p'] : args.maxSlippageP,
    'max-slippage-p',
    { minExclusive: 0 }
  )

  return {
    market,
    side,
    collateralUsd,
    leverage,
    orderType,
    limitPrice,
    takeProfit,
    stopLoss,
    maxSlippageP
  }
}

function parseCloseArgs (args) {
  const positionId = args['position-id'] ? String(args['position-id']).trim() : null
  const pairIndex = parseOptionalInteger(args['pair-index'], 'pair-index', { min: 0 })
  const tradeIndex = parseOptionalInteger(args['trade-index'], 'trade-index', { min: 0 })
  const sizePercent = parseOptionalNumber(
    args['size-percent'] !== undefined ? args['size-percent'] : args['close-percent'],
    'size-percent',
    { minExclusive: 0 }
  )

  return {
    positionId,
    pairIndex,
    tradeIndex,
    sizePercent: sizePercent == null ? 100 : sizePercent
  }
}

function parseRiskArgs (args) {
  const base = parseCloseArgs(args)
  const takeProfit = parseOptionalNumber(
    args['take-profit'] !== undefined ? args['take-profit'] : args.tp,
    'take-profit',
    { minExclusive: -1 }
  )
  const stopLoss = parseOptionalNumber(
    args['stop-loss'] !== undefined ? args['stop-loss'] : args.sl,
    'stop-loss',
    { minExclusive: -1 }
  )

  return {
    ...base,
    takeProfit,
    stopLoss
  }
}

function parseModifyArgs (args) {
  const base = parseCloseArgs(args)
  const marginDeltaUsd = parseStrictNumber(
    args['margin-delta-usd'] !== undefined ? args['margin-delta-usd'] : args['margin-usd'],
    'margin-delta-usd',
    { minExclusive: 0 }
  )
  const updateType = String(args['update-type'] || args.updateType || 'deposit').trim().toLowerCase()

  return {
    ...base,
    marginDeltaUsd,
    updateType
  }
}

function parseCancelArgs (args) {
  const orderId = args['order-id'] ? String(args['order-id']).trim() : null
  const pairIndex = parseOptionalInteger(args['pair-index'], 'pair-index', { min: 0 })
  const orderIndex = parseOptionalInteger(args['order-index'], 'order-index', { min: 0 })

  return {
    orderId,
    pairIndex,
    orderIndex
  }
}

function parseReferralCode (args) {
  const referralCode = parseStrictString(
    args['referral-code'] !== undefined ? args['referral-code'] : (args.referralCode || args.code),
    'referral-code'
  )
  const bytes = Buffer.byteLength(referralCode, 'utf8')
  if (bytes > 31) {
    throw new Error('--referral-code must be <= 31 UTF-8 bytes for bytes32 encoding.')
  }
  return referralCode
}

function normalizeBuildOutput (buildResult) {
  return stringifyBigInts({
    ...buildResult,
    txRequest: buildResult.txRequest || null
  })
}

module.exports = {
  normalizeBuildOutput,
  parseCancelArgs,
  parseCloseArgs,
  parseModifyArgs,
  parseOpenArgs,
  parseReferralCode,
  parseRiskArgs,
  resolveWalletAddress
}
