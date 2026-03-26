#!/usr/bin/env node
'use strict'

const {
  callCrosschainApi,
  normalizeAdapter,
  parseArgs,
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
    const crosschain = parseCrosschainArgs(
      args,
      args.chain || args['source-chain'] || 'base-mainnet',
      args['destination-chain'] || 'ethereum-mainnet'
    )
    const runtimeArgs = {
      ...args,
      chain: crosschain.sourceChainRaw
    }

    const wallet = await withWalletContext(runtimeArgs, 'read', async ({ address, chain, index, selection }) => ({
      address,
      chain,
      index,
      selection
    }))

    const approvalMode = parseApprovalMode(args)
    const payload = buildCrosschainPayload(crosschain, wallet.address, adapter)
    const build = await callCrosschainApi('POST', '/api/v1/crosschain/build', payload)
    const plan = buildExecutionPlan(build, approvalMode)
    const { intent, intentHash } = buildCrosschainIntent({
      walletAddress: wallet.address,
      crosschain,
      plan,
      buildResult: build
    })

    printSuccess({
      module: 'crosschain_build',
      adapter,
      params: {
        ...params,
        walletAddress: wallet.address,
        ...payload,
        approvalMode
      },
      data: normalizeBuildOutput({
        backend: build,
        plan,
        intent,
        intentHash,
        wallet
      }),
      warnings: plan.backendWarnings
    })
  } catch (error) {
    printFailure('crosschain_build', adapter, params, error)
  }
})()
