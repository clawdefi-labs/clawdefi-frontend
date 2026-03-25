#!/usr/bin/env node
'use strict'

const {
  loadAdapter,
  parseArgs,
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
    walletAddress: args.address || null
  }

  try {
    const data = await withWalletContext(args, 'simulate', async ({ account, address, selection }) => {
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

      const simulatedSteps = []
      for (const step of build.plan.steps) {
        const txRequest = toWdkTxRequest(step.txRequest)
        const simulation = await account.quoteSendTransaction(txRequest)
        simulatedSteps.push({
          name: step.name,
          txRequest: stringifyBigInts(txRequest),
          simulation: stringifyBigInts(simulation)
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
        simulation: {
          mode: 'simulate',
          steps: simulatedSteps,
          context: {
            action: 'options_fill_order',
            intentHash
          }
        },
        warnings: build.warnings || []
      }
    })

    printSuccess({
      module: 'options_simulate',
      adapter,
      params,
      data: normalizeBuildOutput(data),
      warnings: data.warnings || []
    })
  } catch (error) {
    printFailure('options_simulate', adapter, params, error)
  }
})()
