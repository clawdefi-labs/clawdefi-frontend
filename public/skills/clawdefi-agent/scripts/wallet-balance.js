'use strict'

const {
  chainToFamily,
  fail,
  getTokenList,
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
    const seed = await requireSeed()
    const selection = await readSelection()
    const chain = args.chain || selection.chain
    const index = parseIndex(args.index, selection.index)
    const tokens = getTokenList(args)

    const result = await withAccount(chain, index, seed, async ({ account }) => {
      const address = await account.getAddress()
      const nativeBalance = await account.getBalance()
      const tokenBalances = {}

      if (tokens.length > 0) {
        if (typeof account.getTokenBalances === 'function' && tokens.length > 1) {
          const balances = await account.getTokenBalances(tokens)
          for (const [token, amount] of Object.entries(balances)) {
            tokenBalances[token] = String(amount)
          }
        } else {
          for (const token of tokens) {
            tokenBalances[token] = String(await account.getTokenBalance(token))
          }
        }
      }

      return {
        address,
        nativeBalance: String(nativeBalance),
        tokenBalances
      }
    }, { intent: 'read' })

    printJson({
      ok: true,
      action: 'wallet_balance',
      selection: { family: chainToFamily(chain), chain, index },
      ...result
    })
  } catch (error) {
    fail(error.message, { action: 'wallet_balance' })
  }
})()
