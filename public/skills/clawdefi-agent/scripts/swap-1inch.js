#!/usr/bin/env node
"use strict";

const MAX_BPS = 10000n;
const NATIVE_TOKEN_SENTINEL = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";

function printUsage() {
  console.log("Usage:");
  console.log("  node scripts/swap-1inch.js quote --chain-id <id> --from-token <0x...|NATIVE> --to-token <0x...|NATIVE> --amount-wei <wei> --json");
  console.log("  node scripts/swap-1inch.js build --chain-id <id> --from-token <0x...|NATIVE> --to-token <0x...|NATIVE> --amount-wei <wei> --from-address <0x...> --slippage-bps <bps> --json");
  console.log("  node scripts/swap-1inch.js execute --chain-id <id> --rpc-url <url> --from-token <0x...|NATIVE> --to-token <0x...|NATIVE> --amount-wei <wei> --from-address <0x...> --private-key <0x...> --slippage-bps <bps> --confirm-execute --json");
  console.log("");
  console.log("Required environment:");
  console.log("  ONEINCH_API_KEY               (or --api-key)");
  console.log("Optional environment:");
  console.log("  ONEINCH_API_BASE_URL          (default: https://api.1inch.com)");
  console.log("  RPC_URL / CHAIN_RPC_URL / ETH_RPC_URL   (or --rpc-url, required for execute)");
  console.log("");
  console.log("Notes:");
  console.log("  - Uses 1inch Swap API v6.1 endpoint family: /swap/v6.1/{chainId}/quote and /swap.");
  console.log("  - NATIVE token alias maps to 1inch sentinel address.");
  console.log("  - execute mode performs simulation checks before broadcast and fails closed on errors.");
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
    if (value <= 0n) {
      throw new Error(`${key} must be > 0.`);
    }
    return value;
  } catch (err) {
    throw new Error(
      `${key} must be an integer string (${err instanceof Error ? err.message : String(err)}).`
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

function normalizeToken(value, key) {
  if (!value) {
    throw new Error(`${key} is required.`);
  }
  if (value.toUpperCase() === "NATIVE") {
    return NATIVE_TOKEN_SENTINEL;
  }
  return normalizeAddress(value, key);
}

function normalizeBaseUrl(rawUrl) {
  const trimmed = String(rawUrl).trim();
  if (!trimmed) {
    return "https://api.1inch.com";
  }
  return trimmed.replace(/\/+$/, "");
}

function buildPath(chainId, endpoint) {
  return `/swap/v6.1/${chainId}/${endpoint}`;
}

function encodeParams(params) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") {
      return;
    }
    search.set(key, String(value));
  });
  return search.toString();
}

function parseArgs(argv) {
  if (argv.length === 0 || argv[0] === "--help" || argv[0] === "-h") {
    printUsage();
    process.exit(0);
  }

  const mode = String(argv[0]).toLowerCase();
  if (!["quote", "build", "execute"].includes(mode)) {
    throw new Error("First argument must be mode: quote | build | execute");
  }

  const config = {
    mode,
    apiKey: process.env.ONEINCH_API_KEY || "",
    apiBaseUrl: process.env.ONEINCH_API_BASE_URL || "https://api.1inch.com",
    chainId: process.env.CHAIN_ID || "",
    fromToken: process.env.FROM_TOKEN || "",
    toToken: process.env.TO_TOKEN || "",
    amountWei: process.env.AMOUNT_WEI || "",
    fromAddress: process.env.WALLET_ADDRESS || "",
    privateKey: process.env.PRIVATE_KEY || "",
    rpcUrl: process.env.RPC_URL || process.env.CHAIN_RPC_URL || process.env.ETH_RPC_URL || "",
    slippageBps: process.env.SLIPPAGE_BPS || "100",
    protocolWhitelist: process.env.ONEINCH_PROTOCOLS || "",
    permit: process.env.ONEINCH_PERMIT || "",
    referralAddress: process.env.ONEINCH_REFERRAL || "",
    gasPriceWei: process.env.ONEINCH_GAS_PRICE_WEI || "",
    timeoutMs: process.env.ONEINCH_TIMEOUT_MS || "10000",
    waitConfirmations: process.env.WAIT_CONFIRMATIONS || "1",
    waitTimeoutSec: process.env.WAIT_TIMEOUT_SEC || "180",
    confirmExecute: false,
    disableEstimate: false,
    json: false
  };

  for (let i = 1; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--json") {
      config.json = true;
      continue;
    }
    if (arg === "--confirm-execute") {
      config.confirmExecute = true;
      continue;
    }
    if (arg === "--disable-estimate") {
      config.disableEstimate = true;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      printUsage();
      process.exit(0);
    }

    const value = argv[i + 1];
    if (!value || value.startsWith("-")) {
      throw new Error(`Missing value for ${arg}`);
    }

    if (arg === "--api-key") {
      config.apiKey = value;
      i += 1;
      continue;
    }
    if (arg === "--api-base-url") {
      config.apiBaseUrl = value;
      i += 1;
      continue;
    }
    if (arg === "--chain-id") {
      config.chainId = value;
      i += 1;
      continue;
    }
    if (arg === "--from-token") {
      config.fromToken = value;
      i += 1;
      continue;
    }
    if (arg === "--to-token") {
      config.toToken = value;
      i += 1;
      continue;
    }
    if (arg === "--amount-wei") {
      config.amountWei = value;
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
    if (arg === "--rpc-url") {
      config.rpcUrl = value;
      i += 1;
      continue;
    }
    if (arg === "--slippage-bps") {
      config.slippageBps = value;
      i += 1;
      continue;
    }
    if (arg === "--protocol-whitelist") {
      config.protocolWhitelist = value;
      i += 1;
      continue;
    }
    if (arg === "--permit") {
      config.permit = value;
      i += 1;
      continue;
    }
    if (arg === "--referral-address") {
      config.referralAddress = value;
      i += 1;
      continue;
    }
    if (arg === "--gas-price-wei") {
      config.gasPriceWei = value;
      i += 1;
      continue;
    }
    if (arg === "--timeout-ms") {
      config.timeoutMs = value;
      i += 1;
      continue;
    }
    if (arg === "--wait-confirmations") {
      config.waitConfirmations = value;
      i += 1;
      continue;
    }
    if (arg === "--wait-timeout-sec") {
      config.waitTimeoutSec = value;
      i += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  const chainId = parsePositiveInt(config.chainId, "chainId");
  const amountWei = parseBigIntValue(config.amountWei, "amountWei");
  const slippageBps = BigInt(parsePositiveInt(config.slippageBps, "slippageBps"));
  if (slippageBps <= 0n || slippageBps > 5000n) {
    throw new Error("slippageBps must be between 1 and 5000.");
  }

  const timeoutMs = parsePositiveInt(config.timeoutMs, "timeoutMs");
  const waitConfirmations = parsePositiveInt(config.waitConfirmations, "waitConfirmations");
  const waitTimeoutSec = parsePositiveInt(config.waitTimeoutSec, "waitTimeoutSec");

  if (!config.apiKey.trim()) {
    throw new Error("Missing ONEINCH_API_KEY. Set env var or --api-key.");
  }

  if (config.mode === "execute" && !config.confirmExecute) {
    throw new Error("execute mode requires explicit --confirm-execute.");
  }

  return {
    mode: config.mode,
    apiKey: config.apiKey.trim(),
    apiBaseUrl: normalizeBaseUrl(config.apiBaseUrl),
    chainId,
    fromToken: normalizeToken(config.fromToken, "fromToken"),
    toToken: normalizeToken(config.toToken, "toToken"),
    amountWei,
    fromAddress: config.fromAddress.trim()
      ? normalizeAddress(config.fromAddress, "fromAddress")
      : "",
    privateKey: config.privateKey.trim(),
    rpcUrl: config.rpcUrl.trim(),
    slippageBps,
    protocolWhitelist: config.protocolWhitelist.trim(),
    permit: config.permit.trim(),
    referralAddress: config.referralAddress.trim()
      ? normalizeAddress(config.referralAddress, "referralAddress")
      : "",
    gasPriceWei: config.gasPriceWei.trim(),
    timeoutMs,
    waitConfirmations,
    waitTimeoutSec,
    disableEstimate: config.disableEstimate,
    json: config.json
  };
}

function withTimeout(promise, timeoutMs, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
    })
  ]);
}

async function call1inch({ apiBaseUrl, apiKey, chainId, endpoint, params, timeoutMs }) {
  const query = encodeParams(params);
  const path = buildPath(chainId, endpoint);
  const url = `${apiBaseUrl}${path}${query ? `?${query}` : ""}`;

  const response = await withTimeout(
    fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${apiKey}`
      }
    }),
    timeoutMs,
    `1inch ${endpoint}`
  );

  const bodyText = await response.text();
  let body = null;
  if (bodyText) {
    try {
      body = JSON.parse(bodyText);
    } catch (_) {
      body = { raw: bodyText };
    }
  }

  if (!response.ok) {
    const message =
      (body && (body.description || body.error || body.message)) ||
      bodyText ||
      `HTTP ${response.status}`;
    throw new Error(`1inch_${endpoint}_error_${response.status}: ${message}`);
  }

  if (!body || typeof body !== "object") {
    throw new Error(`1inch_${endpoint}_error: empty or invalid JSON response`);
  }

  return body;
}

function loadEthers() {
  try {
    const ethers = require("ethers");
    if (!ethers || !ethers.Wallet || !ethers.JsonRpcProvider) {
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

function normalizeTxFromApi(tx) {
  if (!tx || typeof tx !== "object") {
    throw new Error("1inch swap response missing tx payload.");
  }

  const normalized = {
    to: normalizeAddress(String(tx.to || ""), "tx.to"),
    data: String(tx.data || ""),
    value: tx.value ? BigInt(String(tx.value)) : 0n,
    gasLimit: tx.gas ? BigInt(String(tx.gas)) : null,
    gasPrice: tx.gasPrice ? BigInt(String(tx.gasPrice)) : null,
    maxFeePerGas: tx.maxFeePerGas ? BigInt(String(tx.maxFeePerGas)) : null,
    maxPriorityFeePerGas: tx.maxPriorityFeePerGas
      ? BigInt(String(tx.maxPriorityFeePerGas))
      : null
  };

  if (!/^0x[a-fA-F0-9]+$/.test(normalized.data)) {
    throw new Error("tx.data from 1inch is not valid hex calldata.");
  }

  return normalized;
}

async function runQuote(config) {
  const params = {
    src: config.fromToken,
    dst: config.toToken,
    amount: config.amountWei.toString()
  };
  if (config.protocolWhitelist) {
    params.protocols = config.protocolWhitelist;
  }
  return call1inch({
    apiBaseUrl: config.apiBaseUrl,
    apiKey: config.apiKey,
    chainId: config.chainId,
    endpoint: "quote",
    params,
    timeoutMs: config.timeoutMs
  });
}

async function runBuild(config) {
  if (!config.fromAddress) {
    throw new Error("build mode requires --from-address (or WALLET_ADDRESS).");
  }

  const params = {
    src: config.fromToken,
    dst: config.toToken,
    amount: config.amountWei.toString(),
    fromAddress: config.fromAddress,
    slippage: Number(config.slippageBps) / 100,
    disableEstimate: config.disableEstimate ? "true" : "false"
  };

  if (config.protocolWhitelist) {
    params.protocols = config.protocolWhitelist;
  }
  if (config.permit) {
    params.permit = config.permit;
  }
  if (config.referralAddress) {
    params.referrerAddress = config.referralAddress;
  }
  if (config.gasPriceWei) {
    params.gasPrice = config.gasPriceWei;
  }

  return call1inch({
    apiBaseUrl: config.apiBaseUrl,
    apiKey: config.apiKey,
    chainId: config.chainId,
    endpoint: "swap",
    params,
    timeoutMs: config.timeoutMs
  });
}

async function runExecute(config) {
  if (!config.fromAddress) {
    throw new Error("execute mode requires --from-address (or WALLET_ADDRESS).");
  }
  if (!config.privateKey) {
    throw new Error("execute mode requires --private-key (or PRIVATE_KEY).");
  }
  if (!config.rpcUrl) {
    throw new Error("execute mode requires --rpc-url (or RPC_URL).");
  }

  const ethers = loadEthers();
  const provider = new ethers.JsonRpcProvider(config.rpcUrl);
  const wallet = new ethers.Wallet(config.privateKey, provider);
  const derivedAddress = normalizeAddress(wallet.address, "wallet.address");
  if (derivedAddress !== config.fromAddress) {
    throw new Error(
      `fromAddress mismatch. Provided=${config.fromAddress}, derived=${derivedAddress}.`
    );
  }

  const network = await withTimeout(provider.getNetwork(), config.timeoutMs, "rpc network check");
  const networkChainId = Number(network.chainId);
  if (networkChainId !== config.chainId) {
    throw new Error(`Chain mismatch. Expected ${config.chainId}, got ${networkChainId}.`);
  }

  const swapResponse = await runBuild(config);
  const txFromApi = normalizeTxFromApi(swapResponse.tx);

  const txRequest = {
    to: txFromApi.to,
    data: txFromApi.data,
    value: txFromApi.value,
    gasLimit: txFromApi.gasLimit || undefined,
    gasPrice: txFromApi.gasPrice || undefined,
    maxFeePerGas: txFromApi.maxFeePerGas || undefined,
    maxPriorityFeePerGas: txFromApi.maxPriorityFeePerGas || undefined
  };

  const simulationWarnings = [];
  try {
    await withTimeout(provider.call(txRequest, "latest"), config.timeoutMs, "preflight eth_call");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`preflight_call_failed: ${message}`);
  }

  const estimatedGas = await withTimeout(
    provider.estimateGas({
      ...txRequest,
      from: config.fromAddress
    }),
    config.timeoutMs,
    "preflight estimateGas"
  );

  if (!txRequest.gasLimit) {
    txRequest.gasLimit = (estimatedGas * 12n) / 10n;
    simulationWarnings.push("gas_limit_not_provided_by_1inch: applied 1.2x estimate.");
  }

  const txResponse = await withTimeout(
    wallet.sendTransaction(txRequest),
    config.timeoutMs,
    "sendTransaction"
  );

  const receipt = await withTimeout(
    txResponse.wait(config.waitConfirmations),
    config.waitTimeoutSec * 1000,
    "waitForConfirmations"
  );

  return {
    mode: "execute",
    txHash: txResponse.hash,
    chainId: config.chainId,
    fromAddress: config.fromAddress,
    quote: {
      fromToken: config.fromToken,
      toToken: config.toToken,
      amountWei: config.amountWei.toString(),
      slippageBps: config.slippageBps.toString()
    },
    tx: {
      to: txRequest.to,
      valueWei: txRequest.value.toString(),
      gasLimit: txRequest.gasLimit.toString(),
      estimatedGas: estimatedGas.toString()
    },
    receipt: receipt
      ? {
          blockNumber: receipt.blockNumber,
          gasUsed: receipt.gasUsed ? receipt.gasUsed.toString() : null,
          status: receipt.status
        }
      : null,
    warnings: simulationWarnings
  };
}

function printResult(result, jsonMode) {
  if (jsonMode) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (result.mode === "execute") {
    console.log(`mode=execute`);
    console.log(`txHash=${result.txHash}`);
    console.log(`status=${result.receipt ? result.receipt.status : "pending"}`);
    return;
  }

  console.log(`mode=${result.mode}`);
  if (result.toAmount) {
    console.log(`toAmount=${result.toAmount}`);
  }
  if (result.tx && result.tx.to) {
    console.log(`txTo=${result.tx.to}`);
  }
}

async function main() {
  const config = parseArgs(process.argv.slice(2));

  if (config.mode === "quote") {
    const quote = await runQuote(config);
    const result = {
      mode: "quote",
      chainId: config.chainId,
      fromToken: config.fromToken,
      toToken: config.toToken,
      amountWei: config.amountWei.toString(),
      fromTokenInfo: quote.srcToken || null,
      toTokenInfo: quote.dstToken || null,
      toAmount: quote.dstAmount ? String(quote.dstAmount) : null,
      gasEstimate: quote.gas ? String(quote.gas) : null,
      raw: quote
    };
    printResult(result, config.json);
    return;
  }

  if (config.mode === "build") {
    const swap = await runBuild(config);
    const result = {
      mode: "build",
      chainId: config.chainId,
      fromAddress: config.fromAddress,
      fromToken: config.fromToken,
      toToken: config.toToken,
      amountWei: config.amountWei.toString(),
      slippageBps: config.slippageBps.toString(),
      tx: swap.tx || null,
      dstAmount: swap.dstAmount ? String(swap.dstAmount) : null,
      protocols: swap.protocols || null,
      raw: swap
    };
    printResult(result, config.json);
    return;
  }

  const executed = await runExecute(config);
  printResult(executed, config.json);
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
