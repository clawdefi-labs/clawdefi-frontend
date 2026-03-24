#!/usr/bin/env node
'use strict'

const {
  getArg,
  parseIntArg,
  runModule
} = require('./market-intel-common.js')

runModule({
  module: 'query_address_info',
  async buildParams (args) {
    const address = getArg(args, 'address')
    const chainId = getArg(args, 'chain-id', 'chainId')
    const offset = parseIntArg(getArg(args, 'offset'), 'offset', 0, { min: 0, max: 1000000 })

    if (!address) {
      throw new Error('Missing --address.')
    }
    if (!chainId) {
      throw new Error('Missing --chain-id.')
    }

    return {
      address: String(address),
      chainId: String(chainId),
      offset
    }
  }
})
