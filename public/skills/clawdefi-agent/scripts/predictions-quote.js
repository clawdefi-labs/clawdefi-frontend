'use strict'

const {
  loadAdapter,
  parseArgs,
  printFailure,
  printSuccess
} = require('./predictions-common.js')

const {
  parseTradeArgs
} = require('./predictions-action-helpers.js')

;(async () => {
  const args = parseArgs(process.argv.slice(2))
  const { adapter, impl } = loadAdapter(args.adapter)

  const input = parseTradeArgs(args, { requireOrderParams: false })
  const params = {
    adapter,
    ...input
  }

  try {
    const data = await impl.quoteTrade(input)
    printSuccess({
      module: 'predictions_quote',
      adapter,
      params,
      data,
      warnings: data.warnings || []
    })
  } catch (error) {
    printFailure('predictions_quote', adapter, params, error)
  }
})()
