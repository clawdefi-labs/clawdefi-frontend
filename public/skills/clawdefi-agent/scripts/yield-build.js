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
  resolveWalletAddress
} = require('./yield-common.js')

const {
  buildYieldIntent,
  normalizeBuildOutput,
  parseApprovalMode,
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
    additionalData: input.additionalData
  }

  try {
    if (!input.walletAddress) {
      input.walletAddress = await resolveWalletAddress(args)
      params.address = input.walletAddress
    }
    if (!input.receiver) {
      input.receiver = input.walletAddress
      params.receiver = input.receiver
    }

    const quote = await impl.quoteYield(input)
    const execution = await resolveExecutionContext(input.chainSlug, 'read')
    if (execution.family !== 'evm') {
      throw new Error(`Yield execution requires EVM chain. Received family=${execution.family}.`)
    }

    const ethersLib = await loadRuntimeEthers()
    const plan = await impl.buildExecutionPlan({
      quote,
      walletAddress: input.walletAddress,
      approvalMode,
      rpcUrl: execution.rpcUrl,
      ethersLib
    })

    const { intent, intentHash } = buildYieldIntent({
      walletAddress: input.walletAddress,
      quote,
      plan,
      input
    })

    const warnings = [
      ...input.warnings,
      ...(quote.warnings || []),
      ...(plan.warnings || [])
    ]

    printSuccess({
      module: 'yield_build',
      adapter,
      params,
      data: normalizeBuildOutput({
        wallet: {
          address: input.walletAddress,
          chain: input.chainSlug
        },
        quote,
        plan,
        intent,
        intentHash
      }),
      warnings
    })
  } catch (error) {
    printFailure('yield_build', adapter, params, error, input.warnings)
  }
})()
