'use strict'

const {
  loadAdapter,
  parseArgs,
  printFailure,
  printSuccess
} = require('./perps-common.js')

const {
  parseOpenArgs
} = require('./perps-action-helpers.js')

;(async () => {
  const args = parseArgs(process.argv.slice(2))
  const { adapter, impl } = loadAdapter(args.adapter)

  const chain = args.chain || 'base-mainnet'
  const open = parseOpenArgs(args)
  const params = {
    adapter,
    chain,
    ...open
  }

  try {
    const quote = await impl.quoteOpen({
      chain,
      market: open.market,
      side: open.side,
      collateralUsd: open.collateralUsd,
      leverage: open.leverage
    })

    printSuccess({
      module: 'perps_open_quote',
      adapter,
      params,
      data: quote,
      warnings: quote.warnings || []
    })
  } catch (error) {
    printFailure('perps_open_quote', adapter, params, error)
  }
})()
