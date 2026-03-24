'use strict'

const {
  loadAdapter,
  parseArgs,
  printFailure,
  printSuccess,
  simulateWithWallet
} = require('./perps-common.js')

const {
  parseOpenArgs,
  resolveWalletAddress,
  normalizeBuildOutput
} = require('./perps-action-helpers.js')

;(async () => {
  const args = parseArgs(process.argv.slice(2))
  const { adapter, impl } = loadAdapter(args.adapter)
  const chain = args.chain || 'base-mainnet'
  const open = parseOpenArgs(args)

  const params = {
    adapter,
    chain,
    ...open,
    address: args.address || null
  }

  try {
    const walletAddress = await resolveWalletAddress(args)
    const build = await impl.buildOpen({
      chain,
      walletAddress,
      ...open
    })

    const simulation = await simulateWithWallet(args, build.txRequest, {
      intentHash: build.intentHash,
      action: 'open_order'
    })

    printSuccess({
      module: 'perps_open_simulate',
      adapter,
      params,
      data: {
        build: normalizeBuildOutput(build),
        simulation
      },
      warnings: build.warnings || []
    })
  } catch (error) {
    printFailure('perps_open_simulate', adapter, params, error)
  }
})()
