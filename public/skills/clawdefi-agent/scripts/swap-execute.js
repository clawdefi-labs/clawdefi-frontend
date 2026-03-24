#!/usr/bin/env node
'use strict'

const {
  callSwapApi,
  executeTxSteps,
  normalizeAdapter,
  parseArgs,
  parseBooleanFlag,
  printFailure,
  printSuccess,
  withWalletContext
} = require('./swap-common.js')

const {
  buildExecutionPlan,
  buildSwapIntent,
  buildSwapPayload,
  normalizeBuildOutput,
  parseApprovalMode,
  parseSwapArgs
} = require('./swap-action-helpers.js')

;(async () => {
  const args = parseArgs(process.argv.slice(2))
  const adapter = normalizeAdapter(args.adapter)

  const params = {
    adapter,
    chain: args.chain || null,
    index: args.index || null,
    approvalMode: args['approval-mode'] || 'exact'
  }

  try {
    const confirmExecute = parseBooleanFlag(args['confirm-execute'], 'confirm-execute', false)
    if (!confirmExecute) {
      throw new Error('swap_execute requires explicit --confirm-execute true.')
    }

    const wallet = await withWalletContext(args, 'broadcast', async ({ address, chain, index, selection }) => ({
      address,
      chain,
      index,
      selection
    }))
    const swap = parseSwapArgs(args, wallet.chain)
    const approvalMode = parseApprovalMode(args)
    const payload = buildSwapPayload(swap, wallet.address)
    const prepare = await callSwapApi('prepare', payload)
    const plan = buildExecutionPlan(prepare, approvalMode)
    const { intent, intentHash } = buildSwapIntent({
      walletAddress: wallet.address,
      swap,
      plan,
      prepareResult: prepare
    })

    const execution = await executeTxSteps(args, plan.steps, {
      action: 'swap',
      intentHash
    })

    printSuccess({
      module: 'swap_execute',
      adapter,
      params: {
        ...params,
        walletAddress: wallet.address,
        ...payload,
        approvalMode,
        confirmExecute
      },
      data: normalizeBuildOutput({
        build: {
          backend: prepare,
          plan,
          intent,
          intentHash,
          wallet
        },
        execution
      }),
      warnings: plan.backendWarnings
    })
  } catch (error) {
    printFailure('swap_execute', adapter, params, error)
  }
})()

