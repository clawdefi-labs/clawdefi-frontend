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
    if (!input.confirmExecute) {
      throw new Error('Execution requires explicit --confirm-execute true.')
    }

    const data = await withWalletContext(args, 'broadcast', async ({ account, address, selection }) => {
      const build = await impl.buildTrade({
        ...input,
        account,
        walletAddress: address
      })

      const approvalSteps = (build.approvalPlan && Array.isArray(build.approvalPlan.steps))
        ? build.approvalPlan.steps
        : []

      const approvals = []
      for (const step of approvalSteps) {
        const txRequest = toWdkTxRequest(step.txRequest)
        const sent = await account.sendTransaction(txRequest)
        approvals.push({
          name: step.name,
          reason: step.reason,
          txRequest: stringifyBigInts(txRequest),
          transaction: stringifyBigInts(sent)
        })
      }

      const submission = await impl.submitBuiltOrder({
        account,
        buildResult: build,
        overrideCreds: input.apiCreds,
        persistApiCreds: input.persistApiCreds
      })

      return {
        wallet: {
          address,
          selection
        },
        build: normalizeBuildOutput(build),
        execution: {
          mode: 'execute',
          approvals,
          submission
        }
      }
    })

    const warnings = [
      ...(data.build.warnings || []),
      ...((data.execution && data.execution.submission && data.execution.submission.warnings) || [])
    ]

    printSuccess({
      module: 'predictions_execute',
      adapter,
      params,
      data,
      warnings
    })
  } catch (error) {
    printFailure('predictions_execute', adapter, params, error)
  }
})()
