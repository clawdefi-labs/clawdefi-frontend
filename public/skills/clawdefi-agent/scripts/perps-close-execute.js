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
  parseCloseArgs,
  resolveWalletAddress
} = require('./perps-action-helpers.js')

;(async () => {
  const args = parseArgs(process.argv.slice(2))
  const { adapter, impl } = loadAdapter(args.adapter)

  const chain = args.chain || 'base-mainnet'
  const close = parseCloseArgs(args)

  const params = {
    adapter,
    chain,
    ...close,
    address: args.address || null
  }

  try {
    const walletAddress = await resolveWalletAddress(args)
    const build = await impl.buildClose({
      chain,
      walletAddress,
      ...close
    })

    const execution = await executeWithWallet(args, build.txRequest, {
      intentHash: build.intentHash,
      action: 'close_order'
    })

    printSuccess({
      module: 'perps_close_execute',
      adapter,
      params,
      data: {
        build: normalizeBuildOutput(build),
        execution
      },
      warnings: build.warnings || []
    })
  } catch (error) {
    printFailure('perps_close_execute', adapter, params, error)
  }
})()
