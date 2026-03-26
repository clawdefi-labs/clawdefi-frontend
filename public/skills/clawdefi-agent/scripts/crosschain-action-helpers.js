#!/usr/bin/env node
'use strict'

const {
  computeIntentHash,
  parseBooleanFlag,
  stringifyBigInts
} = require('./crosschain-common.js')

const {
  parseChainPayload
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

function parseRequiredString (value, fieldName) {
  const parsed = String(value || '').trim()
  if (!parsed) {
    throw new Error(`Missing required --${fieldName}.`)
  }
  return parsed
}

function parseChainRef (value, fieldName, fallback) {
  const raw = String(value || fallback || '').trim()
  if (!raw) {
    throw new Error(`Missing required --${fieldName}.`)
  }
  const selector = parseChainPayload(raw, fallback || raw)
  return {
    raw,
    selector
  }
}

function parseCrosschainArgs (args, defaultSourceChain = 'base-mainnet', defaultDestinationChain = 'ethereum-mainnet') {
  const source = parseChainRef(
    args['source-chain'] || args['from-chain'] || args.chain,
    'source-chain',
    defaultSourceChain
  )
  const destination = parseChainRef(
    args['destination-chain'] || args['to-chain'],
    'destination-chain',
    defaultDestinationChain
  )

  const sellToken = parseRequiredString(args['sell-token'] || args['from-token'], 'sell-token')
  const buyToken = parseRequiredString(args['buy-token'] || args['to-token'], 'buy-token')
  const sellAmount = parseAmountString(args['sell-amount'] || args.amount, 'sell-amount')
  const slippageBps = parseIntArg(args['slippage-bps'], 'slippage-bps', { min: 1, max: 10000 })
  const feeToken = args['fee-token'] ? String(args['fee-token']).trim() : null

  const taker = args.taker ? String(args.taker).trim() : null
  const recipient = args.recipient ? String(args.recipient).trim() : null
  const simulateFailure = parseBooleanFlag(args['simulate-failure'], 'simulate-failure', false)

  return {
    sourceChainRaw: source.raw,
    sourceChainPayload: source.selector,
    destinationChainRaw: destination.raw,
    destinationChainPayload: destination.selector,
    sellToken,
    buyToken,
    sellAmount,
    slippageBps,
    feeToken,
    taker,
    recipient,
    simulateFailure
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

function parseRequestId (args) {
  const requestId = String(args['request-id'] || args.requestId || '').trim()
  if (!requestId) {
    throw new Error('Missing required --request-id.')
  }
  return requestId
}

function buildCrosschainPayload (crosschain, walletAddress = null, adapter = '0x') {
  const payload = {
    adapter,
    sellToken: crosschain.sellToken,
    buyToken: crosschain.buyToken,
    sellAmount: crosschain.sellAmount,
    simulateFailure: Boolean(crosschain.simulateFailure)
  }

  if (crosschain.sourceChainPayload.chainId) {
    payload.sourceChainId = crosschain.sourceChainPayload.chainId
  } else if (crosschain.sourceChainPayload.chainSlug) {
    payload.sourceChainSlug = crosschain.sourceChainPayload.chainSlug
  }

  if (crosschain.destinationChainPayload.chainId) {
    payload.destinationChainId = crosschain.destinationChainPayload.chainId
  } else if (crosschain.destinationChainPayload.chainSlug) {
    payload.destinationChainSlug = crosschain.destinationChainPayload.chainSlug
  }

  if (walletAddress) {
    payload.walletAddress = walletAddress
    payload.taker = crosschain.taker || walletAddress
    payload.recipient = crosschain.recipient || walletAddress
  } else {
    if (crosschain.taker) payload.taker = crosschain.taker
    if (crosschain.recipient) payload.recipient = crosschain.recipient
  }

  if (typeof crosschain.slippageBps === 'number') {
    payload.slippageBps = crosschain.slippageBps
  }
  if (crosschain.feeToken) {
    payload.feeToken = crosschain.feeToken
  }

  return payload
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

function buildExecutionPlan (buildResult, approvalMode) {
  const payload = buildResult && typeof buildResult === 'object' ? buildResult : {}
  const data = payload.data && typeof payload.data === 'object' ? payload.data : {}
  const allowance = data.allowance && typeof data.allowance === 'object' ? data.allowance : {}

  const requestId = payload.requestId ? String(payload.requestId) : ''
  if (!requestId) {
    throw new Error('crosschain_build_failed: missing requestId from backend build response.')
  }

  const approvalRequired = allowance.approvalRequired === true
  const sourceTxRequest = data.sourceTxRequest || null
  if (!sourceTxRequest || typeof sourceTxRequest !== 'object') {
    throw new Error('crosschain_build_failed: missing sourceTxRequest from backend build response.')
  }

  let approvalTxRequest = null
  if (approvalRequired) {
    approvalTxRequest = approvalMode === 'unlimited'
      ? allowance.approvalTxRequestUnlimited
      : allowance.approvalTxRequestExact

    if (!approvalTxRequest || typeof approvalTxRequest !== 'object') {
      throw new Error(`crosschain_build_failed: missing ${approvalMode} approval tx request.`)
    }
  }

  const steps = []
  const approvalStep = toTxStep('approval', approvalTxRequest)
  if (approvalStep) {
    steps.push(approvalStep)
  }
  const sourceStep = toTxStep('source_bridge', sourceTxRequest)
  if (!sourceStep) {
    throw new Error('crosschain_build_failed: missing source bridge tx request.')
  }
  steps.push(sourceStep)

  return {
    requestId,
    approvalMode,
    approvalRequired,
    steps,
    allowance,
    route: data.route || null,
    fee: data.fee || null,
    claim: data.claim || null,
    refund: data.refund || null,
    backendWarnings: Array.isArray(data.warnings) ? data.warnings : []
  }
}

function buildCrosschainIntent ({
  walletAddress,
  crosschain,
  plan,
  buildResult
}) {
  const now = new Date().toISOString()
  const params = buildResult && buildResult.params && typeof buildResult.params === 'object'
    ? buildResult.params
    : {}

  const intent = {
    intentVersion: 'crosschain.intent.v1',
    adapter: '0x',
    requestId: plan.requestId,
    sourceChain: {
      chainId: params.sourceChainId || crosschain.sourceChainPayload.chainId || null,
      chainSlug: params.sourceChainSlug || crosschain.sourceChainPayload.chainSlug || null
    },
    destinationChain: {
      chainId: params.destinationChainId || crosschain.destinationChainPayload.chainId || null,
      chainSlug: params.destinationChainSlug || crosschain.destinationChainPayload.chainSlug || null
    },
    wallet: {
      walletAddress
    },
    transfer: {
      sellToken: crosschain.sellToken,
      buyToken: crosschain.buyToken,
      sellAmount: crosschain.sellAmount,
      slippageBps: crosschain.slippageBps
    },
    fee: plan.fee,
    approval: {
      mode: plan.approvalMode,
      required: plan.approvalRequired
    },
    policy: {
      category: 'crosschain_swap',
      simulateBeforeExecute: true,
      requiresStatusPolling: true
    },
    createdAt: now,
    metadata: {
      sourceTool: 'crosschain_build',
      provider: '0x-crosschain-sim'
    }
  }

  return {
    intent,
    intentHash: computeIntentHash(intent)
  }
}

function normalizeBuildOutput (buildResult) {
  return stringifyBigInts(buildResult)
}

module.exports = {
  buildCrosschainIntent,
  buildCrosschainPayload,
  buildExecutionPlan,
  normalizeBuildOutput,
  parseApprovalMode,
  parseCrosschainArgs,
  parseRequestId
}
