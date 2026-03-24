'use strict'

const {
  loadAdapter,
  parseArgs,
  printFailure,
  printSuccess
} = require('./perps-common.js')

const {
  normalizeBuildOutput,
  parseModifyArgs,
  resolveWalletAddress
} = require('./perps-action-helpers.js')

;(async () => {
  const args = parseArgs(process.argv.slice(2))
  const { adapter, impl } = loadAdapter(args.adapter)

  const chain = args.chain || 'base-mainnet'
  const modify = parseModifyArgs(args)

  const params = {
    adapter,
    chain,
    ...modify,
    address: args.address || null
  }

  try {
    const walletAddress = await resolveWalletAddress(args)
    const build = await impl.buildModifyPosition({
      chain,
      walletAddress,
      ...modify
    })

    printSuccess({
      module: 'perps_modify_position_build',
      adapter,
      params,
      data: normalizeBuildOutput(build),
      warnings: build.warnings || []
    })
  } catch (error) {
    printFailure('perps_modify_position_build', adapter, params, error)
  }
})()
