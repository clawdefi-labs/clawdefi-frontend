#!/usr/bin/env node
'use strict'

const {
  loadAdapter,
  parseArgs,
  printFailure,
  printSuccess,
  readSelection,
  resolveWalletAddress
} = require('./yield-common.js')

const {
  parseQuoteInput
} = require('./yield-action-helpers.js')

;(async () => {
  const args = parseArgs(process.argv.slice(2))
  const { adapter, impl } = loadAdapter(args.adapter)

  const selection = await readSelection()
  const input = parseQuoteInput(args, selection.chain)

  const params = {
    adapter,
    chain: input.chainSlug,
    chainId: input.chainId,
    tokensIn: input.tokensIn,
    amountsIn: input.amountsIn,
    tokensOut: input.tokensOut,
    receiver: input.receiver,
    address: input.walletAddress,
    slippage: input.slippage,
    routeIndex: input.routeIndex,
    enableAggregator: input.enableAggregator,
    aggregators: input.aggregators,
    additionalData: input.additionalData
  }

  try {
    if (!input.walletAddress && !input.receiver) {
      const address = await resolveWalletAddress(args)
      input.walletAddress = address
      input.receiver = address
      params.address = address
      params.receiver = address
    } else if (!input.walletAddress && input.receiver) {
      input.walletAddress = input.receiver
      params.address = input.walletAddress
    } else if (!input.receiver && input.walletAddress) {
      input.receiver = input.walletAddress
      params.receiver = input.receiver
    }

    const data = await impl.quoteYield(input)
    const warnings = [
      ...input.warnings,
      ...(data.warnings || [])
    ]

    printSuccess({
      module: 'yield_quote',
      adapter,
      params,
      data,
      warnings
    })
  } catch (error) {
    printFailure('yield_quote', adapter, params, error, input.warnings)
  }
})()
