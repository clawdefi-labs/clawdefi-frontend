#!/usr/bin/env node
'use strict'

const {
  loadAdapter,
  parseArgs,
  printFailure,
  printSuccess
} = require('./lending-common.js')

const {
  normalizeBuildOutput,
  parseActionPayload,
  resolveWalletAddress
} = require('./lending-action-helpers.js')

function toTxPreview (txRequest) {
  if (!txRequest || typeof txRequest !== 'object') {
    return null
  }
  const data = String(txRequest.data || '0x')
  return {
    to: txRequest.to || null,
    value: typeof txRequest.value === 'undefined' || txRequest.value === null
      ? '0'
      : txRequest.value.toString(),
    dataPrefix: data.slice(0, 10),
    dataBytes: data.startsWith('0x') ? Math.max(0, (data.length - 2) / 2) : 0
  }
}

;(async () => {
  const args = parseArgs(process.argv.slice(2))
  const { adapter, impl } = loadAdapter(args.adapter)
  const chain = args.chain || 'base-mainnet'
  const actionPayload = parseActionPayload(args)

  const params = {
    adapter,
    chain,
    ...actionPayload,
    address: args.address || null
  }

  try {
    const walletAddress = await resolveWalletAddress(args)
    const build = await impl.buildAction({
      chain,
      walletAddress,
      ...actionPayload
    })

    const normalized = normalizeBuildOutput(build)
    const txPreview = toTxPreview(normalized.txRequest)
    delete normalized.txRequest

    printSuccess({
      module: 'lending_quote',
      adapter,
      params,
      data: {
        ...normalized,
        txPreview
      },
      warnings: build.warnings || []
    })
  } catch (error) {
    printFailure('lending_quote', adapter, params, error)
  }
})()
