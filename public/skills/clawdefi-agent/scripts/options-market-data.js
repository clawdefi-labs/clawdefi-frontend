#!/usr/bin/env node
'use strict'

const {
  loadAdapter,
  parseArgs,
  printFailure,
  printSuccess
} = require('./options-common.js')

const {
  parseMarketDataArgs
} = require('./options-action-helpers.js')

;(async () => {
  const args = parseArgs(process.argv.slice(2))
  const { adapter, impl } = loadAdapter(args.adapter)
  const input = parseMarketDataArgs(args)

  const params = {
    adapter,
    ...input
  }

  try {
    const data = await impl.getMarketData(input)
    printSuccess({
      module: 'options_market_data',
      adapter,
      params,
      data,
      warnings: data.warnings || []
    })
  } catch (error) {
    printFailure('options_market_data', adapter, params, error)
  }
})()
