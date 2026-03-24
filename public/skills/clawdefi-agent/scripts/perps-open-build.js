'use strict'

const {
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

    printSuccess({
      module: 'perps_open_build',
      adapter,
      params,
      data: normalizeBuildOutput(build),
      warnings: build.warnings || []
    })
  } catch (error) {
    printFailure('perps_open_build', adapter, params, error)
  }
})()
