#!/usr/bin/env node
'use strict'

const {
  getArg,
  parseBooleanArg,
  parseCsvArg,
  parseIntArg,
  runModule
} = require('./market-intel-common.js')

runModule({
  module: 'meme_rush',
  async buildParams (args) {
    const mode = String(getArg(args, 'mode') || 'rank-list').trim().toLowerCase()

    if (!['rank-list', 'social-rush'].includes(mode)) {
      throw new Error('mode must be one of rank-list|social-rush.')
    }

    if (mode === 'rank-list') {
      const payload = {
        mode,
        chainId: String(getArg(args, 'chain-id', 'chainId') || 'CT_501'),
        rankType: parseIntArg(getArg(args, 'rank-type', 'rankType'), 'rankType', 10, { min: 10, max: 30 }),
        limit: parseIntArg(getArg(args, 'limit'), 'limit', 20, { min: 1, max: 200 })
      }
      const keywords = parseCsvArg(getArg(args, 'keywords') || '')
      const excludes = parseCsvArg(getArg(args, 'excludes') || '')
      if (keywords.length > 0) {
        payload.keywords = keywords.join(',')
      }
      if (excludes.length > 0) {
        payload.excludes = excludes.join(',')
      }
      return payload
    }

    const rankType = parseIntArg(getArg(args, 'rank-type', 'rankType'), 'rankType', 30, { min: 10, max: 30 })
    const defaultSort = rankType === 30 ? 30 : 10
    return {
      mode,
      chainId: String(getArg(args, 'chain-id', 'chainId') || 'CT_501'),
      rankType,
      sort: parseIntArg(getArg(args, 'sort'), 'sort', defaultSort, { min: 10, max: 30 }),
      asc: parseBooleanArg(getArg(args, 'asc'), 'asc', false),
      keywords: String(getArg(args, 'keywords') || ''),
      topicType: String(getArg(args, 'topic-type', 'topicType') || '')
    }
  }
})
