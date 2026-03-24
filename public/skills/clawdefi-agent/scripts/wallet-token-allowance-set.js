#!/usr/bin/env node
'use strict'

const {
  chainToFamily,
  fail,
  parseArgs,
  parseIndex,
  printJson,
  readSelection,
  requireSeed,
  withAccount
} = require('./wallet-common.js')

const MAX_UINT256 = (1n << 256n) - 1n

function assertEvmAddress (value, name) {
  const normalized = String(value || '').trim()
  if (!/^0x[a-fA-F0-9]{40}$/.test(normalized)) {
    throw new Error(`Invalid ${name}; expected 0x-prefixed EVM address.`)
  }
  return normalized
}

function parseMode (value) {
  const mode = String(value || 'exact').trim().toLowerCase()
  if (!['exact', 'revoke', 'unlimited'].includes(mode)) {
    throw new Error('mode must be one of exact|revoke|unlimited.')
  }
  return mode
}

function parseAmountRaw (value) {
  if (value == null || value === '') {
    throw new Error('Missing --amount (base units) for mode=exact.')
  }
  const raw = String(value).trim()
  if (!/^\d+$/.test(raw)) {
    throw new Error('amount must be an integer string in base units.')
  }
  return BigInt(raw)
}

function parseBoolFlag (value) {
  if (value === true) return true
  if (value === false || value == null || value === '') return false
  const normalized = String(value).trim().toLowerCase()
  return normalized === 'true' || normalized === '1' || normalized === 'yes'
}

function resolveTargetAllowance (mode, args) {
  if (mode === 'revoke') {
    return 0n
  }
  if (mode === 'unlimited') {
    if (!parseBoolFlag(args['allow-unlimited'] || args.allowUnlimited)) {
      throw new Error('mode=unlimited requires --allow-unlimited true.')
    }
    return MAX_UINT256
  }
  return parseAmountRaw(args.amount)
}

;(async () => {
  try {
    const args = parseArgs(process.argv.slice(2))
    const mode = parseMode(args.mode)
    const dryRun = parseBoolFlag(args['dry-run'] || args.dryRun)

    const token = assertEvmAddress(args.token, 'token')
    const spender = assertEvmAddress(args.spender, 'spender')
    const targetAllowance = resolveTargetAllowance(mode, args)

    const seed = await requireSeed()
    const selection = await readSelection()
    const chain = String(args.chain || selection.chain)
    const index = parseIndex(args.index, selection.index)
    const family = chainToFamily(chain)

    if (family !== 'evm') {
      throw new Error(`wallet_token_allowance_set supports EVM chains only. Received chain: ${chain}`)
    }

    const result = await withAccount(chain, index, seed, async ({ account }) => {
      if (typeof account.getAllowance !== 'function') {
        throw new Error('Connected wallet account does not support getAllowance().')
      }

      const owner = assertEvmAddress(await account.getAddress(), 'owner')
      const currentAllowance = await account.getAllowance(token, spender)

      const payload = {
        owner,
        currentAllowance,
        targetAllowance
      }

      if (dryRun) {
        return payload
      }

      if (typeof account.approve !== 'function') {
        throw new Error('Connected wallet account does not support approve().')
      }

      const approval = await account.approve({
        token,
        spender,
        amount: targetAllowance
      })

      return {
        ...payload,
        hash: approval.hash || null,
        fee: approval.fee != null ? approval.fee : null
      }
    }, { intent: dryRun ? 'simulate' : 'broadcast' })

    printJson({
      ok: true,
      action: 'wallet_token_allowance_set',
      selection: { family, chain, index },
      token,
      spender,
      mode,
      dryRun,
      owner: result.owner,
      currentAllowanceRaw: result.currentAllowance.toString(),
      targetAllowanceRaw: result.targetAllowance.toString(),
      txHash: result.hash || null,
      txFeeRaw: result.fee == null ? null : String(result.fee)
    })
  } catch (error) {
    fail(error.message, { action: 'wallet_token_allowance_set' })
  }
})()
