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

    const refundTxRequest = status?.data?.refund?.txRequest && typeof status.data.refund.txRequest === 'object'
      ? status.data.refund.txRequest
      : null

    let simulation = null
    let execution = null
    let refundTxHash = null

    if (refundTxRequest) {
      const runtimeArgs = {
        ...args,
        chain: status?.params?.sourceChainSlug || args.chain || 'base-mainnet'
      }
      const steps = [{ name: 'refund', txRequest: refundTxRequest }]

      if (dryRun) {
        simulation = await simulateTxSteps(runtimeArgs, steps, {
          action: 'crosschain_refund',
          requestId
        })
      } else {
        if (!confirmExecute) {
          throw new Error('crosschain_refund requires --confirm-execute true when refund tx execution is needed.')
        }
        execution = await executeTxSteps(runtimeArgs, steps, {
          action: 'crosschain_refund',
          requestId
        })
        refundTxHash = extractTxHash(execution?.steps?.[0]?.transaction)
      }
    }

    if (dryRun) {
      printSuccess({
        module: 'crosschain_refund',
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

    const refund = await callCrosschainApi('POST', '/api/v1/crosschain/refund', {
      requestId,
      ...(refundTxHash ? { refundTxHash } : {})
    })

    printSuccess({
      module: 'crosschain_refund',
      adapter,
      params: {
        ...params,
        dryRun,
        confirmExecute
      },
      data: normalizeBuildOutput({
        before: status,
        execution,
        refund
      }),
      warnings: Array.isArray(refund?.data?.warnings) ? refund.data.warnings : []
    })
  } catch (error) {
    printFailure('crosschain_refund', adapter, params, error)
  }
})()
