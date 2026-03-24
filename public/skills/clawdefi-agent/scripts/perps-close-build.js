'use strict'

const {
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

    printSuccess({
      module: 'perps_close_build',
      adapter,
      params,
      data: normalizeBuildOutput(build),
      warnings: build.warnings || []
    })
  } catch (error) {
    printFailure('perps_close_build', adapter, params, error)
  }
})()
