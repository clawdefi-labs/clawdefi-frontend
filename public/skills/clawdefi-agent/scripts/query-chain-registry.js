#!/usr/bin/env node
'use strict'

const {
  callChainRegistry,
  fail,
  parseArgs,
  parseChainSelector,
  printJson,
  readSelection
} = require('./wallet-common.js')

function normalizeIntent (value) {
  const intent = String(value || 'read').trim().toLowerCase()
  if (!['read', 'simulate', 'broadcast'].includes(intent)) {
    throw new Error('intent must be one of read|simulate|broadcast.')
  }
  return intent
}

async function resolveSelector (args) {
  if (args['chain-id'] || args.chainId) {
    const raw = String(args['chain-id'] || args.chainId).trim()
    if (!/^\d+$/.test(raw)) {
      throw new Error('chain-id must be a positive integer.')
    }
    return { chainId: Number(raw) }
  }

  const chainSlug = args['chain-slug'] || args.chainSlug
  if (chainSlug) {
    return { chainSlug: String(chainSlug).trim().toLowerCase() }
  }

  const chain = args.chain
  if (chain) {
    const selector = parseChainSelector(chain)
    if (!selector) {
      throw new Error('Unable to parse --chain selector.')
    }
    return selector
  }

  const selection = await readSelection()
  const selector = parseChainSelector(selection.chain)
  if (!selector) {
    throw new Error('No chain selector provided and no local wallet selection found.')
  }
  return selector
}

;(async () => {
  try {
    const args = parseArgs(process.argv.slice(2))
    const intent = normalizeIntent(args.intent)
    const selector = await resolveSelector(args)

    const registry = await callChainRegistry(selector, intent)

    printJson({
      ok: true,
      action: 'query_chain_registry',
      intent,
      selector,
      data: registry.raw
    })
  } catch (error) {
    fail(error.message, { action: 'query_chain_registry' })
  }
})()
