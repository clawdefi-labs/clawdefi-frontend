#!/usr/bin/env node
'use strict'

const {
  DEFAULT_REFERRAL_WALLET,
  loadAdapter,
  normalizeChainForOptions,
  normalizeEvmAddress,
  parseArgs,
  printFailure,
  printSuccess
} = require('./options-common.js')

;(async () => {
  const args = parseArgs(process.argv.slice(2))
  const { adapter, impl } = loadAdapter(args.adapter)

  const input = {
    chain: normalizeChainForOptions(args.chain || 'base-mainnet'),
    referrer: normalizeEvmAddress(args.referrer || process.env.CLAWDEFI_OPTIONS_REFERRER || DEFAULT_REFERRAL_WALLET, 'referrer') || DEFAULT_REFERRAL_WALLET
  }

  const params = {
    adapter,
    chain: input.chain,
    referrer: input.referrer
  }

  try {
    const data = await impl.getChainInfo(input)
    printSuccess({
      module: 'options_chain',
      adapter,
      params,
      data,
      warnings: []
    })
  } catch (error) {
    printFailure('options_chain', adapter, params, error)
  }
})()
