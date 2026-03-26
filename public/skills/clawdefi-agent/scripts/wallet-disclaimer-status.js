'use strict'

const {
  fail,
  parseArgs,
  parseIndex,
  printJson,
  readSelection,
  requireSeed,
  withAccount
} = require('./wallet-common.js')

const {
  fetchDisclaimerStatus,
  normalizeVersion
} = require('./disclaimer-common.js')

async function resolveAddressAndSelection (args) {
  if (args.wallet || args.address) {
    return {
      walletAddress: String(args.wallet || args.address).trim(),
      selection: null
    }
  }

  const seed = await requireSeed()
  const selection = await readSelection()
  const chain = args.chain || selection.chain
  const index = parseIndex(args.index, selection.index)

  const walletAddress = await withAccount(chain, index, seed, async ({ account }) => account.getAddress(), {
    intent: 'read'
  })

  return {
    walletAddress,
    selection: {
      family: selection.family,
      chain,
      index
    }
  }
}

;(async () => {
  try {
    const args = parseArgs(process.argv.slice(2))
    const { walletAddress, selection } = await resolveAddressAndSelection(args)
    if (!walletAddress) {
      throw new Error('Missing wallet address. Provide --wallet/--address or configure a local wallet first.')
    }

    const version = normalizeVersion(args.version)
    const status = await fetchDisclaimerStatus({
      wallet: walletAddress,
      version
    })

    printJson({
      ok: true,
      action: 'wallet_disclaimer_status',
      walletAddress,
      selection,
      data: status
    })
  } catch (error) {
    fail(error.message, { action: 'wallet_disclaimer_status' })
  }
})()
