#!/usr/bin/env node
'use strict'

const crypto = require('node:crypto')

const {
  chainToFamily,
  fail,
  normalizeApiBaseUrl,
  normalizeChain,
  parseArgs,
  parseChainSelector,
  parseIndex,
  printJson,
  readSelection,
  requireSeed,
  withAccount
} = require('./wallet-common.js')

function normalizeAdapter (value) {
  const adapter = String(value || process.env.CLAWDEFI_SWAP_ADAPTER || '0x').trim().toLowerCase()
  if (!adapter) {
    throw new Error('Missing swap adapter.')
  }
  if (adapter !== '0x') {
    throw new Error(`Unsupported swap adapter: ${adapter}`)
  }
  return adapter
}

function stringifyBigInts (value) {
  if (typeof value === 'bigint') return value.toString()
  if (Array.isArray(value)) return value.map((entry) => stringifyBigInts(entry))
  if (!value || typeof value !== 'object') return value
  const out = {}
  for (const [key, item] of Object.entries(value)) {
    out[key] = stringifyBigInts(item)
  }
  return out
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
  const canonical = JSON.stringify(sortKeysRecursively(stringifyBigInts(intent)))
  return `0x${crypto.createHash('sha256').update(canonical).digest('hex')}`
}

function parseBigIntLike (value, field) {
  if (typeof value === 'bigint') return value
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value < 0 || !Number.isInteger(value)) {
      throw new Error(`${field} must be a non-negative integer.`)
    }
    return BigInt(value)
  }
  if (typeof value === 'string') {
    const raw = value.trim()
    if (!raw) return 0n
    if (/^0x[0-9a-fA-F]+$/.test(raw)) return BigInt(raw)
    if (/^\d+$/.test(raw)) return BigInt(raw)
  }
  throw new Error(`${field} must be bigint, decimal string, or hex quantity.`)
}

function isHexData (value) {
  return typeof value === 'string' && /^0x([0-9a-fA-F]{2})*$/.test(value)
}

function toWdkTxRequest (input) {
  if (!input || typeof input !== 'object') {
    throw new Error('Transaction request payload is required.')
  }
  const to = String(input.to || '').trim()
  if (!to) {
    throw new Error('txRequest.to is required.')
  }
  if (!/^0x[a-fA-F0-9]{40}$/.test(to)) {
    throw new Error('txRequest.to must be a valid EVM address.')
  }
  const data = typeof input.data === 'string' && input.data.trim() ? input.data.trim() : '0x'
  if (!isHexData(data)) {
    throw new Error('txRequest.data must be a valid 0x-prefixed hex payload.')
  }

  const normalized = {
    to,
    data,
    value: parseBigIntLike(typeof input.value === 'undefined' ? '0' : input.value, 'value')
  }

  for (const key of ['gasLimit', 'gasPrice', 'maxFeePerGas', 'maxPriorityFeePerGas', 'nonce']) {
    if (typeof input[key] !== 'undefined' && input[key] !== null && input[key] !== '') {
      normalized[key] = parseBigIntLike(input[key], key)
    }
  }
  return normalized
}

function buildEnvelope ({ module, adapter, params, data = null, warnings = [], errors = [] }) {
  return {
    contractVersion: 'swap.local.v1',
    source: 'clawdefi-local-skill',
    module,
    adapter,
    params,
    data,
    warnings,
    errors
  }
}

function printSuccess (input) {
  printJson({
    ok: true,
    ...buildEnvelope(input)
  })
}

function printFailure (module, adapter, params, error, warnings = []) {
  fail(error.message, {
    ...buildEnvelope({
      module,
      adapter,
      params,
      data: null,
      warnings,
      errors: [
        {
          code: 'swap_action_failed',
          message: error.message
        }
      ]
    })
  })
}

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

function parseChainPayload (value, fallback = 'base-mainnet') {
  const raw = String(value || fallback).trim()
  const selector = parseChainSelector(raw)
  if (!selector) {
    throw new Error('Missing chain selector for swap.')
  }
  if (selector.chainId) {
    return { chainId: selector.chainId, chainSlug: null, raw }
  }
  return { chainId: null, chainSlug: selector.chainSlug, raw }
}

function normalizeEvmChain (value) {
  const chain = normalizeChain(value || 'base-mainnet')
  if (chainToFamily(chain) !== 'evm') {
    throw new Error(`Swap local execution currently supports EVM only. Received chain=${chain}.`)
  }
  return chain
}

async function withWalletContext (args, intent, callback) {
  const seed = await requireSeed()
  const selection = await readSelection()
  const defaultChain = chainToFamily(selection.chain) === 'evm' ? selection.chain : 'base-mainnet'
  const chain = normalizeEvmChain(args.chain || defaultChain)
  const index = parseIndex(args.index, selection.index)

  return withAccount(chain, index, seed, async ({ account }) => {
    const address = await account.getAddress()
    return callback({
      account,
      address,
      chain,
      index,
      selection: {
        family: 'evm',
        chain,
        index
      }
    })
  }, { intent })
}

async function callSwapApi (mode, payload) {
  const normalizedMode = String(mode || '').trim().toLowerCase()
  if (normalizedMode !== 'quote' && normalizedMode !== 'prepare') {
    throw new Error(`Unsupported swap API mode: ${mode}`)
  }

  const baseUrl = normalizeApiBaseUrl()
  const response = await fetch(`${baseUrl}/api/v1/swap/${normalizedMode}`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  })

  const bodyText = await response.text()
  let body = null
  if (bodyText.trim()) {
    try {
      body = JSON.parse(bodyText)
    } catch {
      throw new Error(`swap_${normalizedMode}_failed: invalid_json_response`)
    }
  }

  if (!response.ok || !body || body.error) {
    const detail = body && (body.message || body.error)
      ? String(body.message || body.error)
      : `HTTP ${response.status}`
    throw new Error(`swap_${normalizedMode}_failed: ${detail}`)
  }

  return body
}

async function simulateTxSteps (args, steps, context = {}) {
  return withWalletContext(args, 'simulate', async ({ account, address, selection }) => {
    const results = []
    for (const step of steps) {
      const normalizedTx = toWdkTxRequest(step.txRequest)
      const quote = await account.quoteSendTransaction(normalizedTx)
      results.push({
        name: step.name,
        txRequest: stringifyBigInts(normalizedTx),
        simulation: stringifyBigInts(quote)
      })
    }
    return {
      mode: 'simulate',
      address,
      selection,
      steps: results,
      context
    }
  })
}

async function executeTxSteps (args, steps, context = {}) {
  return withWalletContext(args, 'broadcast', async ({ account, address, selection }) => {
    const results = []
    for (const step of steps) {
      const normalizedTx = toWdkTxRequest(step.txRequest)
      const sent = await account.sendTransaction(normalizedTx)
      results.push({
        name: step.name,
        txRequest: stringifyBigInts(normalizedTx),
        transaction: stringifyBigInts(sent)
      })
    }
    return {
      mode: 'execute',
      address,
      selection,
      steps: results,
      context
    }
  })
}

module.exports = {
  callSwapApi,
  computeIntentHash,
  executeTxSteps,
  normalizeAdapter,
  parseArgs,
  parseBooleanFlag,
  parseChainPayload,
  printFailure,
  printSuccess,
  simulateTxSteps,
  stringifyBigInts,
  sortKeysRecursively,
  toWdkTxRequest,
  withWalletContext
}
