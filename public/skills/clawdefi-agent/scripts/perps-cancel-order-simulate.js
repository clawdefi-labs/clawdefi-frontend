'use strict'

const {
  loadAdapter,
  parseArgs,
  printFailure,
  printSuccess,
  simulateWithWallet
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

    const simulation = await simulateWithWallet(args, build.txRequest, {
      intentHash: build.intentHash,
      action: 'cancel_order'
    })

    printSuccess({
      module: 'perps_cancel_order_simulate',
      adapter,
      params,
      data: {
        build: normalizeBuildOutput(build),
        simulation
      },
      warnings: build.warnings || []
    })
  } catch (error) {
    printFailure('perps_cancel_order_simulate', adapter, params, error)
  }
})()
