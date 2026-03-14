'use strict'

const {
  chainToFamily,
  fail,
  parseAmountBaseUnits,
  parseArgs,
  parseIndex,
  parseOptionalBigInt,
  printJson,
  readSelection,
  requireSeed,
  withAccount
} = require('./wallet-common.js')

;(async () => {
  try {
    const args = parseArgs(process.argv.slice(2))
    const recipient = args.recipient || args.to
    if (!recipient) {
      throw new Error('Missing required --recipient or --to.')
    }

    const amount = parseAmountBaseUnits(args.amount || args.value)
    const seed = await requireSeed()
    const selection = await readSelection()
    const chain = args.chain || selection.chain
    const index = parseIndex(args.index, selection.index)

    const result = await withAccount(chain, index, seed, async ({ account }) => {
      const address = await account.getAddress()

      if (chain === 'solana') {
        const sendResult = await account.sendTransaction({
          recipient,
          value: amount,
          commitment: args.commitment || undefined
        })

        return {
          address,
          mode: 'sign_and_broadcast',
          hash: sendResult.signature || sendResult.hash,
          fee: String(sendResult.fee)
        }
      }

      const tx = {
        to: recipient,
        value: amount
      }

      if (args.data) {
        tx.data = String(args.data)
      }

      const gasLimit = parseOptionalBigInt(args['gas-limit'], 'gas-limit')
      const gasPrice = parseOptionalBigInt(args['gas-price'], 'gas-price')
      const maxFeePerGas = parseOptionalBigInt(args['max-fee-per-gas'], 'max-fee-per-gas')
      const maxPriorityFeePerGas = parseOptionalBigInt(args['max-priority-fee-per-gas'], 'max-priority-fee-per-gas')

      if (typeof gasLimit !== 'undefined') {
        tx.gasLimit = gasLimit
      }
      if (typeof gasPrice !== 'undefined') {
        tx.gasPrice = gasPrice
      }
      if (typeof maxFeePerGas !== 'undefined') {
        tx.maxFeePerGas = maxFeePerGas
      }
      if (typeof maxPriorityFeePerGas !== 'undefined') {
        tx.maxPriorityFeePerGas = maxPriorityFeePerGas
      }

      const sendResult = await account.sendTransaction(tx)
      return {
        address,
        mode: 'sign_and_broadcast',
        hash: sendResult.hash,
        fee: String(sendResult.fee)
      }
    }, { intent: 'broadcast' })

    printJson({
      ok: true,
      action: 'wallet_sign_broadcast',
      selection: { family: chainToFamily(chain), chain, index },
      recipient,
      amount: String(amount),
      ...result
    })
  } catch (error) {
    fail(error.message, { action: 'wallet_sign_broadcast' })
  }
})()
