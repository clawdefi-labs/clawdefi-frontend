'use strict'

const {
  loadAdapter,
  parseArgs,
  printFailure,
  printSuccess,
  stringifyBigInts,
  toWdkTxRequest,
  withWalletContext
} = require('./predictions-common.js')

const {
  normalizeBuildOutput,
  parseTradeArgs
} = require('./predictions-action-helpers.js')

;(async () => {
  const args = parseArgs(process.argv.slice(2))
  const { adapter, impl } = loadAdapter(args.adapter)

  const input = parseTradeArgs(args, { requireOrderParams: true })
  const params = {
    adapter,
    ...input,
    apiCreds: input.apiCreds ? '[provided]' : null
  }

  try {
    const data = await withWalletContext(args, 'simulate', async ({ account, address, selection }) => {
      const build = await impl.buildTrade({
        ...input,
        account,
        walletAddress: address
      })

      const approvalSteps = (build.approvalPlan && Array.isArray(build.approvalPlan.steps))
        ? build.approvalPlan.steps
        : []

      const approvalSimulations = []
      for (const step of approvalSteps) {
        const txRequest = toWdkTxRequest(step.txRequest)
        const quote = await account.quoteSendTransaction(txRequest)
        approvalSimulations.push({
          name: step.name,
          reason: step.reason,
          txRequest: stringifyBigInts(txRequest),
          simulation: stringifyBigInts(quote)
        })
      }

      return {
        wallet: {
          address,
          selection
        },
        build: normalizeBuildOutput(build),
        simulation: {
          mode: 'simulate',
          approvalSteps: approvalSimulations,
          submission: {
            offchain: true,
            action: 'post_order',
            note: 'CLOB order submission is off-chain and not simulated via wallet quote path.'
          }
        }
      }
    })

    printSuccess({
      module: 'predictions_simulate',
      adapter,
      params,
      data,
      warnings: data.build.warnings || []
    })
  } catch (error) {
    printFailure('predictions_simulate', adapter, params, error)
  }
})()
