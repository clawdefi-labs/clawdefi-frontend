#!/usr/bin/env node
'use strict'

const {
  loadAdapter,
  parseArgs,
  parseBooleanFlag,
  printFailure,
  printSuccess,
  stringifyBigInts,
  toWdkTxRequest,
  withWalletContext
} = require('./options-common.js')

const {
  buildOptionsIntent,
  normalizeBuildOutput,
  parseBuildArgs
} = require('./options-action-helpers.js')

;(async () => {
  const args = parseArgs(process.argv.slice(2))
  const { adapter, impl } = loadAdapter(args.adapter)
  const input = parseBuildArgs(args)

  const params = {
    adapter,
    ...input,
    walletAddress: args.address || null,
    confirmExecute: false
  }

  try {
    const confirmExecute = parseBooleanFlag(args['confirm-execute'], 'confirm-execute', false)
    params.confirmExecute = confirmExecute
    if (!confirmExecute) {
      throw new Error('options_execute requires explicit --confirm-execute true.')
    }

    const data = await withWalletContext(args, 'broadcast', async ({ account, address, selection }) => {
      if (args.address && String(args.address).trim().toLowerCase() !== address.toLowerCase()) {
        throw new Error(`--address ${args.address} does not match selected local wallet ${address}.`)
      }

      params.walletAddress = address

      const build = await impl.buildFillPlan({
        ...input,
        walletAddress: address
      })

      const { intent, intentHash } = buildOptionsIntent({
        walletAddress: address,
        order: build.order,
        quote: build.quote,
        plan: build.plan,
        input
      })

      const executedSteps = []
      for (const step of build.plan.steps) {
        const txRequest = toWdkTxRequest(step.txRequest)
        const sent = await account.sendTransaction(txRequest)
        executedSteps.push({
          name: step.name,
          txRequest: stringifyBigInts(txRequest),
          transaction: stringifyBigInts(sent)
        })
      }

      return {
        wallet: {
          address,
          selection
        },
        build: normalizeBuildOutput({
          ...build,
          intent,
          intentHash
        }),
        execution: {
          mode: 'execute',
          steps: executedSteps,
          context: {
            action: 'options_fill_order',
            intentHash
          }
        },
        warnings: build.warnings || []
      }
    })

    printSuccess({
      module: 'options_execute',
      adapter,
      params,
      data: normalizeBuildOutput(data),
      warnings: data.warnings || []
    })
  } catch (error) {
    printFailure('options_execute', adapter, params, error)
  }
})()
