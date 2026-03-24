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
  parseReferralCode,
  resolveWalletAddress
} = require('./perps-action-helpers.js')

;(async () => {
  const args = parseArgs(process.argv.slice(2))
  const { adapter, impl } = loadAdapter(args.adapter)
  const chain = args.chain || 'base-mainnet'
  const referralCode = parseReferralCode(args)

  const params = {
    adapter,
    chain,
    referralCode,
    address: args.address || null
  }

  try {
    const walletAddress = await resolveWalletAddress(args)
    const build = await impl.buildSetReferralCode({
      chain,
      walletAddress,
      referralCode
    })

    const execution = await executeWithWallet(args, build.txRequest, {
      intentHash: build.intentHash,
      action: 'set_referral_code'
    })

    printSuccess({
      module: 'perps_referral_bind_execute',
      adapter,
      params,
      data: {
        build: normalizeBuildOutput(build),
        execution
      },
      warnings: build.warnings || []
    })
  } catch (error) {
    printFailure('perps_referral_bind_execute', adapter, params, error)
  }
})()
