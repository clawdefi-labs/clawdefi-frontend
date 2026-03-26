#!/usr/bin/env node
'use strict'

const {
  normalizeApiBaseUrl,
  printJson
} = require('./wallet-common.js')

const {
  fetchDisclaimerStatus,
  normalizeVersion,
  registerDisclaimerConsent
} = require('./disclaimer-common.js')

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

function isDisclaimerBlockedError (error) {
  if (!error || typeof error !== 'object') return false
  if (String(error.errorCode || '').trim() === 'disclaimer_not_accepted') return true
  if (Number(error.statusCode) === 412) return true
  const responseBody = error.responseBody && typeof error.responseBody === 'object'
    ? error.responseBody
    : null
  if (responseBody && String(responseBody.error || '').trim() === 'disclaimer_not_accepted') {
    return true
  }
  const message = String(error.message || '').toLowerCase()
  return message.includes('disclaimer acceptance is required')
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
    const error = new Error(`crosschain_api_failed: ${detail}`)
    error.statusCode = response.status
    error.responseBody = body
    error.errorCode = body && body.error ? String(body.error) : null
    throw error
  }

  return body
}

async function callCrosschainBuildWithConsentRecovery (args, payload, walletAddress) {
  try {
    return {
      build: await callCrosschainApi('POST', '/api/v1/crosschain/build', payload),
      disclaimer: null
    }
  } catch (error) {
    if (!isDisclaimerBlockedError(error)) {
      throw error
    }

    const blockedVersion = error && error.responseBody && error.responseBody.policyVersion
      ? String(error.responseBody.policyVersion)
      : null
    const version = normalizeVersion(args['disclaimer-version'], blockedVersion)
    const statusBefore = await fetchDisclaimerStatus({
      wallet: walletAddress,
      version
    })
    const autoAccept = parseBooleanFlag(args['accept-disclaimer'], 'accept-disclaimer', false)

    if (!autoAccept) {
      throw new Error(
        `crosschain_build_failed: Disclaimer acceptance is required for wallet ${walletAddress} (version=${version}, accepted=${statusBefore.accepted}). ` +
        `Run wallet-disclaimer-status and wallet-register-consent first, or retry with --accept-disclaimer true --confirm-consent true.`
      )
    }

    const confirmConsent = parseBooleanFlag(args['confirm-consent'], 'confirm-consent', false)
    if (!confirmConsent) {
      throw new Error('crosschain_build_failed: --accept-disclaimer true requires --confirm-consent true.')
    }

    const consent = await registerDisclaimerConsent({
      wallet: walletAddress,
      version
    })

    if (!consent.accepted) {
      throw new Error(`crosschain_build_failed: disclaimer consent was not confirmed for wallet ${walletAddress} (version=${version}).`)
    }

    return {
      build: await callCrosschainApi('POST', '/api/v1/crosschain/build', payload),
      disclaimer: {
        recovered: true,
        wallet: walletAddress,
        version,
        accepted: consent.accepted,
        acceptedAt: consent.acceptedAt,
        statusBefore: {
          accepted: statusBefore.accepted
        }
      }
    }
  }
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
  callCrosschainBuildWithConsentRecovery,
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
