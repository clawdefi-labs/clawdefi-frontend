'use strict'

const {
  loadAdapter,
  parseArgs,
  printFailure,
  printSuccess
} = require('./perps-common.js')

const {
  normalizeBuildOutput,
  parseRiskArgs,
  resolveWalletAddress
} = require('./perps-action-helpers.js')

;(async () => {
  const args = parseArgs(process.argv.slice(2))
  const { adapter, impl } = loadAdapter(args.adapter)

  const chain = args.chain || 'base-mainnet'
  const risk = parseRiskArgs(args)

  const params = {
    adapter,
    chain,
    ...risk,
    address: args.address || null
  }

  try {
    const walletAddress = await resolveWalletAddress(args)
    const build = await impl.buildRiskOrders({
      chain,
      walletAddress,
      ...risk
    })

    printSuccess({
      module: 'perps_risk_orders_build',
      adapter,
      params,
      data: normalizeBuildOutput(build),
      warnings: build.warnings || []
    })
  } catch (error) {
    printFailure('perps_risk_orders_build', adapter, params, error)
  }
})()
