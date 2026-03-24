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

function assertEvmAddress (value, name) {
  const normalized = String(value || '').trim()
  if (!/^0x[a-fA-F0-9]{40}$/.test(normalized)) {
    throw new Error(`Invalid ${name}; expected 0x-prefixed EVM address.`)
  }
  return normalized
}

function parseOptionalDecimals (value) {
  if (value === undefined || value === null || value === '') {
    return null
  }
  const parsed = Number.parseInt(String(value), 10)
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 36) {
    throw new Error('decimals must be an integer between 0 and 36.')
  }
  return parsed
}

function formatUnits (amount, decimals) {
  if (decimals === 0) {
    return amount.toString()
  }
  const negative = amount < 0n
  const absolute = negative ? -amount : amount
  const scale = 10n ** BigInt(decimals)
  const whole = absolute / scale
  const fraction = absolute % scale
  const fractionText = fraction.toString().padStart(decimals, '0').replace(/0+$/, '')
  const rendered = fractionText ? `${whole.toString()}.${fractionText}` : whole.toString()
  return negative ? `-${rendered}` : rendered
}

;(async () => {
  try {
    const args = parseArgs(process.argv.slice(2))

    const token = assertEvmAddress(args.token, 'token')
    const spender = assertEvmAddress(args.spender, 'spender')
    const decimals = parseOptionalDecimals(args.decimals)

    const seed = await requireSeed()
    const selection = await readSelection()
    const chain = String(args.chain || selection.chain)
    const index = parseIndex(args.index, selection.index)
    const family = chainToFamily(chain)

    if (family !== 'evm') {
      throw new Error(`wallet_token_allowance_check supports EVM chains only. Received chain: ${chain}`)
    }

    const result = await withAccount(chain, index, seed, async ({ account }) => {
      if (typeof account.getAllowance !== 'function') {
        throw new Error('Connected wallet account does not support getAllowance().')
      }

      const owner = assertEvmAddress(await account.getAddress(), 'owner')
      const allowance = await account.getAllowance(token, spender)

      return {
        owner,
        allowance
      }
    }, { intent: 'read' })

    printJson({
      ok: true,
      action: 'wallet_token_allowance_check',
      selection: { family, chain, index },
      token,
      spender,
      owner: result.owner,
      allowanceRaw: result.allowance.toString(),
      allowanceUi: decimals === null ? null : formatUnits(result.allowance, decimals),
      decimals
    })
  } catch (error) {
    fail(error.message, { action: 'wallet_token_allowance_check' })
  }
})()
