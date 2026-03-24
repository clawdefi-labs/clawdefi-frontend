'use strict'

const {
  fail,
  normalizeApiBaseUrl,
  parseArgs,
  parseIndex,
  printJson,
  readSelection,
  requireSeed,
  withAccount
} = require('./wallet-common.js')

async function resolveAddressAndSelection (args) {
  if (args.address) {
    return {
      address: String(args.address).trim(),
      selection: null
    }
  }

  const seed = await requireSeed()
  const selection = await readSelection()
  const chain = args.chain || selection.chain
  const index = parseIndex(args.index, selection.index)

  const address = await withAccount(chain, index, seed, async ({ account }) => account.getAddress(), {
    intent: 'read'
  })

  return {
    address,
    selection: {
      family: selection.family,
      chain,
      index
    }
  }
}

function normalizeChainsArg (value) {
  if (!value) {
    return null
  }
  const normalized = String(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
  return normalized.length > 0 ? normalized.join(',') : null
}

;(async () => {
  try {
    const args = parseArgs(process.argv.slice(2))
    const baseUrl = normalizeApiBaseUrl()
    const { address, selection } = await resolveAddressAndSelection(args)

    if (!address) {
      throw new Error('Missing wallet address. Provide --address or configure a local wallet first.')
    }

    const query = new URLSearchParams({ address })
    const chains = normalizeChainsArg(args.chains || args.chain)
    if (chains) {
      query.set('chains', chains)
    }

    const response = await fetch(`${baseUrl}/api/v1/wallets/portfolio/total?${query.toString()}`, {
      method: 'GET',
      headers: {
        Accept: 'application/json'
      }
    })

    const bodyText = await response.text()
    const body = bodyText ? JSON.parse(bodyText) : null

    if (!response.ok || !body || body.error) {
      const detail = body && (body.message || body.error)
        ? String(body.message || body.error)
        : `HTTP ${response.status}`
      throw new Error(`wallet_total_portfolio_failed: ${detail}`)
    }

    printJson({
      ok: true,
      action: 'wallet_total_portfolio',
      walletAddress: address,
      selection,
      data: body
    })
  } catch (error) {
    fail(error.message, { action: 'wallet_total_portfolio' })
  }
})()
