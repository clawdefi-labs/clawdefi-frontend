#!/usr/bin/env node
'use strict'

const {
  callSwapApi,
  normalizeAdapter,
  parseArgs,
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
    const wallet = await withWalletContext(args, 'read', async ({ address, chain, index, selection }) => ({
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

    printSuccess({
      module: 'swap_build',
      adapter,
      params: {
        ...params,
        walletAddress: wallet.address,
        ...payload,
        approvalMode
      },
      data: normalizeBuildOutput({
        backend: prepare,
        plan,
        intent,
        intentHash,
        wallet
      }),
      warnings: plan.backendWarnings
    })
  } catch (error) {
    printFailure('swap_build', adapter, params, error)
  }
})()

