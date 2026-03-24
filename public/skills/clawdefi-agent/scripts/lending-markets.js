'use strict'

const {
  loadAdapter,
  parseArgs,
  printFailure,
  printSuccess
} = require('./lending-common.js')

const {
  resolveWalletAddress
} = require('./lending-action-helpers.js')

function parseBooleanFlag (value) {
  if (value === undefined || value === null || value === '') {
    return false
  }
  const raw = String(value).trim().toLowerCase()
  if (raw === 'true' || raw === '1' || raw === 'yes' || raw === 'on') return true
  if (raw === 'false' || raw === '0' || raw === 'no' || raw === 'off') return false
  throw new Error('--include-account must be true/false.')
}

;(async () => {
  const args = parseArgs(process.argv.slice(2))
  const { adapter, impl } = loadAdapter(args.adapter)

  const chain = args.chain || ''
  const includeAccount = parseBooleanFlag(args['include-account'])

  const params = {
    adapter,
    chain: chain || null,
    address: args.address || null,
    includeAccount
  }

  try {
    let walletAddress = null
    if (args.address || includeAccount) {
      walletAddress = await resolveWalletAddress(args)
    }

    const data = await impl.listMarkets({
      chain,
      walletAddress
    })

    printSuccess({
      module: 'lending_markets',
      adapter,
      params,
      data,
      warnings: data.warnings || []
    })
  } catch (error) {
    printFailure('lending_markets', adapter, params, error)
  }
})()
