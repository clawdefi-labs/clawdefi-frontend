#!/usr/bin/env node
"use strict";

const MAX_BPS = 10000n;
const ERROR_STRING_SELECTOR = "0x08c379a0";
const PANIC_SELECTOR = "0x4e487b71";

function printUsage() {
  console.log("Usage:");
  console.log("  node scripts/simulate-transaction.js --to <0x...> --data <0x...> --json");
  console.log("  node scripts/simulate-transaction.js --rpc-url <url> --chain-id <id> --to <0x...> --from-address <0x...> --value-wei <wei> --data <0x...> --max-slippage-bps 100 --quoted-out-wei <wei> --min-out-wei <wei> --json");
  console.log("");
  console.log("Input sources:");
  console.log("  --rpc-url <url>                (or RPC_URL / CHAIN_RPC_URL / ETH_RPC_URL)");
  console.log("  --chain-id <id>                (or CHAIN_ID)");
  console.log("  --to <0x...>                   (or TX_TO)");
  console.log("  --from-address <0x...>         (or WALLET_ADDRESS, optional)");
  console.log("  --private-key <0x...>          (or PRIVATE_KEY, optional if from-address set)");
  console.log("  --data <0x...>                 (or TX_DATA, default: 0x)");
  console.log("  --value-wei <wei>              (or TX_VALUE_WEI, default: 0)");
  console.log("  --gas-limit <n>                (or TX_GAS_LIMIT, optional)");
  console.log("  --timeout-ms <ms>              (or SIM_TIMEOUT_MS, default: 7000)");
  console.log("  --quoted-out-wei <wei>         (or QUOTED_OUT_WEI, optional)");
  console.log("  --min-out-wei <wei>            (or MIN_OUT_WEI, optional)");
  console.log("  --max-slippage-bps <0-10000>   (or MAX_SLIPPAGE_BPS, optional)");
  console.log("  --json                         (JSON output)");
  console.log("");
  console.log("Safety defaults:");
  console.log("  - fail-closed on RPC/network mismatch, call revert, gas estimate failure, or slippage policy breach");
  console.log("  - script does not sign or broadcast transactions");
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
    throw new Error(
      `${key} must be an integer string (${err instanceof Error ? err.message : String(err)}).`
    );
  }
}

function parseArgs(argv) {
  const config = {
    rpcUrl: process.env.RPC_URL || process.env.CHAIN_RPC_URL || process.env.ETH_RPC_URL || "",
    chainId: process.env.CHAIN_ID || "",
    to: process.env.TX_TO || "",
    fromAddress: process.env.WALLET_ADDRESS || "",
    privateKey: process.env.PRIVATE_KEY || "",
    data: process.env.TX_DATA || "0x",
    valueWei: process.env.TX_VALUE_WEI || "0",
    gasLimit: process.env.TX_GAS_LIMIT || "",
    timeoutMs: process.env.SIM_TIMEOUT_MS || "7000",
    quotedOutWei: process.env.QUOTED_OUT_WEI || "",
    minOutWei: process.env.MIN_OUT_WEI || "",
    maxSlippageBps: process.env.MAX_SLIPPAGE_BPS || "",
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
    if (arg === "--to") {
      config.to = value;
      i += 1;
      continue;
    }
    if (arg === "--from-address") {
      config.fromAddress = value;
      i += 1;
      continue;
    }
    if (arg === "--private-key") {
      config.privateKey = value;
      i += 1;
      continue;
    }
    if (arg === "--data") {
      config.data = value;
      i += 1;
      continue;
    }
    if (arg === "--value-wei") {
      config.valueWei = value;
      i += 1;
      continue;
    }
    if (arg === "--gas-limit") {
      config.gasLimit = value;
      i += 1;
      continue;
    }
    if (arg === "--timeout-ms") {
      config.timeoutMs = value;
      i += 1;
      continue;
    }
    if (arg === "--quoted-out-wei") {
      config.quotedOutWei = value;
      i += 1;
      continue;
    }
    if (arg === "--min-out-wei") {
      config.minOutWei = value;
      i += 1;
      continue;
    }
    if (arg === "--max-slippage-bps") {
      config.maxSlippageBps = value;
      i += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if ((config.quotedOutWei && !config.minOutWei) || (!config.quotedOutWei && config.minOutWei)) {
    throw new Error("quotedOutWei and minOutWei must be provided together.");
  }

  config.timeoutMs = String(parsePositiveInt(config.timeoutMs, "timeoutMs"));
  if (config.gasLimit) {
    config.gasLimit = String(parsePositiveInt(config.gasLimit, "gasLimit"));
  }

  return {
    rpcUrl: config.rpcUrl.trim(),
    chainId: config.chainId.trim(),
    to: config.to.trim(),
    fromAddress: config.fromAddress.trim(),
    privateKey: config.privateKey.trim(),
    data: config.data.trim(),
    valueWei: parseBigIntValue(config.valueWei, "valueWei"),
    gasLimit: config.gasLimit ? BigInt(config.gasLimit) : null,
    timeoutMs: parsePositiveInt(config.timeoutMs, "timeoutMs"),
    quotedOutWei: config.quotedOutWei.trim() ? parseBigIntValue(config.quotedOutWei, "quotedOutWei") : null,
    minOutWei: config.minOutWei.trim() ? parseBigIntValue(config.minOutWei, "minOutWei") : null,
    maxSlippageBps: config.maxSlippageBps.trim()
      ? BigInt(parsePositiveInt(config.maxSlippageBps, "maxSlippageBps"))
      : null,
    json: config.json
  };
}

function loadEthers() {
  try {
    const ethers = require("ethers");
    if (
      !ethers ||
      !ethers.Wallet ||
      !ethers.JsonRpcProvider ||
      !ethers.AbiCoder ||
      typeof ethers.formatEther !== "function"
    ) {
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

function normalizeAddress(value, key) {
  if (!value) {
    return "";
  }
  if (!/^0x[a-fA-F0-9]{40}$/.test(value)) {
    throw new Error(`${key} must be a valid 20-byte hex address.`);
  }
  return value.toLowerCase();
}

function normalizeHexData(value, key) {
  if (!value) {
    return "0x";
  }
  if (!/^0x[a-fA-F0-9]*$/.test(value)) {
    throw new Error(`${key} must be a hex string (0x...).`);
  }
  if (value.length % 2 !== 0) {
    throw new Error(`${key} must have an even-length hex payload.`);
  }
  return value.toLowerCase();
}

function maybeHex(value) {
  return typeof value === "string" && /^0x[a-fA-F0-9]*$/.test(value);
}

function extractRevertData(error) {
  const queue = [error];
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || typeof current !== "object") {
      continue;
    }
    const node = current;
    const candidates = [
      node.data,
      node.error && node.error.data,
      node.info && node.info.error && node.info.error.data,
      node.cause && node.cause.data
    ];
    for (const candidate of candidates) {
      if (maybeHex(candidate)) {
        return candidate;
      }
    }
    if (node.error && typeof node.error === "object") {
      queue.push(node.error);
    }
    if (node.info && typeof node.info === "object") {
      queue.push(node.info);
    }
    if (node.cause && typeof node.cause === "object") {
      queue.push(node.cause);
    }
  }
  return null;
}

function decodeRevertData(ethers, revertData) {
  if (!revertData || revertData === "0x" || revertData.length < 10) {
    return {
      type: "unknown",
      reason: "No revert payload available."
    };
  }

  const selector = revertData.slice(0, 10).toLowerCase();
  const payload = `0x${revertData.slice(10)}`;
  const abiCoder = ethers.AbiCoder.defaultAbiCoder();

  if (selector === ERROR_STRING_SELECTOR) {
    try {
      const decoded = abiCoder.decode(["string"], payload);
      return {
        type: "Error(string)",
        reason: decoded[0]
      };
    } catch (_) {
      return {
        type: "Error(string)",
        reason: "Failed to decode Error(string) payload."
      };
    }
  }

  if (selector === PANIC_SELECTOR) {
    try {
      const decoded = abiCoder.decode(["uint256"], payload);
      const code = BigInt(decoded[0]);
      return {
        type: "Panic(uint256)",
        reason: `panic code ${code.toString()} (0x${code.toString(16)})`
      };
    } catch (_) {
      return {
        type: "Panic(uint256)",
        reason: "Failed to decode Panic(uint256) payload."
      };
    }
  }

  return {
    type: `custom(${selector})`,
    reason: "Custom error selector (ABI required for full decoding)."
  };
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

function computeImpliedSlippageBps(quotedOutWei, minOutWei) {
  if (quotedOutWei <= 0n) {
    throw new Error("quotedOutWei must be greater than zero.");
  }
  if (minOutWei > quotedOutWei) {
    throw new Error("minOutWei must be less than or equal to quotedOutWei.");
  }
  const delta = quotedOutWei - minOutWei;
  return (delta * MAX_BPS + quotedOutWei - 1n) / quotedOutWei;
}

function formatBpsAsPct(bps) {
  const whole = bps / 100n;
  const frac = bps % 100n;
  return `${whole.toString()}.${frac.toString().padStart(2, "0")}%`;
}

async function run(config, ethers) {
  if (!config.rpcUrl) {
    throw new Error("Missing RPC URL. Set --rpc-url or RPC_URL.");
  }
  if (!config.chainId) {
    throw new Error("Missing chain ID. Set --chain-id or CHAIN_ID.");
  }
  if (!config.to) {
    throw new Error("Missing transaction target. Set --to or TX_TO.");
  }
  if (config.maxSlippageBps !== null && config.maxSlippageBps > MAX_BPS) {
    throw new Error("maxSlippageBps must be <= 10000.");
  }

  const expectedChainId = parsePositiveInt(config.chainId, "chainId");
  const to = normalizeAddress(config.to, "to");
  const data = normalizeHexData(config.data, "data");

  let fromAddress = normalizeAddress(config.fromAddress, "fromAddress");
  if (config.privateKey) {
    const derived = normalizeAddress(new ethers.Wallet(config.privateKey).address, "derivedAddress");
    if (!fromAddress) {
      fromAddress = derived;
    } else if (fromAddress !== derived) {
      throw new Error(`fromAddress mismatch with private key derived address (${derived}).`);
    }
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

  const txRequest = {
    to,
    from: fromAddress || undefined,
    data,
    value: config.valueWei,
    gasLimit: config.gasLimit ?? undefined
  };

  let callSucceeded = false;
  let returnData = null;
  let revert = null;
  try {
    const callResult = await withTimeout(provider.call(txRequest, "latest"), config.timeoutMs, "eth_call");
    returnData = normalizeHexData(String(callResult), "returnData");
    callSucceeded = true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const revertData = extractRevertData(error);
    const decoded = decodeRevertData(ethers, revertData);
    revert = {
      message,
      revertData,
      decoded
    };
  }

  let gasEstimate = null;
  let gasEstimated = false;
  if (callSucceeded) {
    try {
      gasEstimate = await withTimeout(provider.estimateGas(txRequest), config.timeoutMs, "estimateGas");
      gasEstimated = true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      revert = revert || {
        message,
        revertData: extractRevertData(error),
        decoded: decodeRevertData(ethers, extractRevertData(error))
      };
    }
  }

  let feeData = null;
  let fromBalanceWei = null;
  let maxEstimatedCostWei = null;
  let balanceSufficient = null;

  if (gasEstimated) {
    const rawFeeData = await withTimeout(provider.getFeeData(), config.timeoutMs, "feeData");
    const gasPriceWei = rawFeeData.gasPrice ?? rawFeeData.maxFeePerGas ?? null;
    feeData = {
      gasPriceWei: gasPriceWei ? gasPriceWei.toString() : null,
      maxFeePerGasWei: rawFeeData.maxFeePerGas ? rawFeeData.maxFeePerGas.toString() : null,
      maxPriorityFeePerGasWei: rawFeeData.maxPriorityFeePerGas
        ? rawFeeData.maxPriorityFeePerGas.toString()
        : null
    };
    if (gasPriceWei) {
      maxEstimatedCostWei = config.valueWei + gasEstimate * gasPriceWei;
    }
  }

  if (fromAddress) {
    const balance = await withTimeout(provider.getBalance(fromAddress), config.timeoutMs, "balance check");
    fromBalanceWei = balance.toString();
    if (maxEstimatedCostWei !== null) {
      balanceSufficient = balance >= maxEstimatedCostWei;
    }
  }

  let slippage = null;
  let slippageWithinBounds = true;
  if (config.quotedOutWei !== null && config.minOutWei !== null) {
    const impliedSlippageBps = computeImpliedSlippageBps(config.quotedOutWei, config.minOutWei);
    slippageWithinBounds =
      config.maxSlippageBps === null ? true : impliedSlippageBps <= config.maxSlippageBps;
    slippage = {
      quotedOutWei: config.quotedOutWei.toString(),
      minOutWei: config.minOutWei.toString(),
      impliedSlippageBps: impliedSlippageBps.toString(),
      impliedSlippagePct: formatBpsAsPct(impliedSlippageBps),
      maxSlippageBps: config.maxSlippageBps === null ? null : config.maxSlippageBps.toString(),
      withinBounds: slippageWithinBounds
    };
  }

  const warnings = [];
  if (!fromAddress) {
    warnings.push("fromAddress_missing: balance and nonce context cannot be validated without sender address.");
  }
  if (balanceSufficient === false) {
    warnings.push("insufficient_native_balance: estimated max tx cost exceeds sender balance.");
  }
  if (!slippageWithinBounds) {
    warnings.push("slippage_policy_breach: implied slippage exceeds maxSlippageBps.");
  }

  const ok =
    callSucceeded &&
    gasEstimated &&
    (balanceSufficient === null || balanceSufficient === true) &&
    slippageWithinBounds;

  return {
    ok,
    simulatedAt: new Date().toISOString(),
    chainId: resolvedChainId,
    rpcUrl: config.rpcUrl,
    tx: {
      from: fromAddress || null,
      to,
      data,
      valueWei: config.valueWei.toString(),
      gasLimit: config.gasLimit === null ? null : config.gasLimit.toString()
    },
    checks: {
      rpcHealthy: true,
      chainMatchesExpected: true,
      callSucceeded,
      gasEstimated,
      balanceSufficient,
      slippageWithinBounds
    },
    simulation: {
      returnData,
      returnDataBytes: returnData ? (returnData.length - 2) / 2 : 0,
      gasEstimate: gasEstimate ? gasEstimate.toString() : null,
      feeData,
      fromBalanceWei,
      maxEstimatedCostWei: maxEstimatedCostWei === null ? null : maxEstimatedCostWei.toString(),
      maxEstimatedCostEth:
        maxEstimatedCostWei === null ? null : ethers.formatEther(maxEstimatedCostWei)
    },
    slippage,
    revert,
    warnings
  };
}

function printResult(result, jsonMode) {
  if (jsonMode) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(`ok=${result.ok}`);
  console.log(`chainId=${result.chainId}`);
  console.log(`to=${result.tx.to}`);
  console.log(`callSucceeded=${result.checks.callSucceeded}`);
  console.log(`gasEstimated=${result.checks.gasEstimated}`);
  if (result.checks.balanceSufficient !== null) {
    console.log(`balanceSufficient=${result.checks.balanceSufficient}`);
  }
  if (result.slippage) {
    console.log(`impliedSlippageBps=${result.slippage.impliedSlippageBps}`);
    console.log(`slippageWithinBounds=${result.slippage.withinBounds}`);
  }
  if (result.revert) {
    console.log(`revertType=${result.revert.decoded.type}`);
    console.log(`revertReason=${result.revert.decoded.reason}`);
  }
}

async function main() {
  const config = parseArgs(process.argv.slice(2));
  const ethers = loadEthers();
  const result = await run(config, ethers);
  printResult(result, config.json);
  if (!result.ok) {
    process.exit(1);
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  const payload = {
    ok: false,
    error: message
  };
  console.error(JSON.stringify(payload, null, 2));
  process.exit(1);
});
