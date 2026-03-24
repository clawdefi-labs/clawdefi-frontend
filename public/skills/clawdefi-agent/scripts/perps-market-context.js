'use strict'

const {
  loadAdapter,
  parseArgs,
  parseStrictString,
  printFailure,
  printSuccess
} = require('./perps-common.js')

;(async () => {
  const args = parseArgs(process.argv.slice(2))
  const { adapter, impl } = loadAdapter(args.adapter)

  const chain = args.chain || 'base-mainnet'
  const market = parseStrictString(args.market || args.pair, 'market')
  const params = { adapter, chain, market }

  try {
    const context = await impl.marketContext({ chain, market })
    printSuccess({
      module: 'perps_market_context',
      adapter,
      params,
      data: context,
      warnings: context.warnings || []
    })
  } catch (error) {
    printFailure('perps_market_context', adapter, params, error)
  }
})()
