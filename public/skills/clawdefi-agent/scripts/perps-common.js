'use strict'

const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const { createRequire } = require('node:module')

const {
  chainToFamily,
  fail,
  MCP_DIR,
  parseAmountBaseUnits,
  parseArgs,
  parseChainSelector,
  parseIndex,
  parseOptionalBigInt,
  printJson,
  readSelection,
  requireSeed,
  withAccount,
  callChainRegistry
} = require('./wallet-common.js')

const ADAPTERS = {
  avantis: () => require('./perps-adapter-avantis.js')
}

const CHAIN_RPC_FALLBACKS = {
  'base-mainnet': process.env.CLAWDEFI_BASE_RPC_URL || 'https://mainnet.base.org',
  base: process.env.CLAWDEFI_BASE_RPC_URL || 'https://mainnet.base.org',
  'ethereum-mainnet': process.env.CLAWDEFI_EVM_RPC_URL || 'https://rpc.mevblocker.io/fast',
  ethereum: process.env.CLAWDEFI_EVM_RPC_URL || 'https://rpc.mevblocker.io/fast',
  'bnb-smart-chain': process.env.CLAWDEFI_BSC_RPC_URL || 'https://bsc-dataseed.binance.org',
  bsc: process.env.CLAWDEFI_BSC_RPC_URL || 'https://bsc-dataseed.binance.org'
}

function normalizeAdapter (value) {
  const adapter = String(value || process.env.CLAWDEFI_PERPS_ADAPTER || 'avantis').trim().toLowerCase()
  if (!adapter) {
    throw new Error('Missing perps adapter.')
  }
  if (!Object.prototype.hasOwnProperty.call(ADAPTERS, adapter)) {
    throw new Error(`Unsupported perps adapter: ${adapter}`)
  }
  return adapter
}

function loadAdapter (value) {
  const adapter = normalizeAdapter(value)
  const moduleFactory = ADAPTERS[adapter]
  return {
    adapter,
    impl: moduleFactory()
  }
}

function parseStrictNumber (value, key, { minExclusive = null } = {}) {
  if (value === undefined || value === null || value === '') {
    throw new Error(`Missing required --${key}.`)
  }
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    throw new Error(`--${key} must be numeric.`)
  }
  if (minExclusive !== null && parsed <= minExclusive) {
    throw new Error(`--${key} must be > ${minExclusive}.`)
  }
  return parsed
}

function parseStrictString (value, key) {
  const parsed = String(value || '').trim()
  if (!parsed) {
    throw new Error(`Missing required --${key}.`)
  }
  return parsed
}

function parseSide (value) {
  const side = String(value || '').trim().toLowerCase()
  if (!side) {
    throw new Error('Missing required --side.')
  }
  if (side !== 'long' && side !== 'short') {
    throw new Error('--side must be long or short.')
  }
  return side
}

function parseOptionalNumber (value, key, { minExclusive = null } = {}) {
  if (value === undefined || value === null || value === '') {
    return null
  }
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    throw new Error(`--${key} must be numeric.`)
  }
  if (minExclusive !== null && parsed <= minExclusive) {
    throw new Error(`--${key} must be > ${minExclusive}.`)
  }
  return parsed
}

function parseOptionalInteger (value, key, { min = null } = {}) {
  if (value === undefined || value === null || value === '') {
    return null
  }
  const parsed = Number.parseInt(String(value), 10)
  if (!Number.isInteger(parsed)) {
    throw new Error(`--${key} must be an integer.`)
  }
  if (min !== null && parsed < min) {
    throw new Error(`--${key} must be >= ${min}.`)
  }
  return parsed
}

function parseTxArgs (args, { requireTx = true } = {}) {
  const to = args.to ? String(args.to).trim() : ''
  const data = args.data ? String(args.data).trim() : '0x'
  const valueRaw = args.value !== undefined ? args.value : args.amount

  if (requireTx && !to) {
    throw new Error('Missing required --to for transaction payload.')
  }

  const tx = {}
  if (to) {
    tx.to = to
  }
  if (data) {
    tx.data = data
  }

  if (valueRaw !== undefined && valueRaw !== null && valueRaw !== '') {
    tx.value = parseAmountBaseUnits(valueRaw)
  } else {
    tx.value = BigInt(0)
  }

  const gasLimit = parseOptionalBigInt(args['gas-limit'], 'gas-limit')
  const gasPrice = parseOptionalBigInt(args['gas-price'], 'gas-price')
  const maxFeePerGas = parseOptionalBigInt(args['max-fee-per-gas'], 'max-fee-per-gas')
  const maxPriorityFeePerGas = parseOptionalBigInt(args['max-priority-fee-per-gas'], 'max-priority-fee-per-gas')

  if (typeof gasLimit !== 'undefined') {
    tx.gasLimit = gasLimit
  }
  if (typeof gasPrice !== 'undefined') {
    tx.gasPrice = gasPrice
  }
  if (typeof maxFeePerGas !== 'undefined') {
    tx.maxFeePerGas = maxFeePerGas
  }
  if (typeof maxPriorityFeePerGas !== 'undefined') {
    tx.maxPriorityFeePerGas = maxPriorityFeePerGas
  }

  return tx
}

function parseBigIntLike (value, field) {
  if (typeof value === 'bigint') {
    return value
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value < 0 || !Number.isInteger(value)) {
      throw new Error(`${field} must be a non-negative integer.`)
    }
    return BigInt(value)
  }
  if (typeof value === 'string') {
    const raw = value.trim()
    if (!raw) {
      return BigInt(0)
    }
    if (/^0x[0-9a-fA-F]+$/.test(raw)) {
      return BigInt(raw)
    }
    if (/^\d+$/.test(raw)) {
      return BigInt(raw)
    }
  }
  throw new Error(`${field} must be bigint, decimal string, or hex quantity.`)
}

function toWdkTxRequest (input) {
  if (!input || typeof input !== 'object') {
    throw new Error('Transaction request payload is required.')
  }
  const tx = input
  const to = parseStrictString(tx.to, 'to')
  const data = typeof tx.data === 'string' && tx.data.trim() ? tx.data.trim() : '0x'

  const normalized = {
    to,
    data,
    value: parseBigIntLike(typeof tx.value === 'undefined' ? '0' : tx.value, 'value')
  }

  for (const key of ['gasLimit', 'gasPrice', 'maxFeePerGas', 'maxPriorityFeePerGas', 'nonce']) {
    if (typeof tx[key] !== 'undefined' && tx[key] !== null && tx[key] !== '') {
      normalized[key] = parseBigIntLike(tx[key], key)
    }
  }

  return normalized
}

function normalizeChainForPerps (value) {
  const parsed = String(value || 'base-mainnet').trim().toLowerCase()
  if (!parsed) {
    return 'base-mainnet'
  }
  if (parsed === 'base') return 'base-mainnet'
  return parsed
}

async function resolvePerpsRpcUrl (chain, intent = 'read') {
  const normalized = normalizeChainForPerps(chain)
  const selector = parseChainSelector(normalized)

  try {
    if (selector) {
      const resolved = await callChainRegistry(selector, intent)
      if (resolved && typeof resolved.rpcUrl === 'string' && resolved.rpcUrl.trim()) {
        return {
          chainSlug: resolved.chainSlug || normalized,
          chainId: resolved.chainId || null,
          rpcUrl: resolved.rpcUrl
        }
      }
    }
  } catch {
    // fallback below
  }

  const fallback = CHAIN_RPC_FALLBACKS[normalized] || CHAIN_RPC_FALLBACKS.base
  return {
    chainSlug: normalized,
    chainId: normalized === 'base-mainnet' ? 8453 : null,
    rpcUrl: fallback
  }
}

async function withWalletContext (args, intent, callback) {
  const seed = await requireSeed()
  const selection = await readSelection()
  const chain = normalizeChainForPerps(args.chain || selection.chain || 'base-mainnet')
  const index = parseIndex(args.index, selection.index)

  if (chainToFamily(chain) !== 'evm') {
    throw new Error(`Perps local execution currently supports EVM only. Received chain=${chain}.`)
  }

  return withAccount(chain, index, seed, async ({ account }) => {
    const address = await account.getAddress()
    return callback({
      address,
      chain,
      index,
      selection: {
        family: 'evm',
        chain,
        index
      },
      account
    })
  }, { intent })
}

async function resolveWalletContext (args, intent) {
  return withWalletContext(args, intent, async ({ address, chain, index, selection }) => ({
    address,
    chain,
    index,
    selection
  }))
}

function stringifyBigInts (value) {
  if (typeof value === 'bigint') {
    return value.toString()
  }
  if (Array.isArray(value)) {
    return value.map((item) => stringifyBigInts(item))
  }
  if (value && typeof value === 'object') {
    const next = {}
    for (const [key, item] of Object.entries(value)) {
      next[key] = stringifyBigInts(item)
    }
    return next
  }
  return value
}

function sortKeysRecursively (value) {
  if (Array.isArray(value)) {
    return value.map((entry) => sortKeysRecursively(entry))
  }
  if (!value || typeof value !== 'object') {
    return value
  }

  const record = value
  const sorted = {}
  for (const key of Object.keys(record).sort()) {
    sorted[key] = sortKeysRecursively(record[key])
  }
  return sorted
}

function computeIntentHash (intent) {
  const canonical = JSON.stringify(sortKeysRecursively(stringifyBigInts(intent)))
  return `0x${crypto.createHash('sha256').update(canonical).digest('hex')}`
}

function buildEnvelope ({ module, adapter, params, data = null, warnings = [], errors = [] }) {
  return {
    contractVersion: 'perps.local.v2',
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
          code: 'perps_action_failed',
          message: error.message
        }
      ]
    })
  })
}

function getRuntimeRequire () {
  const runtimePackagePath = path.join(MCP_DIR, 'package.json')
  if (fs.existsSync(runtimePackagePath)) {
    return createRequire(runtimePackagePath)
  }

  const fallbackMcpPackagePath = path.join(process.cwd(), 'mcp', 'package.json')
  if (fs.existsSync(fallbackMcpPackagePath)) {
    return createRequire(fallbackMcpPackagePath)
  }

  throw new Error(`WDK runtime not found at ${MCP_DIR}. Run bash {baseDir}/scripts/onboard.sh first.`)
}

function requireFromRuntime (moduleName) {
  const runtimeRequire = getRuntimeRequire()
  try {
    return runtimeRequire(moduleName)
  } catch {
    throw new Error(
      `${moduleName} is not installed in local runtime (${MCP_DIR}). Run bash {baseDir}/scripts/onboard.sh again to install perps dependencies.`
    )
  }
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
  buildEnvelope,
  computeIntentHash,
  executeWithWallet,
  loadAdapter,
  parseArgs,
  parseOptionalInteger,
  parseOptionalNumber,
  parseSide,
  parseStrictNumber,
  parseStrictString,
  parseTxArgs,
  printFailure,
  printSuccess,
  requireFromRuntime,
  resolvePerpsRpcUrl,
  resolveWalletContext,
  simulateWithWallet,
  sortKeysRecursively,
  stringifyBigInts,
  toWdkTxRequest,
  withWalletContext
}
