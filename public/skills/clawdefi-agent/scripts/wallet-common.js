'use strict'

const fs = require('node:fs/promises')
const path = require('node:path')
const { createRequire } = require('node:module')
const { pathToFileURL } = require('node:url')

const STATE_DIR = process.env.OPENCLAW_STATE_DIR || path.join(process.env.HOME || '', '.openclaw')
const CLAWDEFI_DIR = path.join(STATE_DIR, 'clawdefi')
const MCP_DIR = path.join(CLAWDEFI_DIR, 'wdk-mcp')
const ENV_FILE = path.join(MCP_DIR, '.env')
const SELECTION_FILE = path.join(CLAWDEFI_DIR, 'wallet-selection.json')

const FAMILY_CONFIG = {
  evm: {
    managerType: 'evm',
    config: {}
  },
  solana: {
    managerType: 'solana',
    config: {
      rpcUrl: process.env.CLAWDEFI_SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
      commitment: 'confirmed'
    }
  }
}

const CHAIN_ALIASES = {
  eth: 'ethereum-mainnet',
  ethereum: 'ethereum-mainnet',
  base: 'base-mainnet',
  bsc: 'bnb-smart-chain',
  bnb: 'bnb-smart-chain',
  arb: 'arbitrum-one',
  arbitrum: 'arbitrum-one',
  op: 'optimism-mainnet',
  optimism: 'optimism-mainnet',
  polygon: 'polygon-pos',
  matic: 'polygon-pos',
  avax: 'avax-mainnet'
}

function printJson (payload) {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`)
}

function fail (message, extra = {}) {
  printJson({
    ok: false,
    error: message,
    ...extra
  })
  process.exit(1)
}

function normalizeFamily (value) {
  const family = String(value || 'evm').trim().toLowerCase()
  if (!FAMILY_CONFIG[family]) {
    throw new Error(`Unsupported wallet family: ${family}`)
  }
  return family
}

function normalizeApiBaseUrl (value) {
  return String(value || process.env.CLAWDEFI_API_BASE_URL || process.env.CORE_API_BASE_URL || 'https://api.clawdefi.ai')
    .trim()
    .replace(/\/+$/, '')
}

function parseChainSelector (value) {
  const raw = String(value || '').trim().toLowerCase()
  if (!raw) {
    return null
  }
  if (/^\d+$/.test(raw)) {
    return {
      chainId: Number(raw),
      input: raw
    }
  }
  return {
    chainSlug: CHAIN_ALIASES[raw] || raw,
    input: raw
  }
}

function normalizeChain (value) {
  const selector = parseChainSelector(value)
  if (!selector) {
    return 'ethereum-mainnet'
  }
  if (selector.chainId) {
    return String(selector.chainId)
  }
  return selector.chainSlug
}

function defaultChainForFamily (family) {
  const normalizedFamily = normalizeFamily(family)
  return normalizedFamily === 'solana' ? 'solana' : 'ethereum-mainnet'
}

function chainToFamily (chain) {
  const normalized = String(chain || '').trim().toLowerCase()
  if (!normalized) {
    return 'evm'
  }
  if (normalized === 'solana') {
    return 'solana'
  }
  return 'evm'
}

function resolveSelectionInput (input = {}) {
  const family = input.family
    ? normalizeFamily(input.family)
    : input.chain
      ? chainToFamily(input.chain)
      : 'evm'
  const chain = input.chain
    ? normalizeChain(input.chain)
    : defaultChainForFamily(family)
  if (family === 'solana' && chain !== 'solana') {
    throw new Error(`Execution chain ${chain} does not belong to wallet family solana`)
  }
  if (family === 'evm' && chain === 'solana') {
    throw new Error('Execution chain solana does not belong to wallet family evm')
  }
  return {
    family,
    chain,
    index: Number(input.index || 0)
  }
}

function parseArgs (argv) {
  const args = {}
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i]
    if (!token.startsWith('--')) continue
    const key = token.slice(2)
    const next = argv[i + 1]
    if (!next || next.startsWith('--')) {
      args[key] = true
      continue
    }
    args[key] = next
    i += 1
  }
  return args
}

async function fileExists (filePath) {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

function decodeEnvValue (value) {
  const trimmed = value.trim()
  if (!trimmed) return ''
  if (trimmed.startsWith("'") && trimmed.endsWith("'")) {
    return trimmed.slice(1, -1).replace(/'"'"'/g, "'")
  }
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}

async function readEnvMap () {
  if (!(await fileExists(ENV_FILE))) {
    return {}
  }

  const contents = await fs.readFile(ENV_FILE, 'utf8')
  const env = {}
  for (const rawLine of contents.split('\n')) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const index = line.indexOf('=')
    if (index === -1) continue
    const key = line.slice(0, index).trim()
    const value = line.slice(index + 1)
    env[key] = decodeEnvValue(value)
  }
  return env
}

function shellQuote (value) {
  return `'${String(value).replace(/'/g, `'"'"'`)}'`
}

async function writeEnvValue (key, value) {
  const lines = (await fileExists(ENV_FILE))
    ? (await fs.readFile(ENV_FILE, 'utf8')).split('\n')
    : []

  let replaced = false
  const nextLines = lines.map((line) => {
    if (line.startsWith(`${key}=`)) {
      replaced = true
      return `${key}=${shellQuote(value)}`
    }
    return line
  })

  if (!replaced) {
    nextLines.push(`${key}=${shellQuote(value)}`)
  }

  await fs.mkdir(path.dirname(ENV_FILE), { recursive: true })
  await fs.writeFile(ENV_FILE, `${nextLines.filter(Boolean).join('\n')}\n`, { mode: 0o600 })
}

async function ensureRuntimeReady () {
  if (!(await fileExists(path.join(MCP_DIR, 'package.json')))) {
    throw new Error(`WDK MCP runtime not found at ${MCP_DIR}. Run bash {baseDir}/scripts/onboard.sh first.`)
  }
}

function getRuntimeRequire () {
  return createRequire(path.join(MCP_DIR, 'package.json'))
}

async function importFromRuntime (specifier) {
  const runtimeRequire = getRuntimeRequire()
  const resolved = runtimeRequire.resolve(specifier)
  return import(pathToFileURL(resolved).href)
}

async function loadWalletModules () {
  await ensureRuntimeReady()
  const evmModule = await importFromRuntime('@tetherto/wdk-wallet-evm')
  const solanaModule = await importFromRuntime('@tetherto/wdk-wallet-solana')
  return {
    WalletManagerEvm: evmModule.default || evmModule.WalletManagerEvm,
    WalletManagerSolana: solanaModule.default || solanaModule.WalletManagerSolana
  }
}

async function requireSeed () {
  const env = await readEnvMap()
  const seed = env.WDK_SEED
  if (!seed) {
    throw new Error('No local wallet seed is configured. Create or import a wallet first.')
  }
  return seed
}

async function readSelection () {
  if (!(await fileExists(SELECTION_FILE))) {
    return { family: 'evm', chain: 'ethereum-mainnet', index: 0 }
  }
  const raw = JSON.parse(await fs.readFile(SELECTION_FILE, 'utf8'))
  return resolveSelectionInput(raw)
}

async function writeSelection (selection) {
  const next = resolveSelectionInput(selection)
  await fs.mkdir(path.dirname(SELECTION_FILE), { recursive: true })
  await fs.writeFile(SELECTION_FILE, `${JSON.stringify(next, null, 2)}\n`)
  return next
}

async function callChainRegistry (selector, intent = 'read') {
  const baseUrl = normalizeApiBaseUrl()
  const params = new URLSearchParams()
  params.set('intent', intent)
  if (typeof selector.chainId === 'number') {
    params.set('chainId', String(selector.chainId))
  } else if (selector.chainSlug) {
    params.set('chainSlug', selector.chainSlug)
  } else {
    throw new Error('Missing chain selector.')
  }

  const response = await fetch(`${baseUrl}/api/v1/chains/registry?${params.toString()}`, {
    method: 'GET',
    headers: {
      Accept: 'application/json'
    }
  })

  const bodyText = await response.text()
  const body = bodyText ? JSON.parse(bodyText) : null

  if (!response.ok || !body || body.error) {
    const detail = body && (body.message || body.error)
      ? `${body.message || body.error}`
      : `HTTP ${response.status}`
    throw new Error(`Unable to resolve chain from ClawDeFi registry: ${detail}`)
  }

  if (!body.recommendedRpc || !body.recommendedRpc.rpcUrl) {
    throw new Error(`No recommended RPC available for chain ${body.chainSlug || selector.chainSlug || selector.chainId}`)
  }

  return {
    family: 'evm',
    chainSlug: body.chainSlug,
    chainId: body.chainId,
    rpcUrl: body.recommendedRpc.rpcUrl,
    nativeSymbol: body.nativeSymbol || null,
    name: body.name || null,
    raw: body
  }
}

async function resolveExecutionContext (chain, intent = 'read') {
  const normalized = String(chain || '').trim().toLowerCase()
  if (!normalized || normalized === 'solana') {
    return {
      family: 'solana',
      chainSlug: 'solana',
      chainId: null,
      rpcUrl: process.env.CLAWDEFI_SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
      nativeSymbol: 'SOL',
      name: 'Solana'
    }
  }

  const selector = parseChainSelector(normalized)
  return callChainRegistry(selector, intent)
}

async function buildManager (target, seed, options = {}) {
  const { WalletManagerEvm, WalletManagerSolana } = await loadWalletModules()

  if (FAMILY_CONFIG[target]) {
    const managerConfig = FAMILY_CONFIG[normalizeFamily(target)]
    if (managerConfig.managerType === 'evm') {
      return new WalletManagerEvm(seed, managerConfig.config)
    }
    return new WalletManagerSolana(seed, managerConfig.config)
  }

  const execution = await resolveExecutionContext(target, options.intent || 'read')
  if (execution.family === 'solana') {
    return new WalletManagerSolana(seed, {
      rpcUrl: execution.rpcUrl,
      commitment: 'confirmed'
    })
  }

  return new WalletManagerEvm(seed, {
    provider: execution.rpcUrl
  })
}

async function withAccount (target, index, seed, callback, options = {}) {
  const manager = await buildManager(target, seed, options)
  try {
    const account = await manager.getAccount(index)
    return await callback({ manager, account })
  } finally {
    if (typeof manager.dispose === 'function') {
      manager.dispose()
    }
  }
}

async function deriveAddresses (seed, index = 0) {
  const addresses = {}
  for (const family of Object.keys(FAMILY_CONFIG)) {
    addresses[family] = await withAccount(family, index, seed, async ({ account }) => account.getAddress())
  }
  return addresses
}

function getTokenList (args) {
  if (args.tokens) {
    return String(args.tokens)
      .split(',')
      .map((token) => token.trim())
      .filter(Boolean)
  }
  if (args.token) {
    return [String(args.token).trim()]
  }
  return []
}

function parseIndex (value, fallback = 0) {
  const parsed = value == null ? fallback : Number(value)
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`Invalid wallet index: ${value}`)
  }
  return parsed
}

function parseAmountBaseUnits (value) {
  if (value == null) {
    throw new Error('Missing required --amount in base units.')
  }
  if (!/^\d+$/.test(String(value))) {
    throw new Error('Amount must be an integer string in base units.')
  }
  return BigInt(String(value))
}

function parseOptionalBigInt (value, fieldName) {
  if (value == null || value === '') {
    return undefined
  }
  if (!/^\d+$/.test(String(value))) {
    throw new Error(`${fieldName} must be an integer string in base units.`)
  }
  return BigInt(String(value))
}

module.exports = {
  ENV_FILE,
  FAMILY_CONFIG,
  MCP_DIR,
  SELECTION_FILE,
  buildManager,
  callChainRegistry,
  chainToFamily,
  defaultChainForFamily,
  deriveAddresses,
  fail,
  getTokenList,
  loadWalletModules,
  normalizeApiBaseUrl,
  normalizeChain,
  normalizeFamily,
  parseAmountBaseUnits,
  parseArgs,
  parseChainSelector,
  parseIndex,
  parseOptionalBigInt,
  printJson,
  readEnvMap,
  readSelection,
  requireSeed,
  resolveExecutionContext,
  resolveSelectionInput,
  withAccount,
  writeEnvValue,
  writeSelection
}
