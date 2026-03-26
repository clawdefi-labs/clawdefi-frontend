#!/usr/bin/env node
'use strict'

const {
  normalizeApiBaseUrl,
  printJson
} = require('./wallet-common.js')

const {
  computeIntentHash,
  executeTxSteps,
  parseArgs,
  parseBooleanFlag,
  simulateTxSteps,
  stringifyBigInts,
  withWalletContext
} = require('./swap-common.js')

function normalizeAdapter (value) {
  const adapter = String(value || process.env.CLAWDEFI_CROSSCHAIN_ADAPTER || '0x').trim().toLowerCase()
  if (!adapter) {
    throw new Error('Missing crosschain adapter.')
  }
  if (adapter !== '0x') {
    throw new Error(`Unsupported crosschain adapter: ${adapter}`)
  }
  return adapter
}

function buildEnvelope ({ module, adapter, params, data = null, warnings = [], errors = [] }) {
  return {
    contractVersion: 'crosschain.local.v1',
    source: 'clawdefi-local-skill',
    module,
    adapter,
    params,
    data,
    warnings,
    errors
  }
}

function printSuccess (input) {
  printJson({
    ok: true,
    ...buildEnvelope(input)
  })
}

function printFailure (module, adapter, params, error, warnings = []) {
  printJson({
    ok: false,
    error: error.message,
    ...buildEnvelope({
      module,
      adapter,
      params,
      data: null,
      warnings,
      errors: [
        {
          code: 'crosschain_action_failed',
          message: error.message
        }
      ]
    })
  })
  process.exit(1)
}

async function callCrosschainApi (method, path, payload = null) {
  const baseUrl = normalizeApiBaseUrl()
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      Accept: 'application/json',
      ...(payload ? { 'Content-Type': 'application/json' } : {})
    },
    ...(payload ? { body: JSON.stringify(payload) } : {})
  })

  const bodyText = await response.text()
  let body = null
  if (bodyText.trim()) {
    try {
      body = JSON.parse(bodyText)
    } catch {
      throw new Error(`crosschain_api_failed: invalid_json_response (${path})`)
    }
  }

  if (!response.ok || !body || body.error) {
    const detail = body && (body.message || body.error)
      ? String(body.message || body.error)
      : `HTTP ${response.status}`
    throw new Error(`crosschain_api_failed: ${detail}`)
  }

  return body
}

function extractTxHash (txPayload) {
  const candidate = txPayload && typeof txPayload === 'object' ? txPayload : {}
  const fields = [
    candidate.hash,
    candidate.txHash,
    candidate.transactionHash,
    candidate?.receipt?.transactionHash,
    candidate?.transaction?.hash,
    candidate?.transaction?.transactionHash
  ]
  for (const value of fields) {
    if (typeof value === 'string' && /^0x[a-fA-F0-9]{64}$/.test(value)) {
      return value
    }
  }
  return null
}

module.exports = {
  callCrosschainApi,
  computeIntentHash,
  executeTxSteps,
  extractTxHash,
  normalizeAdapter,
  parseArgs,
  parseBooleanFlag,
  printFailure,
  printSuccess,
  simulateTxSteps,
  stringifyBigInts,
  withWalletContext
}
