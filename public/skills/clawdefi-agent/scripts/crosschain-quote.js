#!/usr/bin/env node
'use strict'

const {
  callCrosschainApi,
  normalizeAdapter,
  parseArgs,
  printFailure,
  printSuccess
} = require('./crosschain-common.js')

const {
  buildCrosschainPayload,
  parseCrosschainArgs
} = require('./crosschain-action-helpers.js')

;(async () => {
  const args = parseArgs(process.argv.slice(2))
  const adapter = normalizeAdapter(args.adapter)
  const crosschain = parseCrosschainArgs(
    args,
    args.chain || args['source-chain'] || 'base-mainnet',
    args['destination-chain'] || 'ethereum-mainnet'
  )
  const walletAddress = args['wallet-address'] ? String(args['wallet-address']).trim() : null
  const payload = buildCrosschainPayload(crosschain, walletAddress, adapter)

  const params = {
    adapter,
    ...payload
  }

  try {
    const quote = await callCrosschainApi('POST', '/api/v1/crosschain/quote', payload)
    printSuccess({
      module: 'crosschain_quote',
      adapter,
      params,
      data: quote,
      warnings: Array.isArray(quote?.data?.warnings) ? quote.data.warnings : []
    })
  } catch (error) {
    printFailure('crosschain_quote', adapter, params, error)
  }
})()
