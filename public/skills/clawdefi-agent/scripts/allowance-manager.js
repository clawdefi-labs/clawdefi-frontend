#!/usr/bin/env node
"use strict";

const MAX_UINT256 = (2n ** 256n) - 1n;

const IERC20_ABI = [
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)"
];

function printUsage() {
  console.log("Usage:");
  console.log("  node scripts/allowance-manager.js --mode exact --token-address <0x...> --spender-address <0x...> --desired-amount-wei <wei> --json");
  console.log("  node scripts/allowance-manager.js --mode revoke --token-address <0x...> --spender-address <0x...> --json");
  console.log("  node scripts/allowance-manager.js --mode unlimited --allow-unlimited --token-address <0x...> --spender-address <0x...> --json");
  console.log("");
  console.log("Input sources:");
  console.log("  --rpc-url <url>                (or RPC_URL / CHAIN_RPC_URL / ETH_RPC_URL)");
  console.log("  --chain-id <id>                (or CHAIN_ID)");
  console.log("  --owner-address <0x...>        (or WALLET_ADDRESS; optional if PRIVATE_KEY present)");
  console.log("  --private-key <0x...>          (or PRIVATE_KEY; used to derive owner if owner not supplied)");
  console.log("  --token-address <0x...>        (or TOKEN_ADDRESS)");
  console.log("  --spender-address <0x...>      (or SPENDER_ADDRESS)");
  console.log("  --mode <exact|revoke|unlimited> (default: exact)");
  console.log("  --desired-amount-wei <wei>     (required when mode=exact)");
  console.log("  --allow-unlimited              (required when mode=unlimited)");
  console.log("  --reset-first                  (optional; emits zero-reset then target set)");
  console.log("  --timeout-ms <ms>              (or ALLOWANCE_TIMEOUT_MS, default: 5000)");
  console.log("  --json                         (JSON output)");
  console.log("");
  console.log("Safety defaults:");
  console.log("  - exact allowance is default mode");
  console.log("  - unlimited allowance requires explicit --allow-unlimited");
  console.log("  - script does not broadcast transactions");
}

function parsePositiveInt(rawValue, key) {
  const value = Number.parseInt(String(rawValue), 10);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${key} must be a positive integer.`);
  }
  return value;
}

function parseBigIntValue(rawValue, key) {
  try {
    const value = BigInt(String(rawValue));
    if (value < 0n) {
      throw new Error(`${key} must be >= 0.`);
    }
    return value;
  } catch (err) {
    throw new Error(`${key} must be an integer string (${err instanceof Error ? err.message : String(err)}).`);
  }
}

function parseArgs(argv) {
  const config = {
    rpcUrl: process.env.RPC_URL || process.env.CHAIN_RPC_URL || process.env.ETH_RPC_URL || "",
    chainId: process.env.CHAIN_ID || "",
    ownerAddress: process.env.WALLET_ADDRESS || "",
    privateKey: process.env.PRIVATE_KEY || "",
    tokenAddress: process.env.TOKEN_ADDRESS || "",
    spenderAddress: process.env.SPENDER_ADDRESS || "",
    mode: (process.env.ALLOWANCE_MODE || "exact").toLowerCase(),
    desiredAmountWei: process.env.DESIRED_AMOUNT_WEI || "",
    allowUnlimited: String(process.env.ALLOW_UNLIMITED || "").toLowerCase() === "true",
    resetFirst: String(process.env.RESET_FIRST || "").toLowerCase() === "true",
    timeoutMs: process.env.ALLOWANCE_TIMEOUT_MS || "5000",
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
    if (arg === "--allow-unlimited") {
      config.allowUnlimited = true;
      continue;
    }
    if (arg === "--reset-first") {
      config.resetFirst = true;
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
    if (arg === "--owner-address") {
      config.ownerAddress = value;
      i += 1;
      continue;
    }
    if (arg === "--private-key") {
      config.privateKey = value;
      i += 1;
      continue;
    }
    if (arg === "--token-address") {
      config.tokenAddress = value;
      i += 1;
      continue;
    }
    if (arg === "--spender-address") {
      config.spenderAddress = value;
      i += 1;
      continue;
    }
    if (arg === "--mode") {
      config.mode = value.toLowerCase();
      i += 1;
      continue;
    }
    if (arg === "--desired-amount-wei") {
      config.desiredAmountWei = value;
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

  if (!["exact", "revoke", "unlimited"].includes(config.mode)) {
    throw new Error("mode must be one of: exact, revoke, unlimited.");
  }
  config.timeoutMs = String(parsePositiveInt(config.timeoutMs, "timeoutMs"));

  return {
    rpcUrl: config.rpcUrl.trim(),
    chainId: config.chainId.trim(),
    ownerAddress: config.ownerAddress.trim(),
    privateKey: config.privateKey.trim(),
    tokenAddress: config.tokenAddress.trim(),
    spenderAddress: config.spenderAddress.trim(),
    mode: config.mode,
    desiredAmountWei: config.desiredAmountWei.trim(),
    allowUnlimited: config.allowUnlimited,
    resetFirst: config.resetFirst,
    timeoutMs: parsePositiveInt(config.timeoutMs, "timeoutMs"),
    json: config.json
  };
}

function loadEthers() {
  try {
    const ethers = require("ethers");
    if (!ethers || !ethers.Wallet || !ethers.Contract || !ethers.JsonRpcProvider || !ethers.Interface) {
      throw new Error("ethers v6 APIs unavailable");
    }
    return ethers;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Missing dependency or invalid ethers runtime (${message}). Run: npm install ethers`);
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

async function withTimeout(promise, timeoutMs, label) {
  let timeoutHandle;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timeoutHandle = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
      })
    ]);
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
}

async function getTokenMetadata(contract, timeoutMs) {
  let symbol = null;
  let decimals = null;
  try {
    symbol = await withTimeout(contract.symbol(), timeoutMs, "symbol query");
  } catch (_) {
    symbol = null;
  }
  try {
    decimals = await withTimeout(contract.decimals(), timeoutMs, "decimals query");
    if (typeof decimals === "bigint") {
      decimals = Number(decimals);
    }
  } catch (_) {
    decimals = null;
  }
  return { symbol, decimals };
}

function buildApprovalSteps({
  tokenAddress,
  spenderAddress,
  ownerAddress,
  chainId,
  currentAllowance,
  targetAllowance,
  resetFirst,
  iface
}) {
  if (currentAllowance === targetAllowance) {
    return {
      action: "none",
      steps: []
    };
  }

  const steps = [];
  if (resetFirst && currentAllowance > 0n && targetAllowance > 0n) {
    steps.push({
      order: 1,
      type: "approve",
      amountWei: "0",
      to: tokenAddress,
      from: ownerAddress,
      chainId,
      data: iface.encodeFunctionData("approve", [spenderAddress, 0n]),
      reason: "Reset allowance to zero before setting target allowance."
    });
  }

  steps.push({
    order: steps.length + 1,
    type: "approve",
    amountWei: targetAllowance.toString(),
    to: tokenAddress,
    from: ownerAddress,
    chainId,
    data: iface.encodeFunctionData("approve", [spenderAddress, targetAllowance]),
    reason:
      targetAllowance === 0n
        ? "Revoke allowance for spender."
        : "Set allowance to target amount."
  });

  const action =
    targetAllowance === 0n
      ? "revoke"
      : targetAllowance > currentAllowance
        ? "increase"
        : "decrease";

  return { action, steps };
}

async function run(config, ethers) {
  if (!config.rpcUrl) {
    throw new Error("Missing RPC URL. Set --rpc-url or RPC_URL.");
  }
  if (!config.chainId) {
    throw new Error("Missing chain ID. Set --chain-id or CHAIN_ID.");
  }
  if (!config.tokenAddress) {
    throw new Error("Missing token address. Set --token-address or TOKEN_ADDRESS.");
  }
  if (!config.spenderAddress) {
    throw new Error("Missing spender address. Set --spender-address or SPENDER_ADDRESS.");
  }

  const expectedChainId = parsePositiveInt(config.chainId, "chainId");
  const tokenAddress = normalizeAddress(config.tokenAddress, "tokenAddress");
  const spenderAddress = normalizeAddress(config.spenderAddress, "spenderAddress");

  let ownerAddress = normalizeAddress(config.ownerAddress, "ownerAddress");
  let signerDerived = false;
  if (!ownerAddress && config.privateKey) {
    ownerAddress = normalizeAddress(new ethers.Wallet(config.privateKey).address, "derived ownerAddress");
    signerDerived = true;
  }
  if (!ownerAddress) {
    throw new Error("Missing owner address. Provide --owner-address/WALLET_ADDRESS or PRIVATE_KEY.");
  }

  const provider = new ethers.JsonRpcProvider(config.rpcUrl);
  const network = await withTimeout(provider.getNetwork(), config.timeoutMs, "rpc network check");
  const resolvedChainId = Number(network.chainId);
  if (!Number.isInteger(resolvedChainId) || resolvedChainId <= 0) {
    throw new Error("Failed to resolve chain id from RPC.");
  }
  if (resolvedChainId !== expectedChainId) {
    throw new Error(`Chain mismatch. Expected ${expectedChainId}, got ${resolvedChainId}.`);
  }

  const contract = new ethers.Contract(tokenAddress, IERC20_ABI, provider);
  const { symbol, decimals } = await getTokenMetadata(contract, config.timeoutMs);
  const currentAllowance = await withTimeout(
    contract.allowance(ownerAddress, spenderAddress),
    config.timeoutMs,
    "allowance query"
  );

  let targetAllowance = 0n;
  if (config.mode === "exact") {
    if (!config.desiredAmountWei) {
      throw new Error("desired amount is required for mode=exact (--desired-amount-wei).");
    }
    targetAllowance = parseBigIntValue(config.desiredAmountWei, "desiredAmountWei");
  } else if (config.mode === "revoke") {
    targetAllowance = 0n;
  } else {
    if (!config.allowUnlimited) {
      throw new Error("mode=unlimited requires explicit --allow-unlimited.");
    }
    targetAllowance = MAX_UINT256;
  }

  const iface = new ethers.Interface(IERC20_ABI);
  const { action, steps } = buildApprovalSteps({
    tokenAddress,
    spenderAddress,
    ownerAddress,
    chainId: resolvedChainId,
    currentAllowance: BigInt(currentAllowance.toString()),
    targetAllowance,
    resetFirst: config.resetFirst,
    iface
  });

  const warnings = [];
  if (config.mode === "unlimited") {
    warnings.push("Unlimited allowance selected. Use only when strictly required and trusted.");
  }
  if (config.mode === "exact" && config.resetFirst === false && BigInt(currentAllowance.toString()) > 0n && targetAllowance > 0n) {
    warnings.push("Some ERC20 tokens require allowance reset-to-zero before updating non-zero allowance. Use --reset-first when needed.");
  }

  const result = {
    ok: true,
    checkedAt: new Date().toISOString(),
    policy: {
      exactByDefault: true,
      mode: config.mode,
      allowUnlimited: config.allowUnlimited,
      resetFirst: config.resetFirst
    },
    token: {
      address: tokenAddress,
      symbol,
      decimals
    },
    owner: ownerAddress,
    ownerDerivedFromPrivateKey: signerDerived,
    spender: spenderAddress,
    chainId: resolvedChainId,
    allowance: {
      currentWei: currentAllowance.toString(),
      targetWei: targetAllowance.toString(),
      deltaWei: (targetAllowance - BigInt(currentAllowance.toString())).toString(),
      action
    },
    steps,
    warnings
  };

  return result;
}

function printResult(result, jsonMode) {
  if (jsonMode) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(`token=${result.token.address}`);
  console.log(`owner=${result.owner}`);
  console.log(`spender=${result.spender}`);
  console.log(`chainId=${result.chainId}`);
  console.log(`currentAllowanceWei=${result.allowance.currentWei}`);
  console.log(`targetAllowanceWei=${result.allowance.targetWei}`);
  console.log(`action=${result.allowance.action}`);
  console.log(`steps=${result.steps.length}`);
  if (result.warnings.length > 0) {
    console.log(`warnings=${result.warnings.join(" | ")}`);
  }
}

async function main() {
  const config = parseArgs(process.argv.slice(2));
  const ethers = loadEthers();
  const result = await run(config, ethers);
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
