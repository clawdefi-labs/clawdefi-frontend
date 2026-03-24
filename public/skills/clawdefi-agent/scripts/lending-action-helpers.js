'use strict'

const {
  parseAmountBaseUnits
} = require('./wallet-common.js')

const {
  stringifyBigInts,
  withWalletContext
} = require('./lending-common.js')

function normalizeAction (value) {
  const normalized = String(value || '').trim().toLowerCase().replace(/_/g, '-')
  if (!normalized) {
    throw new Error('Missing required --action.')
  }
  if (
    normalized !== 'supply' &&
    normalized !== 'withdraw' &&
    normalized !== 'borrow' &&
    normalized !== 'repay' &&
    normalized !== 'set-collateral' &&
    normalized !== 'set-emode'
  ) {
    throw new Error(`Unsupported lending action: ${normalized}`)
  }
  return normalized
}

function parseBooleanFlag (value, fieldName) {
  if (typeof value === 'boolean') return value
  const raw = String(value || '').trim().toLowerCase()
  if (raw === 'true' || raw === '1' || raw === 'yes' || raw === 'on') return true
  if (raw === 'false' || raw === '0' || raw === 'no' || raw === 'off') return false
  throw new Error(`--${fieldName} must be true/false.`)
}

function parseAddressField (value, fieldName, { required = false } = {}) {
  const parsed = String(value || '').trim()
  if (!parsed) {
    if (!required) return null
    throw new Error(`Missing required --${fieldName}.`)
  }
  return parsed
}

function parseBaseAmountField (value, fieldName, { required = false } = {}) {
  if ((value === undefined || value === null || value === '') && !required) {
    return null
  }
  return parseAmountBaseUnits(value)
}

function parseActionPayload (args) {
  const action = normalizeAction(args.action)
  const token = parseAddressField(args.token, 'token', {
    required: action !== 'set-emode'
  })

  const base = {
    action,
    token,
    amount: null,
    onBehalfOf: null,
    to: null,
    useAsCollateral: null,
    categoryId: null
  }

  if (action === 'supply' || action === 'withdraw' || action === 'borrow' || action === 'repay') {
    base.amount = parseBaseAmountField(args.amount, 'amount', { required: true })
  }

  if (action === 'supply' || action === 'borrow' || action === 'repay') {
    base.onBehalfOf = parseAddressField(args['on-behalf-of'], 'on-behalf-of')
  }

  if (action === 'withdraw') {
    base.to = parseAddressField(args.to, 'to')
  }

  if (action === 'set-collateral') {
    base.useAsCollateral = parseBooleanFlag(args['use-as-collateral'], 'use-as-collateral')
  }

  if (action === 'set-emode') {
    const rawCategory = String(args['category-id'] || '').trim()
    if (!rawCategory) {
      throw new Error('Missing required --category-id.')
    }
    const categoryId = Number.parseInt(rawCategory, 10)
    if (!Number.isInteger(categoryId) || categoryId < 0 || categoryId > 255) {
      throw new Error('--category-id must be an integer between 0 and 255.')
    }
    base.categoryId = categoryId
  }

  return base
}

async function resolveWalletAddress (args) {
  if (args.address) {
    return String(args.address).trim()
  }

  const wallet = await withWalletContext(args, 'read', async ({ address }) => ({ address }))
  return wallet.address
}

function normalizeBuildOutput (buildResult) {
  return stringifyBigInts({
    ...buildResult,
    txRequest: buildResult.txRequest || null
  })
}

module.exports = {
  normalizeBuildOutput,
  normalizeAction,
  parseActionPayload,
  resolveWalletAddress
}
