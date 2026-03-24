#!/usr/bin/env node
'use strict'

const {
  callSwapApi,
  normalizeAdapter,
  parseArgs,
  printFailure,
  printSuccess
} = require('./swap-common.js')

const {
  buildSwapPayload,
  parseSwapArgs
} = require('./swap-action-helpers.js')

;(async () => {
  const args = parseArgs(process.argv.slice(2))
  const adapter = normalizeAdapter(args.adapter)
  const swap = parseSwapArgs(args, args.chain || 'base-mainnet')
  const walletAddress = args['wallet-address'] ? String(args['wallet-address']).trim() : null
  const payload = buildSwapPayload(swap, walletAddress)

  const params = {
    adapter,
    ...payload
  }

  try {
    const quote = await callSwapApi('quote', payload)
    printSuccess({
      module: 'swap_quote',
      adapter,
      params,
      data: quote,
      warnings: Array.isArray(quote?.data?.warnings) ? quote.data.warnings : []
    })
  } catch (error) {
    printFailure('swap_quote', adapter, params, error)
  }
})()

