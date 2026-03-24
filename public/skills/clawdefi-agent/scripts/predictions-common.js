'use strict'

const crypto = require('node:crypto')

const {
  chainToFamily,
  fail,
  parseArgs,
  parseChainSelector,
  parseIndex,
  printJson,
  readSelection,
  requireSeed,
  withAccount
} = require('./wallet-common.js')

const ADAPTERS = {
  polymarket: () => require('./predictions-adapter-polymarket.js')
}

function normalizeAdapter (value) {
  const adapter = String(value || process.env.CLAWDEFI_PREDICTIONS_ADAPTER || 'polymarket').trim().toLowerCase()
  if (!adapter) {
    throw new Error('Missing predictions adapter.')
  }
  if (!Object.prototype.hasOwnProperty.call(ADAPTERS, adapter)) {
    throw new Error(`Unsupported predictions adapter: ${adapter}`)
  }
  return adapter
}

function loadAdapter (value) {
  const adapter = normalizeAdapter(value)
  return {
    adapter,
    impl: ADAPTERS[adapter]()
  }
}

function normalizeChainForPredictions (value) {
  const raw = String(value || '').trim().toLowerCase()
  if (!raw) return 'polygon-pos'
  if (raw === 'polygon' || raw === 'matic') return 'polygon-pos'
  if (raw === 'amoy' || raw === 'polygon-amoy') return 'polygon-amoy'
  if (raw === '137') return 'polygon-pos'
  if (raw === '80002') return 'polygon-amoy'
  return raw
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

function parseOptionalNumber (value, fieldName, { minExclusive = null, min = null } = {}) {
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
  if (minExclusive !== null && parsed <= minExclusive) {
    throw new Error(`--${fieldName} must be > ${minExclusive}.`)
  }
  return parsed
}

function parseStrictString (value, fieldName) {
  const parsed = String(value || '').trim()
  if (!parsed) {
    throw new Error(`Missing required --${fieldName}.`)
  }
  return parsed
}

function parseOptionalString (value) {
  const parsed = String(value || '').trim()
  return parsed || null
}

function normalizeAddress (value, fieldName = 'address') {
  const parsed = parseOptionalString(value)
  if (!parsed) return null
  if (!/^0x[a-fA-F0-9]{40}$/.test(parsed)) {
    throw new Error(`--${fieldName} must be a valid EVM address.`)
  }
  return parsed
}

function stringifyBigInts (value) {
  if (typeof value === 'bigint') return value.toString()
  if (Array.isArray(value)) return value.map((entry) => stringifyBigInts(entry))
  if (!value || typeof value !== 'object') return value
  const out = {}
  for (const [key, entry] of Object.entries(value)) {
    out[key] = stringifyBigInts(entry)
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

function parseBigIntLike (value, fieldName) {
  if (typeof value === 'bigint') return value
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value < 0 || !Number.isInteger(value)) {
      throw new Error(`${fieldName} must be a non-negative integer.`)
    }
    return BigInt(value)
  }
  if (typeof value === 'string') {
    const raw = value.trim()
    if (!raw) return 0n
    if (/^0x[0-9a-fA-F]+$/.test(raw)) return BigInt(raw)
    if (/^\d+$/.test(raw)) return BigInt(raw)
  }
  throw new Error(`${fieldName} must be bigint, decimal string, or hex quantity.`)
}

function toWdkTxRequest (input) {
  if (!input || typeof input !== 'object') {
    throw new Error('Transaction request payload is required.')
  }
  const to = parseStrictString(input.to, 'to')
  const data = typeof input.data === 'string' && input.data.trim() ? input.data.trim() : '0x'

  if (!/^0x[a-fA-F0-9]{40}$/.test(to)) {
    throw new Error('txRequest.to must be a valid EVM address.')
  }
  if (!/^0x([0-9a-fA-F]{2})*$/.test(data)) {
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

async function withWalletContext (args, intent, callback) {
  const seed = await requireSeed()
  const selection = await readSelection()
  const defaultChain = 'polygon-pos'
  const chain = normalizeChainForPredictions(args.chain || defaultChain)

  if (chainToFamily(chain) !== 'evm') {
    throw new Error(`Predictions local execution currently supports EVM only. Received chain=${chain}.`)
  }

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

function buildEnvelope ({ module, adapter, params, data = null, warnings = [], errors = [] }) {
  return {
    contractVersion: 'predictions.local.v1',
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
          code: 'predictions_action_failed',
          message: error.message
        }
      ]
    })
  })
}

module.exports = {
  computeIntentHash,
  loadAdapter,
  normalizeAdapter,
  normalizeAddress,
  normalizeChainForPredictions,
  parseArgs,
  parseBooleanFlag,
  parseOptionalInteger,
  parseOptionalNumber,
  parseOptionalString,
  parseStrictString,
  printFailure,
  printSuccess,
  stringifyBigInts,
  toWdkTxRequest,
  withWalletContext
}
