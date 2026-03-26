#!/usr/bin/env node
'use strict'

const {
  callCrosschainApi,
  normalizeAdapter,
  parseArgs,
  printFailure,
  printSuccess
} = require('./crosschain-common.js')

const {
  parseRequestId
} = require('./crosschain-action-helpers.js')

;(async () => {
  const args = parseArgs(process.argv.slice(2))
  const adapter = normalizeAdapter(args.adapter)
  const requestId = parseRequestId(args)

  const params = {
    adapter,
    requestId
  }

  try {
    const status = await callCrosschainApi(
      'GET',
      `/api/v1/crosschain/status/${encodeURIComponent(requestId)}`
    )

    printSuccess({
      module: 'crosschain_status',
      adapter,
      params,
      data: status,
      warnings: Array.isArray(status?.data?.warnings) ? status.data.warnings : []
    })
  } catch (error) {
    printFailure('crosschain_status', adapter, params, error)
  }
})()
