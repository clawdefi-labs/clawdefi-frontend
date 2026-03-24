'use strict'

const {
  loadAdapter,
  parseArgs,
  printFailure,
  printSuccess
} = require('./predictions-common.js')

const {
  parseDiscoveryArgs
} = require('./predictions-action-helpers.js')

;(async () => {
  const args = parseArgs(process.argv.slice(2))
  const { adapter, impl } = loadAdapter(args.adapter)

  const input = parseDiscoveryArgs(args)
  const params = {
    adapter,
    ...input
  }

  try {
    const data = await impl.discoverMarkets(input)
    printSuccess({
      module: 'predictions_markets',
      adapter,
      params,
      data,
      warnings: data.warnings || []
    })
  } catch (error) {
    printFailure('predictions_markets', adapter, params, error)
  }
})()
