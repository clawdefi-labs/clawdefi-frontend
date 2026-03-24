'use strict'

const {
  loadAdapter,
  parseArgs,
  printFailure,
  printSuccess
} = require('./perps-common.js')

const {
  parseCloseArgs,
  resolveWalletAddress
} = require('./perps-action-helpers.js')

;(async () => {
  const args = parseArgs(process.argv.slice(2))
  const { adapter, impl } = loadAdapter(args.adapter)

  const chain = args.chain || 'base-mainnet'
  const close = parseCloseArgs(args)

  const params = {
    adapter,
    chain,
    ...close,
    address: args.address || null
  }

  try {
    const walletAddress = await resolveWalletAddress(args)
    const quote = await impl.quoteClose({
      chain,
      walletAddress,
      ...close
    })

    printSuccess({
      module: 'perps_close_quote',
      adapter,
      params,
      data: quote,
      warnings: quote.warnings || []
    })
  } catch (error) {
    printFailure('perps_close_quote', adapter, params, error)
  }
})()
