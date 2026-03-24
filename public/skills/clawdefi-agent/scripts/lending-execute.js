#!/usr/bin/env node
'use strict'

const {
  executeWithWallet,
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

    const execution = await executeWithWallet(args, build.txRequest, {
      intentHash: build.intentHash,
      action: actionPayload.action
    })

    printSuccess({
      module: 'lending_execute',
      adapter,
      params,
      data: {
        build: normalizeBuildOutput(build),
        execution
      },
      warnings: build.warnings || []
    })
  } catch (error) {
    printFailure('lending_execute', adapter, params, error)
  }
})()
