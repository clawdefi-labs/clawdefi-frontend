'use strict'

const {
  loadAdapter,
  parseArgs,
  printFailure,
  printSuccess,
  withWalletContext
} = require('./perps-common.js')

async function resolveWalletAddress (args) {
  if (args.address) {
    return String(args.address).trim()
  }

  const wallet = await withWalletContext(args, 'read', async ({ address }) => ({ address }))
  return wallet.address
}

;(async () => {
  const args = parseArgs(process.argv.slice(2))
  const { adapter, impl } = loadAdapter(args.adapter)

  const chain = args.chain || 'base-mainnet'
  const params = {
    adapter,
    chain,
    address: args.address || null
  }

  try {
    const walletAddress = await resolveWalletAddress(args)
    const orders = await impl.listPendingOrders({
      chain,
      walletAddress
    })

    printSuccess({
      module: 'perps_pending_orders',
      adapter,
      params,
      data: orders,
      warnings: orders.warnings || []
    })
  } catch (error) {
    printFailure('perps_pending_orders', adapter, params, error)
  }
})()
