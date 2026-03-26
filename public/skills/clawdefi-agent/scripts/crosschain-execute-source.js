#!/usr/bin/env node
'use strict'

const {
  callCrosschainApi,
  callCrosschainBuildWithConsentRecovery,
  executeTxSteps,
  extractTxHash,
  normalizeAdapter,
  parseArgs,
  parseBooleanFlag,
  printFailure,
  printSuccess,
  withWalletContext
} = require('./crosschain-common.js')

const {
  buildCrosschainIntent,
  buildCrosschainPayload,
  buildExecutionPlan,
  normalizeBuildOutput,
  parseApprovalMode,
  parseCrosschainArgs
} = require('./crosschain-action-helpers.js')

;(async () => {
  const args = parseArgs(process.argv.slice(2))
  const adapter = normalizeAdapter(args.adapter)

  const params = {
    adapter,
    sourceChain: args['source-chain'] || args.chain || null,
    destinationChain: args['destination-chain'] || null,
    index: args.index || null,
    approvalMode: args['approval-mode'] || 'exact'
  }

  try {
    const confirmExecute = parseBooleanFlag(args['confirm-execute'], 'confirm-execute', false)
    if (!confirmExecute) {
      throw new Error('crosschain_execute_source requires explicit --confirm-execute true.')
    }

    const crosschain = parseCrosschainArgs(
      args,
      args.chain || args['source-chain'] || 'base-mainnet',
      args['destination-chain'] || 'ethereum-mainnet'
    )
    const runtimeArgs = {
      ...args,
      chain: crosschain.sourceChainRaw
    }

    const wallet = await withWalletContext(runtimeArgs, 'broadcast', async ({ address, chain, index, selection }) => ({
      address,
      chain,
      index,
      selection
    }))

    const approvalMode = parseApprovalMode(args)
    const payload = buildCrosschainPayload(crosschain, wallet.address, adapter)
    const prepared = await callCrosschainBuildWithConsentRecovery(args, payload, wallet.address)
    const build = prepared.build
    const plan = buildExecutionPlan(build, approvalMode)
    const { intent, intentHash } = buildCrosschainIntent({
      walletAddress: wallet.address,
      crosschain,
      plan,
      buildResult: build
    })

    const execution = await executeTxSteps(runtimeArgs, plan.steps, {
      action: 'crosschain_execute_source',
      requestId: plan.requestId,
      intentHash
    })

    const sourceStep = Array.isArray(execution.steps) ? execution.steps[execution.steps.length - 1] : null
    const sourceTxHash = extractTxHash(sourceStep?.transaction)
    if (!sourceTxHash) {
      throw new Error('crosschain_execute_source_failed: unable to resolve source tx hash from local execution result.')
    }

    const status = await callCrosschainApi('POST', '/api/v1/crosschain/execute-source', {
      requestId: plan.requestId,
      sourceTxHash
    })

    printSuccess({
      module: 'crosschain_execute_source',
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
          backend: build,
          plan,
          intent,
          intentHash,
          wallet,
          disclaimer: prepared.disclaimer
        },
        execution,
        status
      }),
      warnings: plan.backendWarnings
    })
  } catch (error) {
    printFailure('crosschain_execute_source', adapter, params, error)
  }
})()
