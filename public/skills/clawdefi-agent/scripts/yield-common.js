'use strict'

const crypto = require('node:crypto')

const {
  chainToFamily,
  fail,
  MCP_DIR,
  parseArgs,
  parseIndex,
  printJson,
  readSelection,
  resolveExecutionContext,
  requireSeed,
  writeEnvValue,
  withAccount
} = require('./wallet-common.js')

const ADAPTERS = {
  pendle: () => require('./yield-adapter-pendle.js')
}

const PENDLE_CHAIN_ID_BY_SLUG = {
  'ethereum-mainnet': 1,
  'optimism-mainnet': 10,
  'bnb-smart-chain': 56,
  'arbitrum-one': 42161,
  'base-mainnet': 8453
}

const PENDLE_CHAIN_SLUG_BY_ID = Object.fromEntries(
  Object.entries(PENDLE_CHAIN_ID_BY_SLUG).map(([slug, chainId]) => [String(chainId), slug])
)

function normalizeAdapter (value) {
  const adapter = String(value || process.env.CLAWDEFI_YIELD_ADAPTER || 'pendle').trim().toLowerCase()
  if (!adapter) {
    throw new Error('Missing yield adapter.')
  }
  if (!Object.prototype.hasOwnProperty.call(ADAPTERS, adapter)) {
    throw new Error(`Unsupported yield adapter: ${adapter}`)
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

function normalizeChainForYield (value) {
  const parsed = String(value || '').trim().toLowerCase()
  if (!parsed) return ''
  if (parsed === 'eth' || parsed === 'ethereum' || parsed === 'mainnet') return 'ethereum-mainnet'
  if (parsed === 'op' || parsed === 'optimism') return 'optimism-mainnet'
  if (parsed === 'bsc' || parsed === 'bnb') return 'bnb-smart-chain'
  if (parsed === 'arb' || parsed === 'arbitrum') return 'arbitrum-one'
  if (parsed === 'base') return 'base-mainnet'
  return parsed
}

async function withWalletContext (args, intent, callback) {
  const seed = await requireSeed()
  const selection = await readSelection()
  const chain = normalizeChainForYield(args.chain || selection.chain || 'ethereum-mainnet')
  const index = parseIndex(args.index, selection.index)

  if (chainToFamily(chain) !== 'evm') {
    throw new Error(`Yield local execution currently supports EVM only. Received chain=${chain}.`)
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

async function resolveWalletAddress (args) {
  if (args.address) {
    return String(args.address).trim()
  }
  const wallet = await withWalletContext(args, 'read', async ({ address }) => ({ address }))
  return wallet.address
}

function buildEnvelope ({ module, adapter, params, data = null, warnings = [], errors = [] }) {
  return {
    contractVersion: 'yield.local.v1',
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
          code: 'yield_action_failed',
          message: error.message
        }
      ]
    })
  })
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
  const to = String(input.to || '').trim()
  if (!/^0x[a-fA-F0-9]{40}$/.test(to)) {
    throw new Error('txRequest.to must be a valid EVM address.')
  }
  const data = typeof input.data === 'string' && input.data.trim() ? input.data.trim() : '0x'
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

async function withSuppressedClobLogs (callback) {
  const originalLog = console.log
  const originalError = console.error
  const passthrough = (fn) => (...args) => {
    const message = args
      .map((entry) => (typeof entry === 'string' ? entry : String(entry)))
      .join(' ')
    if (message.includes('[CLOB Client]')) return
    return fn(...args)
  }
  console.log = passthrough(originalLog)
  console.error = passthrough(originalError)
  try {
    return await callback()
  } finally {
    console.log = originalLog
    console.error = originalError
  }
}

async function loadRuntimeEthers () {
  const { createRequire } = require('node:module')
  const { pathToFileURL } = require('node:url')
  const fs = require('node:fs')
  const path = require('node:path')

  const runtimePackagePath = path.join(MCP_DIR, 'package.json')
  let runtimeRequire = null
  if (fs.existsSync(runtimePackagePath)) {
    runtimeRequire = createRequire(runtimePackagePath)
  } else {
    const fallbackMcpPackagePath = path.join(process.cwd(), 'mcp', 'package.json')
    if (fs.existsSync(fallbackMcpPackagePath)) {
      runtimeRequire = createRequire(fallbackMcpPackagePath)
    }
  }
  if (!runtimeRequire) {
    throw new Error(`WDK runtime not found at ${MCP_DIR}. Run bash {baseDir}/scripts/onboard.sh first.`)
  }
  try {
    return runtimeRequire('ethers')
  } catch {
    try {
      const resolved = runtimeRequire.resolve('ethers')
      const mod = await import(pathToFileURL(resolved).href)
      return mod.default || mod
    } catch {
      throw new Error('ethers runtime dependency is missing. Run onboarding/update to refresh local runtime packages.')
    }
  }
}

module.exports = {
  PENDLE_CHAIN_ID_BY_SLUG,
  PENDLE_CHAIN_SLUG_BY_ID,
  computeIntentHash,
  loadAdapter,
  loadRuntimeEthers,
  normalizeChainForYield,
  parseArgs,
  printFailure,
  printSuccess,
  readSelection,
  resolveExecutionContext,
  resolveWalletAddress,
  stringifyBigInts,
  toWdkTxRequest,
  withWalletContext,
  withSuppressedClobLogs,
  writeEnvValue
}
