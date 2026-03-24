#!/usr/bin/env node
'use strict'

const {
  getArg,
  runModule
} = require('./market-intel-common.js')

runModule({
  module: 'query_token_audit',
  async buildParams (args) {
    const chainId = getArg(args, 'chain-id', 'chainId', 'chain')
    const contractAddress = getArg(args, 'contract-address', 'contractAddress', 'token-address', 'tokenAddress')

    if (!chainId) {
      throw new Error('Missing --chain-id.')
    }
    if (!contractAddress) {
      throw new Error('Missing --contract-address.')
    }

    return {
      chainId: String(chainId),
      contractAddress: String(contractAddress)
    }
  }
})
