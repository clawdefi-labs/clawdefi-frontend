#!/usr/bin/env node
'use strict'

const {
  getArg,
  parseBooleanArg,
  parseIntArg,
  runModule
} = require('./market-intel-common.js')

runModule({
  module: 'crypto_market_rank',
  async buildParams (args) {
    const mode = String(getArg(args, 'mode') || 'unified').trim().toLowerCase()

    if (!['unified', 'social-hype', 'smart-money-inflow', 'meme-rank', 'address-pnl'].includes(mode)) {
      throw new Error('mode must be one of unified|social-hype|smart-money-inflow|meme-rank|address-pnl.')
    }

    const payload = { mode }

    if (mode === 'unified') {
      payload.chainId = String(getArg(args, 'chain-id', 'chainId') || '56')
      payload.rankType = parseIntArg(getArg(args, 'rank-type', 'rankType'), 'rankType', 10)
      payload.period = parseIntArg(getArg(args, 'period'), 'period', 50)
      payload.sortBy = parseIntArg(getArg(args, 'sort-by', 'sortBy'), 'sortBy', 70)
      payload.orderAsc = parseBooleanArg(getArg(args, 'order-asc', 'orderAsc'), 'orderAsc', false)
      payload.page = parseIntArg(getArg(args, 'page'), 'page', 1, { min: 1 })
      payload.size = parseIntArg(getArg(args, 'size'), 'size', 20, { min: 1, max: 200 })
      return payload
    }

    if (mode === 'social-hype') {
      payload.chainId = String(getArg(args, 'chain-id', 'chainId') || '56')
      payload.sentiment = String(getArg(args, 'sentiment') || 'All')
      payload.socialLanguage = String(getArg(args, 'social-language', 'socialLanguage') || 'ALL')
      payload.targetLanguage = String(getArg(args, 'target-language', 'targetLanguage') || 'en')
      payload.timeRange = parseIntArg(getArg(args, 'time-range', 'timeRange'), 'timeRange', 1, { min: 1 })
      return payload
    }

    if (mode === 'smart-money-inflow') {
      payload.chainId = String(getArg(args, 'chain-id', 'chainId') || '56')
      payload.period = String(getArg(args, 'period') || '24h')
      payload.tagType = parseIntArg(getArg(args, 'tag-type', 'tagType'), 'tagType', 2)
      return payload
    }

    if (mode === 'meme-rank') {
      payload.chainId = String(getArg(args, 'chain-id', 'chainId') || '56')
      return payload
    }

    payload.chainId = String(getArg(args, 'chain-id', 'chainId') || 'CT_501')
    payload.period = String(getArg(args, 'period') || '30d')
    payload.tag = String(getArg(args, 'tag') || 'ALL')
    payload.pageNo = parseIntArg(getArg(args, 'page-no', 'pageNo'), 'pageNo', 1, { min: 1 })
    payload.pageSize = parseIntArg(getArg(args, 'page-size', 'pageSize'), 'pageSize', 25, { min: 1, max: 25 })
    payload.sortBy = parseIntArg(getArg(args, 'sort-by', 'sortBy'), 'sortBy', 0)
    payload.orderBy = parseIntArg(getArg(args, 'order-by', 'orderBy'), 'orderBy', 0)
    return payload
  }
})
