'use strict'

const {
  fail,
  normalizeApiBaseUrl,
  parseArgs,
  printJson
} = require('./wallet-common.js')

function getArg (args, ...keys) {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(args, key)) {
      return args[key]
    }
  }
  return undefined
}

function parseIntArg (value, key, fallback, limits = {}) {
  if (value === undefined || value === null || value === '') {
    return fallback
  }
  const parsed = Number.parseInt(String(value), 10)
  if (!Number.isInteger(parsed)) {
    throw new Error(`${key} must be an integer.`)
  }
  if (limits.min !== undefined && parsed < limits.min) {
    throw new Error(`${key} must be >= ${limits.min}.`)
  }
  if (limits.max !== undefined && parsed > limits.max) {
    throw new Error(`${key} must be <= ${limits.max}.`)
  }
  return parsed
}

function parseBooleanArg (value, key, fallback) {
  if (value === undefined || value === null || value === '') {
    return fallback
  }
  const normalized = String(value).trim().toLowerCase()
  if (normalized === 'true') return true
  if (normalized === 'false') return false
  throw new Error(`${key} must be true or false.`)
}

function parseCsvArg (value) {
  if (value === undefined || value === null || value === '') {
    return []
  }
  return String(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

async function callMarketIntel (module, params) {
  const baseUrl = normalizeApiBaseUrl()
  const response = await fetch(`${baseUrl}/api/v1/intel/market/query`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ module, params })
  })

  const bodyText = await response.text()
  const body = bodyText ? JSON.parse(bodyText) : null

  if (!response.ok || !body || body.error) {
    const detail = body && (body.message || body.error)
      ? String(body.message || body.error)
      : `HTTP ${response.status}`
    throw new Error(`market_intel_failed: ${detail}`)
  }

  return body
}

async function runModule (input) {
  try {
    const args = parseArgs(process.argv.slice(2))
    const payload = await input.buildParams(args)
    const result = await callMarketIntel(input.module, payload)

    printJson({
      ok: true,
      action: input.module,
      params: payload,
      data: result
    })
  } catch (error) {
    fail(error.message, { action: input.module })
  }
}

module.exports = {
  callMarketIntel,
  getArg,
  parseArgs,
  parseBooleanArg,
  parseCsvArg,
  parseIntArg,
  printJson,
  runModule
}
