'use strict'

const {
  chainToFamily,
  fail,
  parseAmountBaseUnits,
  parseArgs,
  parseIndex,
  printJson,
  readSelection,
  requireSeed,
  withAccount
} = require('./wallet-common.js')

;(async () => {
  try {
    const args = parseArgs(process.argv.slice(2))
    const recipient = args.recipient
    if (!recipient) {
      throw new Error('Missing required --recipient.')
    }

    const amount = parseAmountBaseUnits(args.amount)
    const dryRun = Boolean(args['dry-run'])
    const token = args.token ? String(args.token) : null

    const seed = await requireSeed()
    const selection = await readSelection()
    const chain = args.chain || selection.chain
    const index = parseIndex(args.index, selection.index)

    const result = await withAccount(chain, index, seed, async ({ account }) => {
      const address = await account.getAddress()

      if (token) {
        const quote = await account.quoteTransfer({
          token,
          recipient,
          amount
        })

        if (dryRun) {
          return {
            address,
            mode: 'quote_transfer',
            token,
            fee: String(quote.fee)
          }
        }

        const transferResult = await account.transfer({
          token,
          recipient,
          amount
        })

        return {
          address,
          mode: 'transfer',
          token,
          hash: transferResult.hash,
          fee: String(transferResult.fee)
        }
      }

      if (chain === 'solana') {
        const quote = await account.quoteSendTransaction({
          recipient,
          value: amount
        })

        if (dryRun) {
          return {
            address,
            mode: 'quote_send_transaction',
            fee: String(quote.fee)
          }
        }

        const sendResult = await account.sendTransaction({
          recipient,
          value: amount
        })

        return {
          address,
          mode: 'send_transaction',
          hash: sendResult.hash,
          fee: String(sendResult.fee)
        }
      }

      const quote = await account.quoteSendTransaction({
        to: recipient,
        value: amount
      })

      if (dryRun) {
        return {
          address,
          mode: 'quote_send_transaction',
          fee: String(quote.fee)
        }
      }

      const sendResult = await account.sendTransaction({
        to: recipient,
        value: amount
      })

      return {
        address,
        mode: 'send_transaction',
        hash: sendResult.hash,
        fee: String(sendResult.fee)
      }
    }, { intent: dryRun ? 'simulate' : 'broadcast' })

    printJson({
      ok: true,
      action: 'wallet_transfer',
      selection: { family: chainToFamily(chain), chain, index },
      recipient,
      amount: String(amount),
      token,
      dryRun,
      ...result
    })
  } catch (error) {
    fail(error.message, { action: 'wallet_transfer' })
  }
})()
