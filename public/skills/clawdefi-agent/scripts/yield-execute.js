#!/usr/bin/env node
'use strict'

const {
  loadAdapter,
  loadRuntimeEthers,
  parseArgs,
  printFailure,
  printSuccess,
  readSelection,
  resolveExecutionContext,
  stringifyBigInts,
  toWdkTxRequest,
  withWalletContext
} = require('./yield-common.js')

const {
  buildYieldIntent,
  normalizeBuildOutput,
  parseApprovalMode,
  parseBooleanFlag,
  parseQuoteInput
} = require('./yield-action-helpers.js')

;(async () => {
  const args = parseArgs(process.argv.slice(2))
  const { adapter, impl } = loadAdapter(args.adapter)

  const selection = await readSelection()
  const input = parseQuoteInput(args, selection.chain)
  const approvalMode = parseApprovalMode(args)

  const params = {
    adapter,
    chain: input.chainSlug,
    chainId: input.chainId,
    tokensIn: input.tokensIn,
    amountsIn: input.amountsIn,
    tokensOut: input.tokensOut,
    receiver: input.receiver,
    address: input.walletAddress,
    slippage: input.slippage,
    routeIndex: input.routeIndex,
    approvalMode,
    enableAggregator: input.enableAggregator,
    aggregators: input.aggregators,
    additionalData: input.additionalData,
    confirmExecute: false
  }

  try {
    const confirmExecute = parseBooleanFlag(args['confirm-execute'], 'confirm-execute', false)
    params.confirmExecute = confirmExecute
    if (!confirmExecute) {
      throw new Error('yield_execute requires explicit --confirm-execute true.')
    }

    const ethersLib = await loadRuntimeEthers()

    const data = await withWalletContext(args, 'broadcast', async ({ account, address, selection }) => {
      if (input.walletAddress && input.walletAddress.toLowerCase() !== address.toLowerCase()) {
        throw new Error(`--address ${input.walletAddress} does not match selected local wallet ${address}.`)
      }

      input.walletAddress = address
      input.receiver = input.receiver || address
      params.address = address
      params.receiver = input.receiver

      const quote = await impl.quoteYield(input)
      const execution = await resolveExecutionContext(input.chainSlug, 'broadcast')
      if (execution.family !== 'evm') {
        throw new Error(`Yield execution requires EVM chain. Received family=${execution.family}.`)
      }

      const plan = await impl.buildExecutionPlan({
        quote,
        walletAddress: address,
        approvalMode,
        rpcUrl: execution.rpcUrl,
        ethersLib
      })

      const { intent, intentHash } = buildYieldIntent({
        walletAddress: address,
        quote,
        plan,
        input
      })

      const executedSteps = []
      for (const step of plan.steps) {
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
          quote,
          plan,
          intent,
          intentHash
        }),
        execution: {
          mode: 'execute',
          steps: executedSteps,
          context: {
            action: 'yield',
            intentHash
          }
        },
        warnings: [
          ...input.warnings,
          ...(quote.warnings || []),
          ...(plan.warnings || [])
        ]
      }
    })

    printSuccess({
      module: 'yield_execute',
      adapter,
      params,
      data: normalizeBuildOutput(data),
      warnings: data.warnings || input.warnings
    })
  } catch (error) {
    printFailure('yield_execute', adapter, params, error, input.warnings)
  }
})()
