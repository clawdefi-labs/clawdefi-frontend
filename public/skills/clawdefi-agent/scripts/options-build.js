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
  buildOptionsIntent,
  normalizeBuildOutput,
  parseBuildArgs
} = require('./options-action-helpers.js')

;(async () => {
  const args = parseArgs(process.argv.slice(2))
  const { adapter, impl } = loadAdapter(args.adapter)
  const input = parseBuildArgs(args)

  const params = {
    adapter,
    ...input,
    walletAddress: args.address || null
  }

  try {
    const walletAddress = await resolveWalletAddress(args)
    params.walletAddress = walletAddress

    const build = await impl.buildFillPlan({
      ...input,
      walletAddress
    })

    const { intent, intentHash } = buildOptionsIntent({
      walletAddress,
      order: build.order,
      quote: build.quote,
      plan: build.plan,
      input
    })

    printSuccess({
      module: 'options_build',
      adapter,
      params,
      data: normalizeBuildOutput({
        wallet: {
          address: walletAddress,
          chain: input.chain
        },
        build,
        intent,
        intentHash
      }),
      warnings: build.warnings || []
    })
  } catch (error) {
    printFailure('options_build', adapter, params, error)
  }
})()
