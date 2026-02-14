#!/usr/bin/env node
"use strict";

const NATIVE_ALIAS = "NATIVE";
const NATIVE_SENTINEL = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";

const ERC20_ABI = [
  "function balanceOf(address account) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)"
];

function printUsage() {
  console.log("Usage:");
  console.log("  node scripts/token-balance-check.js --chain-id <id> --wallet-address <0x...> --token-address <0x...|NATIVE> --json");
  console.log("  node scripts/token-balance-check.js --rpc-url <url> --chain-id <id> --wallet-address <0x...> --token-address NATIVE --json");
  console.log("");
  console.log("Input sources:");
  console.log("  --rpc-url <url>                (or RPC_URL / CHAIN_RPC_URL / ETH_RPC_URL)");
  console.log("  --chain-id <id>                (or CHAIN_ID)");
  console.log("  --wallet-address <0x...>       (or WALLET_ADDRESS)");
  console.log("  --token-address <0x...|NATIVE> (or TOKEN_ADDRESS)");
  console.log("  --timeout-ms <ms>              (or TOKEN_BALANCE_TIMEOUT_MS, default: 7000)");
  console.log("  --json                         (JSON output)");
  console.log("");
  console.log("Notes:");
  console.log("  - Native token is supported via NATIVE alias.");
  console.log("  - For ERC20 balances, script reads balanceOf + optional symbol/decimals.");
}

function parsePositiveInt(rawValue, key) {
  const value = Number.parseInt(String(rawValue), 10);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${key} must be a positive integer.`);
  }
  return value;
}

function normalizeAddress(value, key) {
  if (!/^0x[a-fA-F0-9]{40}$/.test(value)) {
    throw new Error(`${key} must be a valid 20-byte hex address.`);
  }
  return value.toLowerCase();
}

function normalizeTokenAddress(value) {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error("tokenAddress is required.");
  }
  if (trimmed.toUpperCase() === NATIVE_ALIAS) {
    return NATIVE_SENTINEL;
  }
  return normalizeAddress(trimmed, "tokenAddress");
}

function loadEthers() {
  try {
    const ethers = require("ethers");
    if (!ethers || !ethers.JsonRpcProvider || !ethers.Contract || typeof ethers.formatUnits !== "function") {
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
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
    })
  ]);
}

function parseArgs(argv) {
  const config = {
    rpcUrl: process.env.RPC_URL || process.env.CHAIN_RPC_URL || process.env.ETH_RPC_URL || "",
    chainId: process.env.CHAIN_ID || "",
    walletAddress: process.env.WALLET_ADDRESS || "",
    tokenAddress: process.env.TOKEN_ADDRESS || "",
    timeoutMs: process.env.TOKEN_BALANCE_TIMEOUT_MS || "7000",
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
    if (arg === "--token-address") {
      config.tokenAddress = value;
      i += 1;
      continue;
    }
    if (arg === "--timeout-ms") {
      config.timeoutMs = value;
      i += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!config.rpcUrl.trim()) {
    throw new Error("Missing rpcUrl. Set --rpc-url or RPC_URL.");
  }

  return {
    rpcUrl: config.rpcUrl.trim(),
    chainId: parsePositiveInt(config.chainId, "chainId"),
    walletAddress: normalizeAddress(config.walletAddress.trim(), "walletAddress"),
    tokenAddress: normalizeTokenAddress(config.tokenAddress),
    timeoutMs: parsePositiveInt(config.timeoutMs, "timeoutMs"),
    json: config.json
  };
}

async function getNativeBalance(ethers, provider, walletAddress, timeoutMs) {
  const rawBalance = await withTimeout(
    provider.getBalance(walletAddress),
    timeoutMs,
    "native balance query"
  );
  return {
    tokenType: "native",
    tokenAddress: NATIVE_SENTINEL,
    symbol: "NATIVE",
    decimals: 18,
    balanceWei: rawBalance.toString(),
    balanceFormatted: ethers.formatEther(rawBalance)
  };
}

async function getErc20Balance(ethers, provider, walletAddress, tokenAddress, timeoutMs) {
  const contract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);

  const [rawBalance, decimalsResult, symbolResult] = await Promise.all([
    withTimeout(contract.balanceOf(walletAddress), timeoutMs, "balanceOf query"),
    withTimeout(contract.decimals(), timeoutMs, "decimals query").catch(() => null),
    withTimeout(contract.symbol(), timeoutMs, "symbol query").catch(() => null)
  ]);

  const decimals = typeof decimalsResult === "number" ? decimalsResult : 18;
  const symbol = typeof symbolResult === "string" && symbolResult.trim() ? symbolResult.trim() : null;

  return {
    tokenType: "erc20",
    tokenAddress,
    symbol,
    decimals,
    balanceWei: rawBalance.toString(),
    balanceFormatted: ethers.formatUnits(rawBalance, decimals)
  };
}

function printResult(result, jsonMode) {
  if (jsonMode) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(`wallet=${result.walletAddress}`);
  console.log(`chainId=${result.chainId}`);
  console.log(`tokenAddress=${result.tokenAddress}`);
  if (result.symbol) {
    console.log(`symbol=${result.symbol}`);
  }
  console.log(`balanceWei=${result.balanceWei}`);
  console.log(`balanceFormatted=${result.balanceFormatted}`);
}

async function main() {
  const config = parseArgs(process.argv.slice(2));
  const ethers = loadEthers();

  const provider = new ethers.JsonRpcProvider(config.rpcUrl);
  const network = await withTimeout(provider.getNetwork(), config.timeoutMs, "network check");
  const resolvedChainId = Number(network.chainId);
  if (resolvedChainId !== config.chainId) {
    throw new Error(`Chain mismatch. Expected ${config.chainId}, got ${resolvedChainId}.`);
  }

  const balance =
    config.tokenAddress === NATIVE_SENTINEL
      ? await getNativeBalance(ethers, provider, config.walletAddress, config.timeoutMs)
      : await getErc20Balance(
          ethers,
          provider,
          config.walletAddress,
          config.tokenAddress,
          config.timeoutMs
        );

  const result = {
    checkedAt: new Date().toISOString(),
    walletAddress: config.walletAddress,
    chainId: config.chainId,
    rpcUrl: config.rpcUrl,
    ...balance
  };

  printResult(result, config.json);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(
    JSON.stringify(
      {
        ok: false,
        error: message
      },
      null,
      2
    )
  );
  process.exit(1);
});
