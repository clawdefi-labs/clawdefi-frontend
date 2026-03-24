'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { createRequire } = require('node:module')

const {
  MCP_DIR,
  callChainRegistry,
  parseChainSelector
} = require('./wallet-common.js')

const {
  computeIntentHash,
  normalizeChainForLending
} = require('./lending-common.js')

const AAVE_V3_MARKETS_BY_CHAIN_ID = {
  1: {
    chainSlug: 'ethereum-mainnet',
    chainName: 'Ethereum',
    pool: '0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2',
    poolAddressesProvider: '0x2f39d218133AFaB8F2B819B1066c7E434Ad94E9e',
    uiPoolDataProvider: '0x3F78BBD206e4D3c504Eb854232EdA7e47E9Fd8FC',
    oracle: '0x54586bE62E3c3580375aE3723C145253060Ca0C2'
  },
  8453: {
    chainSlug: 'base-mainnet',
    chainName: 'Base',
    pool: '0xA238Dd80C259a72e81d7e4664a9801593F98d1c5',
    poolAddressesProvider: '0xe20fCBdBfFC4Dd138cE8b2E6FBb6CB49777ad64D',
    uiPoolDataProvider: '0x68100bD5345eA474D93577127C11F39FF8463e93',
    oracle: '0x2Cc0Fc26eD4563A5ce5e8bdcfe1A2878676Ae156'
  },
  42161: {
    chainSlug: 'arbitrum-one',
    chainName: 'Arbitrum',
    pool: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
    poolAddressesProvider: '0xa97684ead0e402dC232d5A977953DF7ECBaB3CDb',
    uiPoolDataProvider: '0x5c5228aC8BC1528482514aF3e27E692495148717',
    oracle: '0xb56c2F0B653B2e0b10C9b928C8580Ac5Df02C7C7'
  },
  10: {
    chainSlug: 'optimism-mainnet',
    chainName: 'Optimism',
    pool: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
    poolAddressesProvider: '0xa97684ead0e402dC232d5A977953DF7ECBaB3CDb',
    uiPoolDataProvider: '0xE92cd6164CE7DC68e740765BC1f2a091B6CBc3e4',
    oracle: '0xD81eb3728a631871a7eBBaD631b5f424909f0c77'
  },
  137: {
    chainSlug: 'polygon-pos',
    chainName: 'Polygon',
    pool: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
    poolAddressesProvider: '0xa97684ead0e402dC232d5A977953DF7ECBaB3CDb',
    uiPoolDataProvider: '0x68100bD5345eA474D93577127C11F39FF8463e93',
    oracle: '0xb023e699F5a33916Ea823A16485e259257cA8Bd1'
  },
  43114: {
    chainSlug: 'avax-mainnet',
    chainName: 'Avalanche',
    pool: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
    poolAddressesProvider: '0xa97684ead0e402dC232d5A977953DF7ECBaB3CDb',
    uiPoolDataProvider: '0x50B4a66bF4D41e6252540eA7427D7A933Bc3c088',
    oracle: '0xEBd36016B3eD09D4693Ed4251c67Bd858c3c7C9C'
  },
  56: {
    chainSlug: 'bnb-smart-chain',
    chainName: 'BNB Smart Chain',
    pool: '0x6807dc923806fE8Fd134338EABCA509979a7e0cB',
    poolAddressesProvider: '0xff75B6da14FfbbfD355Daf7a2731456b3562Ba6D',
    uiPoolDataProvider: '0xc0179321f0825c3e0F59Fe7Ca4E40557b97797a3',
    oracle: '0x39bc1bfDa2130d6Bb6DBEfd366939b4c7aa7C697'
  }
}

const CHAIN_ID_BY_SLUG = {
  'ethereum-mainnet': 1,
  'base-mainnet': 8453,
  'arbitrum-one': 42161,
  'optimism-mainnet': 10,
  'polygon-pos': 137,
  'avax-mainnet': 43114,
  'bnb-smart-chain': 56
}

const CHAIN_RPC_FALLBACKS = {
  'ethereum-mainnet': process.env.CLAWDEFI_EVM_RPC_URL || 'https://rpc.mevblocker.io/fast',
  'base-mainnet': process.env.CLAWDEFI_BASE_RPC_URL || 'https://mainnet.base.org',
  'arbitrum-one': process.env.CLAWDEFI_ARBITRUM_RPC_URL || 'https://arb1.arbitrum.io/rpc',
  'optimism-mainnet': process.env.CLAWDEFI_OPTIMISM_RPC_URL || 'https://mainnet.optimism.io',
  'polygon-pos': process.env.CLAWDEFI_POLYGON_RPC_URL || 'https://polygon-rpc.com',
  'avax-mainnet': process.env.CLAWDEFI_AVAX_RPC_URL || 'https://api.avax.network/ext/bc/C/rpc',
  'bnb-smart-chain': process.env.CLAWDEFI_BSC_RPC_URL || 'https://bsc-dataseed.binance.org'
}

const POOL_ABI = [
  'function supply(address,uint256,address,uint16)',
  'function withdraw(address,uint256,address) returns (uint256)',
  'function borrow(address,uint256,uint256,uint16,address)',
  'function repay(address,uint256,uint256,address) returns (uint256)',
  'function setUserUseReserveAsCollateral(address,bool)',
  'function setUserEMode(uint8)',
  'function getUserAccountData(address) view returns (uint256,uint256,uint256,uint256,uint256,uint256)'
]

const ERC20_ABI = [
  'function allowance(address,address) view returns (uint256)',
  'function balanceOf(address) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)'
]

function normalizeAddressOrThrow (ethersLib, value, fieldName) {
  const parsed = String(value || '').trim()
  if (!parsed || !ethersLib.isAddress(parsed)) {
    throw new Error(`${fieldName} must be a valid address.`)
  }
  return ethersLib.getAddress(parsed)
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

function getEthers () {
  const runtimeRequire = getRuntimeRequire()
  try {
    return runtimeRequire('ethers')
  } catch {
    throw new Error(
      `ethers is not installed in local runtime (${MCP_DIR}). Run bash {baseDir}/scripts/onboard.sh again.`
    )
  }
}

async function resolveChainContext (chain, intent = 'read') {
  const normalized = normalizeChainForLending(chain)

  if (/^\d+$/.test(normalized)) {
    const chainId = Number(normalized)
    const market = AAVE_V3_MARKETS_BY_CHAIN_ID[chainId]
    if (!market) {
      throw new Error(`Aave adapter does not support chainId ${chainId}.`)
    }
    return {
      chainId,
      chainSlug: market.chainSlug,
      rpcUrl: CHAIN_RPC_FALLBACKS[market.chainSlug],
      market
    }
  }

  const selector = parseChainSelector(normalized)
  if (selector) {
    try {
      const resolved = await callChainRegistry(selector, intent)
      const market = AAVE_V3_MARKETS_BY_CHAIN_ID[resolved.chainId]
      if (!market) {
        throw new Error(`Aave adapter does not support chainId ${resolved.chainId}.`)
      }
      return {
        chainId: resolved.chainId,
        chainSlug: market.chainSlug,
        rpcUrl: resolved.rpcUrl,
        market
      }
    } catch {
      // fallback below
    }
  }

  const fallbackChainId = CHAIN_ID_BY_SLUG[normalized]
  if (!fallbackChainId) {
    throw new Error(`Unsupported chain for Aave adapter: ${normalized || '(empty)'}`)
  }

  const market = AAVE_V3_MARKETS_BY_CHAIN_ID[fallbackChainId]
  return {
    chainId: fallbackChainId,
    chainSlug: market.chainSlug,
    rpcUrl: CHAIN_RPC_FALLBACKS[market.chainSlug],
    market
  }
}

function makeProvider (ethersLib, rpcUrl, chainId) {
  return new ethersLib.JsonRpcProvider(rpcUrl, chainId)
}

async function getAccountDataSnapshot (poolContract, walletAddress) {
  const data = await poolContract.getUserAccountData(walletAddress)
  return {
    totalCollateralBase: data[0],
    totalDebtBase: data[1],
    availableBorrowsBase: data[2],
    currentLiquidationThreshold: data[3],
    ltv: data[4],
    healthFactor: data[5]
  }
}

async function listMarkets ({ chain = '', walletAddress = null }) {
  if (!chain) {
    return {
      protocol: 'aave-v3',
      adapter: 'aave',
      supportedChains: Object.values(AAVE_V3_MARKETS_BY_CHAIN_ID).map((entry) => ({
        chainSlug: entry.chainSlug,
        chainName: entry.chainName,
        pool: entry.pool,
        poolAddressesProvider: entry.poolAddressesProvider,
        uiPoolDataProvider: entry.uiPoolDataProvider,
        oracle: entry.oracle
      })),
      warnings: []
    }
  }

  const ethersLib = getEthers()
  const resolved = await resolveChainContext(chain, 'read')
  const provider = makeProvider(ethersLib, resolved.rpcUrl, resolved.chainId)
  const poolContract = new ethersLib.Contract(resolved.market.pool, POOL_ABI, provider)

  let accountData = null
  if (walletAddress) {
    const wallet = normalizeAddressOrThrow(ethersLib, walletAddress, 'walletAddress')
    accountData = await getAccountDataSnapshot(poolContract, wallet)
  }

  return {
    protocol: 'aave-v3',
    adapter: 'aave',
    chainId: resolved.chainId,
    chainSlug: resolved.chainSlug,
    chainName: resolved.market.chainName,
    rpcUrl: resolved.rpcUrl,
    market: {
      pool: resolved.market.pool,
      poolAddressesProvider: resolved.market.poolAddressesProvider,
      uiPoolDataProvider: resolved.market.uiPoolDataProvider,
      oracle: resolved.market.oracle
    },
    accountData,
    warnings: []
  }
}

async function buildAction (input) {
  const ethersLib = getEthers()

  const action = String(input.action || '').trim().toLowerCase()
  const walletAddress = normalizeAddressOrThrow(ethersLib, input.walletAddress, 'walletAddress')
  const resolved = await resolveChainContext(input.chain, 'broadcast')

  const provider = makeProvider(ethersLib, resolved.rpcUrl, resolved.chainId)
  const poolContract = new ethersLib.Contract(resolved.market.pool, POOL_ABI, provider)

  const warnings = []
  let txRequest = null
  let metadata = {}

  if (action === 'supply' || action === 'withdraw' || action === 'borrow' || action === 'repay') {
    const token = normalizeAddressOrThrow(ethersLib, input.token, 'token')
    const amount = typeof input.amount === 'bigint' ? input.amount : BigInt(input.amount || 0)
    if (amount <= 0n) {
      throw new Error('amount must be > 0 (base units).')
    }

    if (action === 'supply') {
      const onBehalfOf = input.onBehalfOf
        ? normalizeAddressOrThrow(ethersLib, input.onBehalfOf, 'onBehalfOf')
        : walletAddress
      txRequest = {
        to: resolved.market.pool,
        data: poolContract.interface.encodeFunctionData('supply', [token, amount, onBehalfOf, 0]),
        value: 0n
      }
      metadata = { token, amount, onBehalfOf }
    }

    if (action === 'withdraw') {
      const to = input.to
        ? normalizeAddressOrThrow(ethersLib, input.to, 'to')
        : walletAddress
      txRequest = {
        to: resolved.market.pool,
        data: poolContract.interface.encodeFunctionData('withdraw', [token, amount, to]),
        value: 0n
      }
      metadata = { token, amount, to }
    }

    if (action === 'borrow') {
      const onBehalfOf = input.onBehalfOf
        ? normalizeAddressOrThrow(ethersLib, input.onBehalfOf, 'onBehalfOf')
        : walletAddress
      txRequest = {
        to: resolved.market.pool,
        data: poolContract.interface.encodeFunctionData('borrow', [token, amount, 2, 0, onBehalfOf]),
        value: 0n
      }
      metadata = { token, amount, rateMode: 2, onBehalfOf }
    }

    if (action === 'repay') {
      const onBehalfOf = input.onBehalfOf
        ? normalizeAddressOrThrow(ethersLib, input.onBehalfOf, 'onBehalfOf')
        : walletAddress
      txRequest = {
        to: resolved.market.pool,
        data: poolContract.interface.encodeFunctionData('repay', [token, amount, 2, onBehalfOf]),
        value: 0n
      }
      metadata = { token, amount, rateMode: 2, onBehalfOf }
    }

    if (action === 'supply' || action === 'repay') {
      const tokenContract = new ethersLib.Contract(token, ERC20_ABI, provider)
      const [allowance, balance] = await Promise.all([
        tokenContract.allowance(walletAddress, resolved.market.pool),
        tokenContract.balanceOf(walletAddress)
      ])

      metadata.allowance = allowance
      metadata.balance = balance

      if (allowance < amount) {
        warnings.push(
          {
            code: 'insufficient_allowance',
            message: `Allowance ${allowance.toString()} is below required amount ${amount.toString()}. Approve token spending before execute.`,
            remediation: `node {baseDir}/scripts/wallet-token-allowance-set.js --chain ${resolved.chainSlug} --token ${token} --spender ${resolved.market.pool} --amount ${amount.toString()}`
          }
        )
      }

      if (balance < amount) {
        warnings.push(
          {
            code: 'insufficient_balance',
            message: `Token balance ${balance.toString()} is below requested amount ${amount.toString()}.`
          }
        )
      }
    }
  } else if (action === 'set-collateral') {
    const token = normalizeAddressOrThrow(ethersLib, input.token, 'token')
    const useAsCollateral = Boolean(input.useAsCollateral)
    txRequest = {
      to: resolved.market.pool,
      data: poolContract.interface.encodeFunctionData('setUserUseReserveAsCollateral', [token, useAsCollateral]),
      value: 0n
    }
    metadata = { token, useAsCollateral }
  } else if (action === 'set-emode') {
    const categoryId = Number(input.categoryId)
    if (!Number.isInteger(categoryId) || categoryId < 0 || categoryId > 255) {
      throw new Error('categoryId must be an integer between 0 and 255.')
    }
    txRequest = {
      to: resolved.market.pool,
      data: poolContract.interface.encodeFunctionData('setUserEMode', [categoryId]),
      value: 0n
    }
    metadata = { categoryId }
  } else {
    throw new Error(`Unsupported lending action: ${action}`)
  }

  const accountData = await getAccountDataSnapshot(poolContract, walletAddress)

  const intent = {
    intentVersion: 'lending.intent.v1',
    protocolSlug: 'aave',
    chainSlug: resolved.chainSlug,
    action,
    wallet: {
      walletAddress
    },
    params: {
      ...metadata
    },
    policy: {
      category: 'lending',
      amountBaseUnits: typeof metadata.amount === 'bigint' ? metadata.amount.toString() : '0'
    },
    createdAt: new Date().toISOString(),
    metadata: {
      sourceTool: 'lending_build',
      adapter: 'aave'
    }
  }

  return {
    protocol: 'aave-v3',
    adapter: 'aave',
    chainId: resolved.chainId,
    chainSlug: resolved.chainSlug,
    chainName: resolved.market.chainName,
    rpcUrl: resolved.rpcUrl,
    market: {
      pool: resolved.market.pool,
      poolAddressesProvider: resolved.market.poolAddressesProvider,
      uiPoolDataProvider: resolved.market.uiPoolDataProvider,
      oracle: resolved.market.oracle
    },
    accountData,
    txRequest,
    intent,
    intentHash: computeIntentHash(intent),
    warnings
  }
}

module.exports = {
  slug: 'aave',
  listMarkets,
  buildAction
}
