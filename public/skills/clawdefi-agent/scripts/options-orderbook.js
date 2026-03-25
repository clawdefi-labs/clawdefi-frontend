#!/usr/bin/env node
'use strict'

const {
  loadAdapter,
  parseArgs,
  printFailure,
  printSuccess
} = require('./options-common.js')

const {
  parseOrderbookArgs
} = require('./options-action-helpers.js')

;(async () => {
  const args = parseArgs(process.argv.slice(2))
  const { adapter, impl } = loadAdapter(args.adapter)
  const input = parseOrderbookArgs(args)

  const params = {
    adapter,
    ...input
  }

  try {
    const data = await impl.listOrderbook(input)
    printSuccess({
      module: 'options_orderbook',
      adapter,
      params,
      data,
      warnings: []
    })
  } catch (error) {
    printFailure('options_orderbook', adapter, params, error)
  }
})()
