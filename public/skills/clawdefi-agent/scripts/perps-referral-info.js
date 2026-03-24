'use strict'

const {
  loadAdapter,
  parseArgs,
  printFailure,
  printSuccess
} = require('./perps-common.js')

const {
  resolveWalletAddress
} = require('./perps-action-helpers.js')

;(async () => {
  const args = parseArgs(process.argv.slice(2))
  const { adapter, impl } = loadAdapter(args.adapter)

  const chain = args.chain || 'base-mainnet'
  const params = {
    adapter,
    chain,
    address: args.address || null
  }

  try {
    const walletAddress = await resolveWalletAddress(args)
    const info = await impl.getReferralInfo({
      chain,
      walletAddress
    })

    printSuccess({
      module: 'perps_referral_info',
      adapter,
      params,
      data: info,
      warnings: info.warnings || []
    })
  } catch (error) {
    printFailure('perps_referral_info', adapter, params, error)
  }
})()
