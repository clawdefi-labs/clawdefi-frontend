#!/usr/bin/env node
"use strict";

const ETHERSCAN_V2_BASE_URL = "https://api.etherscan.io/v2/api";

const EXPLORER_HOST_BY_CHAIN_ID = {
  1: "https://etherscan.io",
  10: "https://optimistic.etherscan.io",
  56: "https://bscscan.com",
  137: "https://polygonscan.com",
  42161: "https://arbiscan.io",
  8453: "https://basescan.org"
};

function printUsage() {
  console.log("Usage:");
  console.log("  node scripts/query-contract-verification.js --chain-id <id> --contract-address <0x...> --json");
  console.log("  node scripts/query-contract-verification.js --chain-id 8453 --contract-address 0x... --api-key <key> --json");
  console.log("");
  console.log("Input sources:");
  console.log("  --chain-id <id>                  (or CHAIN_ID)");
  console.log("  --contract-address <0x...>       (or CONTRACT_ADDRESS)");
  console.log("  --api-key <key>                  (or ETHERSCAN_API_KEY)");
  console.log("  --api-base-url <url>             (or ETHERSCAN_API_BASE_URL, default: https://api.etherscan.io/v2/api)");
  console.log("  --timeout-ms <ms>                (or ETHERSCAN_TIMEOUT_MS, default: 10000)");
  console.log("  --json                           (JSON output)");
  console.log("");
  console.log("Notes:");
  console.log("  - Uses Etherscan V2 multichain endpoint with chainid.");
  console.log("  - API key must be user-managed in local env/secret storage.");
}

function parsePositiveInt(rawValue, key) {
  const value = Number.parseInt(String(rawValue), 10);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${key} must be a positive integer.`);
  }
  return value;
}

function normalizeAddress(value, key) {
  const trimmed = String(value || "").trim();
  if (!/^0x[a-fA-F0-9]{40}$/.test(trimmed)) {
    throw new Error(`${key} must be a valid 20-byte hex address.`);
  }
  return trimmed.toLowerCase();
}

function normalizeApiBaseUrl(rawUrl) {
  const trimmed = String(rawUrl || "").trim();
  if (!trimmed) {
    return ETHERSCAN_V2_BASE_URL;
  }
  return trimmed.replace(/\/+$/, "");
}

function parseArgs(argv) {
  const config = {
    chainId: process.env.CHAIN_ID || "",
    contractAddress: process.env.CONTRACT_ADDRESS || "",
    apiKey: process.env.ETHERSCAN_API_KEY || "",
    apiBaseUrl: process.env.ETHERSCAN_API_BASE_URL || ETHERSCAN_V2_BASE_URL,
    timeoutMs: process.env.ETHERSCAN_TIMEOUT_MS || "10000",
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

    if (arg === "--chain-id") {
      config.chainId = value;
      i += 1;
      continue;
    }
    if (arg === "--contract-address") {
      config.contractAddress = value;
      i += 1;
      continue;
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
    if (arg === "--timeout-ms") {
      config.timeoutMs = value;
      i += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  const chainId = parsePositiveInt(config.chainId, "chainId");
  const contractAddress = normalizeAddress(config.contractAddress, "contractAddress");
  const apiKey = String(config.apiKey || "").trim();
  if (!apiKey) {
    throw new Error("Missing apiKey. Set --api-key or ETHERSCAN_API_KEY.");
  }

  return {
    chainId,
    contractAddress,
    apiKey,
    apiBaseUrl: normalizeApiBaseUrl(config.apiBaseUrl),
    timeoutMs: parsePositiveInt(config.timeoutMs, "timeoutMs"),
    json: config.json
  };
}

async function withTimeout(promise, timeoutMs, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
    })
  ]);
}

function extractFirstResult(apiResult) {
  if (!Array.isArray(apiResult) || apiResult.length === 0) {
    return null;
  }
  return apiResult[0] || null;
}

function isSourceVerified(sourceCode, abi) {
  const source = String(sourceCode || "").trim();
  const abiText = String(abi || "").trim();
  if (!source || source.toLowerCase() === "contract source code not verified") {
    return false;
  }
  if (!abiText || abiText.toLowerCase() === "contract source code not verified") {
    return false;
  }
  return true;
}

function toIntOrNull(rawValue) {
  const parsed = Number.parseInt(String(rawValue || "").trim(), 10);
  return Number.isInteger(parsed) ? parsed : null;
}

function toBoolFlag(rawValue) {
  const normalized = String(rawValue || "").trim();
  if (normalized === "1" || normalized.toLowerCase() === "true") {
    return true;
  }
  if (normalized === "0" || normalized.toLowerCase() === "false") {
    return false;
  }
  return null;
}

function getExplorerCodeUrl(chainId, contractAddress) {
  const base = EXPLORER_HOST_BY_CHAIN_ID[chainId];
  if (!base) {
    return null;
  }
  return `${base}/address/${contractAddress}#code`;
}

function tryNormalizeOptionalAddress(rawValue) {
  const trimmed = String(rawValue || "").trim();
  if (!trimmed) {
    return null;
  }
  if (!/^0x[a-fA-F0-9]{40}$/.test(trimmed)) {
    return null;
  }
  return trimmed.toLowerCase();
}

async function queryVerification(config) {
  const params = new URLSearchParams();
  params.set("chainid", String(config.chainId));
  params.set("module", "contract");
  params.set("action", "getsourcecode");
  params.set("address", config.contractAddress);
  params.set("apikey", config.apiKey);

  const url = `${config.apiBaseUrl}?${params.toString()}`;
  const response = await withTimeout(
    fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json"
      }
    }),
    config.timeoutMs,
    "etherscan getsourcecode"
  );

  const bodyText = await response.text();
  let payload = null;
  try {
    payload = bodyText ? JSON.parse(bodyText) : null;
  } catch (_) {
    throw new Error(`etherscan_invalid_json: ${bodyText.slice(0, 160)}`);
  }

  if (!response.ok) {
    const details =
      (payload && (payload.result || payload.message || payload.error)) ||
      bodyText ||
      `HTTP ${response.status}`;
    throw new Error(`etherscan_http_${response.status}: ${details}`);
  }

  if (!payload || typeof payload !== "object") {
    throw new Error("etherscan_invalid_response: missing response payload");
  }

  if (String(payload.status) === "0" && !Array.isArray(payload.result)) {
    const details = String(payload.result || payload.message || "unknown error");
    throw new Error(`etherscan_api_error: ${details}`);
  }

  const row = extractFirstResult(payload.result);
  const hasRow = !!row;
  const verified = hasRow ? isSourceVerified(row.SourceCode, row.ABI) : false;
  const proxyFlag = hasRow ? toBoolFlag(row.Proxy) : null;

  return {
    checkedAt: new Date().toISOString(),
    chainId: config.chainId,
    contractAddress: config.contractAddress,
    verification: {
      isVerified: verified,
      status: verified ? "verified" : "unverified_or_unknown",
      contractName: hasRow ? String(row.ContractName || "").trim() || null : null,
      compilerVersion: hasRow ? String(row.CompilerVersion || "").trim() || null : null,
      optimizationUsed: hasRow ? toBoolFlag(row.OptimizationUsed) : null,
      runs: hasRow ? toIntOrNull(row.Runs) : null,
      evmVersion: hasRow ? String(row.EVMVersion || "").trim() || null : null,
      licenseType: hasRow ? String(row.LicenseType || "").trim() || null : null,
      isProxy: proxyFlag,
      implementationAddress: hasRow ? tryNormalizeOptionalAddress(row.Implementation) : null,
      sourceCodePresent: hasRow ? Boolean(String(row.SourceCode || "").trim()) : false,
      abiPresent: hasRow ? Boolean(String(row.ABI || "").trim() && String(row.ABI || "").trim() !== "Contract source code not verified") : false
    },
    explorerCodeUrl: getExplorerCodeUrl(config.chainId, config.contractAddress),
    provider: {
      name: "etherscan-v2",
      apiBaseUrl: config.apiBaseUrl
    }
  };
}

function printResult(result, jsonMode) {
  if (jsonMode) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(`chainId=${result.chainId}`);
  console.log(`contractAddress=${result.contractAddress}`);
  console.log(`status=${result.verification.status}`);
  console.log(`isVerified=${result.verification.isVerified}`);
  if (result.verification.contractName) {
    console.log(`contractName=${result.verification.contractName}`);
  }
  if (result.verification.compilerVersion) {
    console.log(`compilerVersion=${result.verification.compilerVersion}`);
  }
  if (result.explorerCodeUrl) {
    console.log(`explorerCodeUrl=${result.explorerCodeUrl}`);
  }
}

function stringifyError(error) {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

async function main() {
  const config = parseArgs(process.argv.slice(2));
  const result = await queryVerification(config);
  printResult(result, config.json);
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        ok: false,
        error: stringifyError(error)
      },
      null,
      2
    )
  );
  process.exit(1);
});
