#!/usr/bin/env node
'use strict'

const {
  computeIntentHash,
  parseBooleanFlag,
  parseChainPayload,
  stringifyBigInts
} = require('./swap-common.js')

function parseIntArg (value, fieldName, { min = null, max = null } = {}) {
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

function parseAmountString (value, fieldName) {
  const parsed = String(value || '').trim()
  if (!parsed) {
    return null
  }
  if (!/^\d+$/.test(parsed)) {
    throw new Error(`--${fieldName} must be an integer string in base units.`)
  }
  if (parsed === '0') {
    throw new Error(`--${fieldName} must be > 0.`)
  }
  return parsed
}

function parseRequiredString (value, fieldName) {
  const parsed = String(value || '').trim()
  if (!parsed) {
    throw new Error(`Missing required --${fieldName}.`)
  }
  return parsed
}

function parseSwapArgs (args, defaultChain = 'base-mainnet') {
  const chain = String(args.chain || defaultChain).trim()
  const chainPayload = parseChainPayload(chain, defaultChain)
  const sellToken = parseRequiredString(args['sell-token'] || args['from-token'], 'sell-token')
  const buyToken = parseRequiredString(args['buy-token'] || args['to-token'], 'buy-token')
  const sellAmount = parseAmountString(args['sell-amount'] || args.amount, 'sell-amount')
  const buyAmount = parseAmountString(args['buy-amount'], 'buy-amount')

  if (!sellAmount && !buyAmount) {
    throw new Error('Provide one of --sell-amount or --buy-amount.')
  }
  if (sellAmount && buyAmount) {
    throw new Error('Provide only one of --sell-amount or --buy-amount.')
  }

  const slippageBps = parseIntArg(args['slippage-bps'], 'slippage-bps', { min: 1, max: 10000 })
  const feeToken = args['fee-token'] ? String(args['fee-token']).trim() : null
  const taker = args.taker ? String(args.taker).trim() : null

  return {
    chain,
    chainPayload,
    sellToken,
    buyToken,
    sellAmount,
    buyAmount,
    slippageBps,
    feeToken,
    taker
  }
}

function parseApprovalMode (args) {
  const modeRaw = String(args['approval-mode'] || 'exact').trim().toLowerCase()
  if (modeRaw !== 'exact' && modeRaw !== 'unlimited') {
    throw new Error('--approval-mode must be exact or unlimited.')
  }
  const allowUnlimited = parseBooleanFlag(args['allow-unlimited'], 'allow-unlimited', false)
  if (modeRaw === 'unlimited' && !allowUnlimited) {
    throw new Error('Unlimited approval requires --allow-unlimited true.')
  }
  return modeRaw
}

function toTxStep (name, txRequest) {
  if (!txRequest || typeof txRequest !== 'object') {
    return null
  }
  return {
    name,
    txRequest
  }
}

function buildExecutionPlan (prepareResult, approvalMode) {
  const payload = prepareResult && typeof prepareResult === 'object' ? prepareResult : {}
  const data = payload.data && typeof payload.data === 'object' ? payload.data : {}
  const allowance = data.allowance && typeof data.allowance === 'object' ? data.allowance : {}

  const approvalRequired = allowance.approvalRequired === true
  const swapTxRequest = data.swapTxRequest || null
  if (!swapTxRequest || typeof swapTxRequest !== 'object') {
    throw new Error('swap_prepare_failed: missing swapTxRequest from backend prepare response.')
  }

  let approvalTxRequest = null
  if (approvalRequired) {
    approvalTxRequest = approvalMode === 'unlimited'
      ? allowance.approvalTxRequestUnlimited
      : allowance.approvalTxRequestExact

    if (!approvalTxRequest || typeof approvalTxRequest !== 'object') {
      throw new Error(`swap_prepare_failed: missing ${approvalMode} approval tx request.`)
    }
  }

  const steps = []
  const approvalStep = toTxStep('approval', approvalTxRequest)
  if (approvalStep) {
    steps.push(approvalStep)
  }
  const swapStep = toTxStep('swap', swapTxRequest)
  if (!swapStep) {
    throw new Error('swap_prepare_failed: missing swap tx request.')
  }
  steps.push(swapStep)

  return {
    approvalMode,
    approvalRequired,
    steps,
    allowance,
    route: data.route || null,
    fee: data.fee || null,
    backendWarnings: Array.isArray(data.warnings) ? data.warnings : []
  }
}

function buildSwapIntent ({
  walletAddress,
  swap,
  plan,
  prepareResult
}) {
  const now = new Date().toISOString()
  const chainId = prepareResult && prepareResult.params && prepareResult.params.chainId
    ? Number(prepareResult.params.chainId)
    : (swap.chainPayload.chainId || null)
  const chainSlug = prepareResult && prepareResult.params && prepareResult.params.chainSlug
    ? String(prepareResult.params.chainSlug)
    : (swap.chainPayload.chainSlug || null)

  const intent = {
    intentVersion: 'swap.intent.v1',
    adapter: '0x',
    chain: {
      chainId,
      chainSlug
    },
    wallet: {
      walletAddress
    },
    swap: {
      sellToken: swap.sellToken,
      buyToken: swap.buyToken,
      sellAmount: swap.sellAmount,
      buyAmount: swap.buyAmount,
      slippageBps: swap.slippageBps
    },
    fee: plan.fee,
    approval: {
      mode: plan.approvalMode,
      required: plan.approvalRequired
    },
    policy: {
      category: 'swap',
      simulateBeforeExecute: true
    },
    createdAt: now,
    metadata: {
      sourceTool: 'swap_build',
      provider: '0x'
    }
  }

  return {
    intent,
    intentHash: computeIntentHash(intent)
  }
}

function buildSwapPayload (swap, walletAddress = null) {
  const payload = {
    sellToken: swap.sellToken,
    buyToken: swap.buyToken
  }
  if (swap.chainPayload.chainId) {
    payload.chainId = swap.chainPayload.chainId
  } else if (swap.chainPayload.chainSlug) {
    payload.chainSlug = swap.chainPayload.chainSlug
  }
  if (walletAddress) {
    payload.walletAddress = walletAddress
    payload.taker = swap.taker || walletAddress
  } else if (swap.taker) {
    payload.taker = swap.taker
  }
  if (swap.sellAmount) {
    payload.sellAmount = swap.sellAmount
  }
  if (swap.buyAmount) {
    payload.buyAmount = swap.buyAmount
  }
  if (typeof swap.slippageBps === 'number') {
    payload.slippageBps = swap.slippageBps
  }
  if (swap.feeToken) {
    payload.feeToken = swap.feeToken
  }
  return payload
}

function normalizeBuildOutput (buildResult) {
  return stringifyBigInts(buildResult)
}

module.exports = {
  buildExecutionPlan,
  buildSwapIntent,
  buildSwapPayload,
  normalizeBuildOutput,
  parseApprovalMode,
  parseSwapArgs
}

