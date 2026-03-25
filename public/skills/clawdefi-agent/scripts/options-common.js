'use strict'

const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const { createRequire } = require('node:module')
const { pathToFileURL } = require('node:url')

const {
  chainToFamily,
  fail,
  MCP_DIR,
  parseArgs,
  parseIndex,
  printJson,
  readSelection,
  requireSeed,
  resolveExecutionContext,
  withAccount
} = require('./wallet-common.js')

const ADAPTERS = {
  thetanuts: () => require('./options-adapter-thetanuts.js')
}

const OPTIONS_CHAIN_BY_ID = {
  8453: 'base-mainnet'
}

const OPTIONS_CHAIN_ID_BY_SLUG = {
  'base-mainnet': 8453
}

const DEFAULT_REFERRAL_WALLET = '0x25Aa761B02C45D2B57bBb54Dd04D42772afdd291'

function normalizeAdapter (value) {
  const adapter = String(value || process.env.CLAWDEFI_OPTIONS_ADAPTER || 'thetanuts').trim().toLowerCase()
  if (!adapter) {
    throw new Error('Missing options adapter.')
  }
  if (!Object.prototype.hasOwnProperty.call(ADAPTERS, adapter)) {
    throw new Error(`Unsupported options adapter: ${adapter}`)
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

function normalizeChainForOptions (value) {
  const raw = String(value || '').trim().toLowerCase()
  if (!raw) return 'base-mainnet'
  if (raw === 'base') return 'base-mainnet'
  if (raw === '8453') return 'base-mainnet'
  if (raw === 'base-mainnet') return 'base-mainnet'
  throw new Error(`Options currently supports base-mainnet only. Received chain=${raw}.`)
}

function getOptionsChainId (chainSlug) {
  const normalized = normalizeChainForOptions(chainSlug)
  return OPTIONS_CHAIN_ID_BY_SLUG[normalized]
}

function parseBooleanFlag (value, fieldName, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback
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

function parseOptionalString (value) {
  const parsed = String(value || '').trim()
  return parsed || null
}

function parseStrictString (value, fieldName) {
  const parsed = String(value || '').trim()
  if (!parsed) {
    throw new Error(`Missing required --${fieldName}.`)
  }
  return parsed
}

function normalizeEvmAddress (value, fieldName = 'address') {
  const parsed = String(value || '').trim()
  if (!parsed) return null
  if (!/^0x[a-fA-F0-9]{40}$/.test(parsed)) {
    throw new Error(`--${fieldName} must be a valid EVM address.`)
  }
  return parsed
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

async function withWalletContext (args, intent, callback) {
  const seed = await requireSeed()
  const selection = await readSelection()
  const chain = normalizeChainForOptions(args.chain || selection.chain || 'base-mainnet')
  const index = parseIndex(args.index, selection.index)

  if (chainToFamily(chain) !== 'evm') {
    throw new Error(`Options execution currently supports EVM only. Received chain=${chain}.`)
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
  const explicit = normalizeEvmAddress(args.address, 'address')
  if (explicit) {
    return explicit
  }
  const wallet = await withWalletContext(args, 'read', async ({ address }) => ({ address }))
  return wallet.address
}

function buildEnvelope ({ module, adapter, params, data = null, warnings = [], errors = [] }) {
  return {
    contractVersion: 'options.local.v1',
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
          code: 'options_action_failed',
          message: error.message
        }
      ]
    })
  })
}

function getRuntimeRequire () {
  const runtimePackagePath = path.join(MCP_DIR, 'package.json')
  if (!fs.existsSync(runtimePackagePath)) {
    throw new Error(`WDK MCP runtime not found at ${MCP_DIR}. Run bash {baseDir}/scripts/onboard.sh first.`)
  }
  return createRequire(runtimePackagePath)
}

async function importFromRuntime (specifier) {
  const runtimeRequire = getRuntimeRequire()
  let resolved
  try {
    resolved = runtimeRequire.resolve(specifier)
  } catch {
    throw new Error(`Missing runtime module: ${specifier}. Re-run bash {baseDir}/scripts/onboard.sh.`)
  }
  return import(pathToFileURL(resolved).href)
}

async function loadRuntimeEthers () {
  const mod = await importFromRuntime('ethers')
  const ethersLib = mod.ethers || mod
  if (!ethersLib || typeof ethersLib.JsonRpcProvider !== 'function') {
    throw new Error('Unable to load ethers JsonRpcProvider from runtime modules.')
  }
  return ethersLib
}

async function loadRuntimeThetanutsClient () {
  const mod = await importFromRuntime('@thetanuts-finance/thetanuts-client')
  const ThetanutsClient = mod.ThetanutsClient || (mod.default && mod.default.ThetanutsClient) || mod.default
  if (typeof ThetanutsClient !== 'function') {
    throw new Error('Unable to load ThetanutsClient from runtime modules.')
  }
  return {
    ThetanutsClient,
    module: mod
  }
}

async function resolveOptionsExecutionContext (chain, intent = 'read') {
  const chainSlug = normalizeChainForOptions(chain)
  const execution = await resolveExecutionContext(chainSlug, intent)
  if (execution.family !== 'evm') {
    throw new Error(`Options execution requires EVM chain. Received family=${execution.family}.`)
  }
  const chainId = OPTIONS_CHAIN_ID_BY_SLUG[chainSlug] || execution.chainId || null
  return {
    ...execution,
    chainSlug,
    chainId
  }
}

module.exports = {
  DEFAULT_REFERRAL_WALLET,
  MCP_DIR,
  OPTIONS_CHAIN_BY_ID,
  buildEnvelope,
  computeIntentHash,
  getOptionsChainId,
  loadAdapter,
  loadRuntimeEthers,
  loadRuntimeThetanutsClient,
  normalizeAdapter,
  normalizeChainForOptions,
  normalizeEvmAddress,
  parseArgs,
  parseBooleanFlag,
  parseOptionalInteger,
  parseOptionalString,
  parseStrictString,
  printFailure,
  printSuccess,
  resolveOptionsExecutionContext,
  resolveWalletAddress,
  stringifyBigInts,
  toWdkTxRequest,
  withWalletContext
}
