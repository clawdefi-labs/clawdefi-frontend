'use strict'

const {
  executeWithWallet,
  loadAdapter,
  parseArgs,
  printFailure,
  printSuccess
} = require('./perps-common.js')

const {
  normalizeBuildOutput,
  parseOpenArgs,
  resolveWalletAddress
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

    const execution = await executeWithWallet(args, build.txRequest, {
      intentHash: build.intentHash,
      action: 'open_order'
    })

    printSuccess({
      module: 'perps_open_execute',
      adapter,
      params,
      data: {
        build: normalizeBuildOutput(build),
        execution
      },
      warnings: build.warnings || []
    })
  } catch (error) {
    printFailure('perps_open_execute', adapter, params, error)
  }
})()
