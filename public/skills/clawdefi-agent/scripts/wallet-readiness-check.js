#!/usr/bin/env node
"use strict";

function printUsage() {
  console.log("Usage:");
  console.log("  node scripts/wallet-readiness-check.js --json");
  console.log("  node scripts/wallet-readiness-check.js --rpc-url <url> --chain-id <id> --wallet-address <0x...> --private-key <0x...> --json");
  console.log("");
  console.log("Input sources:");
  console.log("  --rpc-url <url>              (or RPC_URL / CHAIN_RPC_URL / ETH_RPC_URL)");
  console.log("  --chain-id <id>              (or CHAIN_ID)");
  console.log("  --wallet-address <0x...>     (or WALLET_ADDRESS, optional if derivable from private key)");
  console.log("  --private-key <0x...>        (or PRIVATE_KEY)");
  console.log("  --timeout-ms <ms>            (or READINESS_TIMEOUT_MS, default: 5000)");
  console.log("  --min-native-balance-wei <n> (or MIN_NATIVE_BALANCE_WEI, default: 1)");
  console.log("");
  console.log("Notes:");
  console.log("  - Private key is never printed.");
  console.log("  - Script exits non-zero when any readiness check fails.");
}

function parsePositiveInt(rawValue, key) {
  const value = Number.parseInt(String(rawValue), 10);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${key} must be a positive integer.`);
  }
  return value;
}

function parseArgs(argv) {
  const config = {
    rpcUrl: process.env.RPC_URL || process.env.CHAIN_RPC_URL || process.env.ETH_RPC_URL || "",
    chainId: process.env.CHAIN_ID || "",
    walletAddress: process.env.WALLET_ADDRESS || "",
    privateKey: process.env.PRIVATE_KEY || "",
    timeoutMs: process.env.READINESS_TIMEOUT_MS || "5000",
    minNativeBalanceWei: process.env.MIN_NATIVE_BALANCE_WEI || "1",
    json: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--help" || arg === "-h") {
      printUsage();
      process.exit(0);
    }
    if (arg === "--json") {
      config.json = true;
      continue;
    }

    const value = argv[i + 1];
    if (!value || value.startsWith("-")) {
      throw new Error(`Missing value for ${arg}`);
    }

    if (arg === "--rpc-url") {
      config.rpcUrl = value;
      i += 1;
      continue;
    }
    if (arg === "--chain-id") {
      config.chainId = value;
      i += 1;
      continue;
    }
    if (arg === "--wallet-address") {
      config.walletAddress = value;
      i += 1;
      continue;
    }
    if (arg === "--private-key") {
      config.privateKey = value;
      i += 1;
      continue;
    }
    if (arg === "--timeout-ms") {
      config.timeoutMs = value;
      i += 1;
      continue;
    }
    if (arg === "--min-native-balance-wei") {
      config.minNativeBalanceWei = value;
      i += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  config.timeoutMs = String(parsePositiveInt(config.timeoutMs, "timeoutMs"));
  config.minNativeBalanceWei = String(parsePositiveInt(config.minNativeBalanceWei, "minNativeBalanceWei"));

  return {
    rpcUrl: config.rpcUrl.trim(),
    chainId: config.chainId.trim(),
    walletAddress: config.walletAddress.trim(),
    privateKey: config.privateKey.trim(),
    timeoutMs: parsePositiveInt(config.timeoutMs, "timeoutMs"),
    minNativeBalanceWei: BigInt(config.minNativeBalanceWei),
    json: config.json
  };
}

function loadEthers() {
  try {
    const ethers = require("ethers");
    if (!ethers || !ethers.Wallet || !ethers.JsonRpcProvider || typeof ethers.verifyMessage !== "function") {
      throw new Error("ethers v6 APIs unavailable");
    }
    return ethers;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Missing dependency or invalid ethers runtime (${message}). Run: npm install ethers`
    );
  }
}

async function withTimeout(promise, timeoutMs, label) {
  let timeoutHandle;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timeoutHandle = setTimeout(() => {
          reject(new Error(`${label} timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      })
    ]);
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
}

function normalizeAddress(value, key) {
  if (!value) {
    return "";
  }
  if (!/^0x[a-fA-F0-9]{40}$/.test(value)) {
    throw new Error(`${key} must be a valid 20-byte hex address.`);
  }
  return value.toLowerCase();
}

function assertRequiredReadinessInputs(config) {
  const missing = [];
  if (!config.rpcUrl) {
    missing.push("RPC_URL or --rpc-url");
  }
  if (!config.chainId) {
    missing.push("CHAIN_ID or --chain-id");
  }
  if (!config.privateKey) {
    missing.push("PRIVATE_KEY or --private-key");
  }
  if (missing.length === 0) {
    return;
  }

  throw new Error(
    [
      `Missing required readiness inputs: ${missing.join(", ")}.`,
      "Do not run bare --json without required signer context.",
      "Set local env first (example):",
      "export RPC_URL='https://mainnet.base.org'",
      "export CHAIN_ID='8453'",
      "export PRIVATE_KEY='0x...'",
      "node scripts/wallet-readiness-check.js --json",
      "Or provide explicit flags:",
      "node scripts/wallet-readiness-check.js --rpc-url <url> --chain-id <id> --private-key <0x...> --json"
    ].join(" ")
  );
}

async function runChecks(config, ethers) {
  assertRequiredReadinessInputs(config);

  const expectedChainId = parsePositiveInt(config.chainId, "chainId");
  const provider = new ethers.JsonRpcProvider(config.rpcUrl);

  const network = await withTimeout(provider.getNetwork(), config.timeoutMs, "rpc network check");
  const resolvedChainId = Number(network.chainId);
  if (!Number.isInteger(resolvedChainId) || resolvedChainId <= 0) {
    throw new Error("Failed to resolve chain id from RPC.");
  }

  const chainMatches = resolvedChainId === expectedChainId;
  if (!chainMatches) {
    throw new Error(
      `Chain mismatch. Expected ${expectedChainId}, got ${resolvedChainId}.`
    );
  }

  const wallet = new ethers.Wallet(config.privateKey, provider);
  const derivedAddress = normalizeAddress(wallet.address, "derived wallet address");
  const requestedAddress = normalizeAddress(config.walletAddress, "wallet address");

  if (requestedAddress && requestedAddress !== derivedAddress) {
    throw new Error(
      `Wallet mismatch. Expected ${requestedAddress}, signer derived ${derivedAddress}.`
    );
  }

  const balanceWei = await withTimeout(
    provider.getBalance(wallet.address),
    config.timeoutMs,
    "balance check"
  );
  const nonce = await withTimeout(
    provider.getTransactionCount(wallet.address, "latest"),
    config.timeoutMs,
    "nonce check"
  );

  const balanceSane = balanceWei >= config.minNativeBalanceWei;
  if (!balanceSane) {
    throw new Error(
      `Insufficient native balance for readiness. Need >= ${config.minNativeBalanceWei.toString()} wei.`
    );
  }

  const message = `clawdefi-wallet-readiness:${resolvedChainId}:${new Date().toISOString()}`;
  const signature = await withTimeout(
    wallet.signMessage(message),
    config.timeoutMs,
    "signature roundtrip sign"
  );
  const recoveredAddress = normalizeAddress(
    ethers.verifyMessage(message, signature),
    "recovered address"
  );
  const signatureRoundtrip = recoveredAddress === derivedAddress;
  if (!signatureRoundtrip) {
    throw new Error("Signature roundtrip failed: recovered signer mismatch.");
  }

  const result = {
    ok: true,
    checkedAt: new Date().toISOString(),
    walletAddress: derivedAddress,
    chainId: resolvedChainId,
    rpcUrl: config.rpcUrl,
    checks: {
      rpcHealthy: true,
      chainSelected: true,
      chainMatchesExpected: true,
      balanceSane: true,
      nonceReadable: Number.isInteger(nonce) && nonce >= 0,
      signatureRoundtrip: true
    },
    metrics: {
      balanceWei: balanceWei.toString(),
      balanceEth: ethers.formatEther(balanceWei),
      nonce,
      minNativeBalanceWei: config.minNativeBalanceWei.toString()
    }
  };

  return result;
}

function printResult(result, jsonMode) {
  if (jsonMode) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(`wallet=${result.walletAddress}`);
  console.log(`chainId=${result.chainId}`);
  console.log(`rpcHealthy=${result.checks.rpcHealthy}`);
  console.log(`balanceWei=${result.metrics.balanceWei}`);
  console.log(`nonce=${result.metrics.nonce}`);
  console.log(`signatureRoundtrip=${result.checks.signatureRoundtrip}`);
  console.log("status=ready");
}

async function main() {
  const config = parseArgs(process.argv.slice(2));
  assertRequiredReadinessInputs(config);
  const ethers = loadEthers();
  const result = await runChecks(config, ethers);
  printResult(result, config.json);
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  const output = {
    ok: false,
    error: message,
    checkedAt: new Date().toISOString()
  };
  console.error(JSON.stringify(output, null, 2));
  process.exit(1);
});
