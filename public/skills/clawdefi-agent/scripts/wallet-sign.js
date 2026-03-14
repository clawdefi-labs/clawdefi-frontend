'use strict'

const {
  chainToFamily,
  fail,
  normalizeFamily,
  parseArgs,
  parseIndex,
  printJson,
  readSelection,
  requireSeed,
  withAccount
} = require('./wallet-common.js')

;(async () => {
  try {
    const args = parseArgs(process.argv.slice(2))
    const message = args.message
    if (!message) {
      throw new Error('Missing required --message.')
    }

    const seed = await requireSeed()
    const selection = await readSelection()
    const chain = args.chain || selection.chain
    const family = args.family
      ? normalizeFamily(args.family)
      : args.chain
        ? chainToFamily(args.chain)
        : selection.family
    const index = parseIndex(args.index, selection.index)

    const result = await withAccount(family, index, seed, async ({ account }) => {
      const address = await account.getAddress()
      const signature = await account.sign(message)
      const readOnly = await account.toReadOnlyAccount()
      const verified = await readOnly.verify(message, signature)
      return {
        address,
        signature,
        verified
      }
    })

    printJson({
      ok: true,
      action: 'wallet_sign',
      selection: { family, chain: family === 'solana' ? 'solana' : chain, index },
      message,
      ...result
    })
  } catch (error) {
    fail(error.message, { action: 'wallet_sign' })
  }
})()
