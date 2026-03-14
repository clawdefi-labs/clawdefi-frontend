'use strict'

const {
  chainToFamily,
  defaultChainForFamily,
  fail,
  normalizeFamily,
  parseArgs,
  parseIndex,
  printJson,
  readSelection,
  writeSelection
} = require('./wallet-common.js')

;(async () => {
  try {
    const args = parseArgs(process.argv.slice(2))
    const current = await readSelection()
    const family = args.family
      ? normalizeFamily(args.family)
      : args.chain
        ? chainToFamily(args.chain)
        : current.family
    const selection = await writeSelection({
      family,
      chain: args.chain || (family === current.family ? current.chain : defaultChainForFamily(family)),
      index: parseIndex(args.index, current.index)
    })

    printJson({
      ok: true,
      action: 'wallet_select',
      selection
    })
  } catch (error) {
    fail(error.message, { action: 'wallet_select' })
  }
})()
