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
  normalizeVersion,
  registerDisclaimerConsent
} = require('./disclaimer-common.js')

function parseBooleanFlag (value, fieldName, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback
  if (typeof value === 'boolean') return value
  const raw = String(value).trim().toLowerCase()
  if (raw === 'true' || raw === '1' || raw === 'yes' || raw === 'on') return true
  if (raw === 'false' || raw === '0' || raw === 'no' || raw === 'off') return false
  throw new Error(`--${fieldName} must be true/false.`)
}

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
    const confirmConsent = parseBooleanFlag(args['confirm-consent'], 'confirm-consent', false)
    if (!confirmConsent) {
      throw new Error('wallet_register_consent requires explicit --confirm-consent true.')
    }

    const { walletAddress, selection } = await resolveAddressAndSelection(args)
    if (!walletAddress) {
      throw new Error('Missing wallet address. Provide --wallet/--address or configure a local wallet first.')
    }

    const version = normalizeVersion(args.version)
    const consent = await registerDisclaimerConsent({
      wallet: walletAddress,
      version
    })

    printJson({
      ok: true,
      action: 'wallet_register_consent',
      walletAddress,
      selection,
      consent
    })
  } catch (error) {
    fail(error.message, { action: 'wallet_register_consent' })
  }
})()
