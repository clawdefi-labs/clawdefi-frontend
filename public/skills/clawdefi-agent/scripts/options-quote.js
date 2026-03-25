#!/usr/bin/env node
'use strict'

const {
  loadAdapter,
  parseArgs,
  printFailure,
  printSuccess
} = require('./options-common.js')

const {
  parseQuoteArgs
} = require('./options-action-helpers.js')

;(async () => {
  const args = parseArgs(process.argv.slice(2))
  const { adapter, impl } = loadAdapter(args.adapter)
  const input = parseQuoteArgs(args)

  const params = {
    adapter,
    ...input
  }

  try {
    const data = await impl.quoteFillOrder(input)
    printSuccess({
      module: 'options_quote',
      adapter,
      params,
      data,
      warnings: data.warnings || []
    })
  } catch (error) {
    printFailure('options_quote', adapter, params, error)
  }
})()
