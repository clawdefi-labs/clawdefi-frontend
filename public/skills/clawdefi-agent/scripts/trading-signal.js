#!/usr/bin/env node
'use strict'

const {
  getArg,
  parseIntArg,
  runModule
} = require('./market-intel-common.js')

runModule({
  module: 'trading_signal',
  async buildParams (args) {
    return {
      chainId: String(getArg(args, 'chain-id', 'chainId') || 'CT_501'),
      smartSignalType: String(getArg(args, 'smart-signal-type', 'smartSignalType') || ''),
      page: parseIntArg(getArg(args, 'page'), 'page', 1, { min: 1 }),
      pageSize: parseIntArg(getArg(args, 'page-size', 'pageSize'), 'pageSize', 50, { min: 1, max: 100 })
    }
  }
})
