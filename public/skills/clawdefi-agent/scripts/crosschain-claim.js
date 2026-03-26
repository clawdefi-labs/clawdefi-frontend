#!/usr/bin/env node
'use strict'

const {
  callCrosschainApi,
  executeTxSteps,
  extractTxHash,
  normalizeAdapter,
  parseArgs,
  parseBooleanFlag,
  printFailure,
  printSuccess,
  simulateTxSteps
} = require('./crosschain-common.js')

const {
  normalizeBuildOutput,
  parseRequestId
} = require('./crosschain-action-helpers.js')

;(async () => {
  const args = parseArgs(process.argv.slice(2))
  const adapter = normalizeAdapter(args.adapter)
  const requestId = parseRequestId(args)

  const params = {
    adapter,
    requestId,
    dryRun: args['dry-run'] || false,
    confirmExecute: args['confirm-execute'] || false
  }

  try {
    const dryRun = parseBooleanFlag(args['dry-run'], 'dry-run', false)
    const confirmExecute = parseBooleanFlag(args['confirm-execute'], 'confirm-execute', false)

    const status = await callCrosschainApi(
      'GET',
      `/api/v1/crosschain/status/${encodeURIComponent(requestId)}`
    )

    const claimTxRequest = status?.data?.claim?.txRequest && typeof status.data.claim.txRequest === 'object'
      ? status.data.claim.txRequest
      : null

    let simulation = null
    let execution = null
    let claimTxHash = null

    if (claimTxRequest) {
      const runtimeArgs = {
        ...args,
        chain: status?.params?.destinationChainSlug || args.chain || 'ethereum-mainnet'
      }
      const steps = [{ name: 'claim', txRequest: claimTxRequest }]

      if (dryRun) {
        simulation = await simulateTxSteps(runtimeArgs, steps, {
          action: 'crosschain_claim',
          requestId
        })
      } else {
        if (!confirmExecute) {
          throw new Error('crosschain_claim requires --confirm-execute true when claim tx execution is needed.')
        }
        execution = await executeTxSteps(runtimeArgs, steps, {
          action: 'crosschain_claim',
          requestId
        })
        claimTxHash = extractTxHash(execution?.steps?.[0]?.transaction)
      }
    }

    if (dryRun) {
      printSuccess({
        module: 'crosschain_claim',
        adapter,
        params: {
          ...params,
          dryRun,
          confirmExecute
        },
        data: normalizeBuildOutput({
          status,
          simulation
        }),
        warnings: Array.isArray(status?.data?.warnings) ? status.data.warnings : []
      })
      return
    }

    const claim = await callCrosschainApi('POST', '/api/v1/crosschain/claim', {
      requestId,
      ...(claimTxHash ? { claimTxHash } : {})
    })

    printSuccess({
      module: 'crosschain_claim',
      adapter,
      params: {
        ...params,
        dryRun,
        confirmExecute
      },
      data: normalizeBuildOutput({
        before: status,
        execution,
        claim
      }),
      warnings: Array.isArray(claim?.data?.warnings) ? claim.data.warnings : []
    })
  } catch (error) {
    printFailure('crosschain_claim', adapter, params, error)
  }
})()
