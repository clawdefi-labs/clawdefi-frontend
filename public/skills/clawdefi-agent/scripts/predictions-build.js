'use strict'

const {
  loadAdapter,
  parseArgs,
  printFailure,
  printSuccess,
  withWalletContext
} = require('./predictions-common.js')

const {
  normalizeBuildOutput,
  parseTradeArgs
} = require('./predictions-action-helpers.js')

;(async () => {
  const args = parseArgs(process.argv.slice(2))
  const { adapter, impl } = loadAdapter(args.adapter)
  args.adapter = adapter

  const input = parseTradeArgs(args, { requireOrderParams: true })
  const params = {
    adapter,
    ...input,
    apiCreds: input.apiCreds ? '[provided]' : null
  }

  try {
    const data = await withWalletContext(args, 'read', async ({ account, address, selection }) => {
      const build = await impl.buildTrade({
        ...input,
        account,
        walletAddress: address
      })

      return {
        wallet: {
          address,
          selection
        },
        build: normalizeBuildOutput(build)
      }
    })

    printSuccess({
      module: 'predictions_build',
      adapter,
      params,
      data,
      warnings: data.build.warnings || []
    })
  } catch (error) {
    printFailure('predictions_build', adapter, params, error)
  }
})()
