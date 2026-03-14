'use strict'

const fs = require('node:fs/promises')

const {
  deriveAddresses,
  defaultChainForFamily,
  fail,
  loadWalletModules,
  normalizeFamily,
  parseArgs,
  parseIndex,
  printJson,
  writeEnvValue,
  writeSelection
} = require('./wallet-common.js')

async function readStdin () {
  const chunks = []
  for await (const chunk of process.stdin) {
    chunks.push(chunk)
  }
  return Buffer.concat(chunks).toString('utf8').trim()
}

;(async () => {
  try {
    const args = parseArgs(process.argv.slice(2))
    const index = parseIndex(args.index, 0)
    const family = normalizeFamily(args.family || 'evm')

    let seedPhrase = ''
    if (args.seed) {
      seedPhrase = String(args.seed).trim()
    } else if (args['seed-file']) {
      seedPhrase = (await fs.readFile(String(args['seed-file']), 'utf8')).trim()
    } else if (args.stdin) {
      seedPhrase = await readStdin()
    }

    if (!seedPhrase) {
      throw new Error('Provide a seed with --seed, --seed-file, or --stdin.')
    }

    const { WalletManagerEvm } = await loadWalletModules()
    if (!WalletManagerEvm.isValidSeedPhrase(seedPhrase)) {
      throw new Error('Invalid BIP-39 seed phrase.')
    }

    await writeEnvValue('WDK_SEED', seedPhrase)
    const selection = await writeSelection({
      family,
      chain: args.chain || defaultChainForFamily(family),
      index
    })

    const addresses = await deriveAddresses(seedPhrase, selection.index)

    printJson({
      ok: true,
      action: 'wallet_import',
      selection,
      addresses
    })
  } catch (error) {
    fail(error.message, { action: 'wallet_import' })
  }
})()
