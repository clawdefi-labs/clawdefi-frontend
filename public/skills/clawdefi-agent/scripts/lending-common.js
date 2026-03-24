'use strict'

const crypto = require('node:crypto')

const {
  chainToFamily,
  fail,
  parseArgs,
  parseIndex,
  printJson,
  readSelection,
  requireSeed,
  withAccount
} = require('./wallet-common.js')

const ADAPTERS = {
  aave: () => require('./lending-adapter-aave.js')
}

function normalizeAdapter (value) {
  const adapter = String(value || process.env.CLAWDEFI_LENDING_ADAPTER || 'aave').trim().toLowerCase()
  if (!adapter) {
    throw new Error('Missing lending adapter.')
  }
  if (!Object.prototype.hasOwnProperty.call(ADAPTERS, adapter)) {
    throw new Error(`Unsupported lending adapter: ${adapter}`)
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

function normalizeChainForLending (value) {
  const parsed = String(value || '').trim().toLowerCase()
  if (!parsed) return ''
  if (parsed === 'eth' || parsed === 'ethereum') return 'ethereum-mainnet'
  if (parsed === 'base') return 'base-mainnet'
  if (parsed === 'arb' || parsed === 'arbitrum') return 'arbitrum-one'
  if (parsed === 'op' || parsed === 'optimism') return 'optimism-mainnet'
  if (parsed === 'polygon' || parsed === 'matic') return 'polygon-pos'
  if (parsed === 'avax' || parsed === 'avalanche') return 'avax-mainnet'
  if (parsed === 'bsc' || parsed === 'bnb') return 'bnb-smart-chain'
  return parsed
}

async function withWalletContext (args, intent, callback) {
  const seed = await requireSeed()
  const selection = await readSelection()
  const chain = normalizeChainForLending(args.chain || selection.chain || 'ethereum-mainnet')
  const index = parseIndex(args.index, selection.index)

  if (chainToFamily(chain) !== 'evm') {
    throw new Error(`Lending local execution currently supports EVM only. Received chain=${chain}.`)
  }

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

function toWdkTxRequest (input) {
  if (!input || typeof input !== 'object') {
    throw new Error('Transaction request payload is required.')
  }
  const to = String(input.to || '').trim()
  if (!to) {
    throw new Error('txRequest.to is required.')
  }
  const data = typeof input.data === 'string' && input.data.trim() ? input.data.trim() : '0x'

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
    contractVersion: 'lending.local.v1',
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
          code: 'lending_action_failed',
          message: error.message
        }
      ]
    })
  })
}

async function simulateWithWallet (args, txRequest, context = {}) {
  const normalizedTx = toWdkTxRequest(txRequest)
  return withWalletContext(args, 'simulate', async ({ account, address, selection }) => {
    const quote = await account.quoteSendTransaction(normalizedTx)
    return {
      mode: 'simulate',
      address,
      selection,
      txRequest: stringifyBigInts(normalizedTx),
      simulation: stringifyBigInts(quote),
      context
    }
  })
}

async function executeWithWallet (args, txRequest, context = {}) {
  const normalizedTx = toWdkTxRequest(txRequest)
  return withWalletContext(args, 'broadcast', async ({ account, address, selection }) => {
    const sent = await account.sendTransaction(normalizedTx)
    return {
      mode: 'execute',
      address,
      selection,
      txRequest: stringifyBigInts(normalizedTx),
      transaction: stringifyBigInts(sent),
      context
    }
  })
}

module.exports = {
  computeIntentHash,
  executeWithWallet,
  loadAdapter,
  normalizeChainForLending,
  parseArgs,
  printFailure,
  printSuccess,
  simulateWithWallet,
  stringifyBigInts,
  toWdkTxRequest,
  withWalletContext
}
