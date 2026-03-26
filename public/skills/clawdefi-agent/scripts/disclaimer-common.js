#!/usr/bin/env node
'use strict'

const {
  normalizeApiBaseUrl
} = require('./wallet-common.js')

function normalizeWallet (value) {
  const wallet = String(value || '').trim()
  if (!wallet) {
    throw new Error('wallet is required.')
  }
  return wallet
}

function normalizeVersion (value, fallback = null) {
  const raw = String(
    value ||
      fallback ||
      process.env.CLAWDEFI_DISCLAIMER_VERSION ||
      'v1'
  ).trim()
  if (!raw) {
    throw new Error('version is required.')
  }
  return raw
}

async function callDisclaimerApi (method, path, { query = null, body = null } = {}) {
  const baseUrl = normalizeApiBaseUrl()
  const qs = query ? `?${new URLSearchParams(query).toString()}` : ''
  const response = await fetch(`${baseUrl}${path}${qs}`, {
    method,
    headers: {
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  })

  const bodyText = await response.text()
  let payload = null
  if (bodyText.trim()) {
    try {
      payload = JSON.parse(bodyText)
    } catch {
      const error = new Error(`disclaimer_api_failed: invalid_json_response (${path})`)
      error.statusCode = response.status
      throw error
    }
  }

  if (!response.ok || (payload && payload.error)) {
    const detail = payload && (payload.message || payload.error)
      ? String(payload.message || payload.error)
      : `HTTP ${response.status}`
    const error = new Error(`disclaimer_api_failed: ${detail}`)
    error.statusCode = response.status
    error.responseBody = payload
    error.errorCode = payload && payload.error ? String(payload.error) : null
    throw error
  }

  return payload || {}
}

async function fetchDisclaimerStatus ({ wallet, version }) {
  const normalizedWallet = normalizeWallet(wallet)
  const normalizedVersion = normalizeVersion(version)
  const payload = await callDisclaimerApi('GET', '/api/v1/disclaimers/status', {
    query: {
      wallet: normalizedWallet,
      version: normalizedVersion
    }
  })

  return {
    wallet: String(payload.wallet || normalizedWallet),
    version: normalizeVersion(payload.version, normalizedVersion),
    accepted: Boolean(payload.accepted),
    acceptedAt: null
  }
}

async function registerDisclaimerConsent ({ wallet, version }) {
  const normalizedWallet = normalizeWallet(wallet)
  const normalizedVersion = normalizeVersion(version)
  const accepted = await callDisclaimerApi('POST', '/api/v1/disclaimers/accept', {
    body: {
      wallet: normalizedWallet,
      version: normalizedVersion
    }
  })

  const status = await fetchDisclaimerStatus({
    wallet: normalizedWallet,
    version: normalizedVersion
  })

  return {
    wallet: status.wallet,
    version: status.version,
    accepted: Boolean(accepted.accepted) && status.accepted,
    acceptedAt: accepted.acceptedAt ? String(accepted.acceptedAt) : null
  }
}

module.exports = {
  fetchDisclaimerStatus,
  normalizeVersion,
  registerDisclaimerConsent
}
