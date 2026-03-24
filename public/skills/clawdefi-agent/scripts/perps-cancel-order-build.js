'use strict'

const {
  loadAdapter,
  parseArgs,
  printFailure,
  printSuccess
} = require('./perps-common.js')

const {
  normalizeBuildOutput,
  parseCancelArgs,
  resolveWalletAddress
} = require('./perps-action-helpers.js')

;(async () => {
  const args = parseArgs(process.argv.slice(2))
  const { adapter, impl } = loadAdapter(args.adapter)

  const chain = args.chain || 'base-mainnet'
  const cancel = parseCancelArgs(args)

  const params = {
    adapter,
    chain,
    ...cancel,
    address: args.address || null
  }

  try {
    const walletAddress = await resolveWalletAddress(args)
    const build = await impl.buildCancelOrder({
      chain,
      walletAddress,
      ...cancel
    })

    printSuccess({
      module: 'perps_cancel_order_build',
      adapter,
      params,
      data: normalizeBuildOutput(build),
      warnings: build.warnings || []
    })
  } catch (error) {
    printFailure('perps_cancel_order_build', adapter, params, error)
  }
})()
