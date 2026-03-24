#!/usr/bin/env node
'use strict'

const {
  getArg,
  parseCsvArg,
  runModule
} = require('./market-intel-common.js')

runModule({
  module: 'query_token_info',
  async buildParams (args) {
    const mode = String(getArg(args, 'mode') || 'search').trim().toLowerCase()

    if (!['search', 'meta', 'dynamic', 'all'].includes(mode)) {
      throw new Error('mode must be one of search|meta|dynamic|all.')
    }

    const keyword = getArg(args, 'keyword', 'q')
    const chainIds = getArg(args, 'chain-ids', 'chainIds')
    const orderBy = getArg(args, 'order-by', 'orderBy') || 'volume24h'
    const chainId = getArg(args, 'chain-id', 'chainId')
    const contractAddress = getArg(args, 'contract-address', 'contractAddress', 'token')

    if (mode === 'search' && !keyword) {
      throw new Error('search mode requires --keyword.')
    }

    if ((mode === 'meta' || mode === 'dynamic' || mode === 'all') && (!chainId || !contractAddress)) {
      throw new Error(`${mode} mode requires --chain-id and --contract-address.`)
    }

    const payload = { mode }

    if (keyword) payload.keyword = String(keyword)
    if (chainIds) payload.chainIds = parseCsvArg(chainIds).join(',')
    if (orderBy) payload.orderBy = String(orderBy)
    if (chainId) payload.chainId = String(chainId)
    if (contractAddress) payload.contractAddress = String(contractAddress)

    return payload
  }
})
