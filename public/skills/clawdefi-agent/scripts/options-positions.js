#!/usr/bin/env node
'use strict'

const {
  loadAdapter,
  parseArgs,
  printFailure,
  printSuccess,
  resolveWalletAddress
} = require('./options-common.js')

const {
  parsePositionsArgs
} = require('./options-action-helpers.js')

;(async () => {
  const args = parseArgs(process.argv.slice(2))
  const { adapter, impl } = loadAdapter(args.adapter)
  const input = parsePositionsArgs(args)

  const params = {
    adapter,
    ...input
  }

  try {
    if (!input.address) {
      input.address = await resolveWalletAddress(args)
      params.address = input.address
    }

    const data = await impl.getPositions(input)
    printSuccess({
      module: 'options_positions',
      adapter,
      params,
      data,
      warnings: []
    })
  } catch (error) {
    printFailure('options_positions', adapter, params, error)
  }
})()
