#!/usr/bin/env node
"use strict";

function printUsage() {
  console.log("Usage:");
  console.log("  node scripts/query-coingecko.js simple-price --ids ethereum,bitcoin --vs-currencies usd --json");
  console.log("  node scripts/query-coingecko.js token-price --asset-platform base --contract-addresses 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913 --vs-currencies usd --json");
  console.log("  node scripts/query-coingecko.js coin --coin-id ethereum --json");
  console.log("  node scripts/query-coingecko.js search --query usdc --json");
  console.log("");
  console.log("Environment:");
  console.log("  COINGECKO_PLAN          demo | pro (default: demo)");
  console.log("  COINGECKO_API_KEY       API key (optional for public demo rate limits)");
  console.log("  COINGECKO_BASE_URL      override base URL");
  console.log("  COINGECKO_TIMEOUT_MS    request timeout in ms (default: 10000)");
}

function normalizeBaseUrl(plan, override) {
  const raw = String(override || "").trim();
  if (raw) {
    return raw.replace(/\/+$/, "");
  }
  if (plan === "pro") {
    return "https://pro-api.coingecko.com/api/v3";
  }
  return "https://api.coingecko.com/api/v3";
}

function parsePositiveInt(rawValue, key) {
  const value = Number.parseInt(String(rawValue), 10);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${key} must be a positive integer.`);
  }
  return value;
}

function parseArgs(argv) {
  if (argv.length === 0 || argv[0] === "--help" || argv[0] === "-h") {
    printUsage();
    process.exit(0);
  }

  const mode = String(argv[0]).toLowerCase();
  if (!["simple-price", "token-price", "coin", "search"].includes(mode)) {
    throw new Error("First argument must be one of: simple-price | token-price | coin | search");
  }

  const config = {
    mode,
    plan: String(process.env.COINGECKO_PLAN || "demo").toLowerCase(),
    apiKey: process.env.COINGECKO_API_KEY || "",
    baseUrl: process.env.COINGECKO_BASE_URL || "",
    timeoutMs: process.env.COINGECKO_TIMEOUT_MS || "10000",
    ids: "",
    vsCurrencies: "usd",
    includeMarketCap: true,
    include24hVol: true,
    include24hChange: true,
    includeLastUpdatedAt: true,
    assetPlatform: "",
    contractAddresses: "",
    coinId: "",
    query: "",
    json: false
  };

  for (let i = 1; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--json") {
      config.json = true;
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

    if (arg === "--plan") {
      config.plan = value.toLowerCase();
      i += 1;
      continue;
    }
    if (arg === "--api-key") {
      config.apiKey = value;
      i += 1;
      continue;
    }
    if (arg === "--base-url") {
      config.baseUrl = value;
      i += 1;
      continue;
    }
    if (arg === "--timeout-ms") {
      config.timeoutMs = value;
      i += 1;
      continue;
    }
    if (arg === "--ids") {
      config.ids = value;
      i += 1;
      continue;
    }
    if (arg === "--vs-currencies") {
      config.vsCurrencies = value;
      i += 1;
      continue;
    }
    if (arg === "--include-market-cap") {
      config.includeMarketCap = value.toLowerCase() === "true";
      i += 1;
      continue;
    }
    if (arg === "--include-24h-vol") {
      config.include24hVol = value.toLowerCase() === "true";
      i += 1;
      continue;
    }
    if (arg === "--include-24h-change") {
      config.include24hChange = value.toLowerCase() === "true";
      i += 1;
      continue;
    }
    if (arg === "--include-last-updated-at") {
      config.includeLastUpdatedAt = value.toLowerCase() === "true";
      i += 1;
      continue;
    }
    if (arg === "--asset-platform") {
      config.assetPlatform = value;
      i += 1;
      continue;
    }
    if (arg === "--contract-addresses") {
      config.contractAddresses = value;
      i += 1;
      continue;
    }
    if (arg === "--coin-id") {
      config.coinId = value;
      i += 1;
      continue;
    }
    if (arg === "--query") {
      config.query = value;
      i += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!["demo", "pro"].includes(config.plan)) {
    throw new Error("plan must be demo or pro.");
  }

  if (mode === "simple-price" && !config.ids.trim()) {
    throw new Error("simple-price mode requires --ids.");
  }
  if (mode === "token-price") {
    if (!config.assetPlatform.trim()) {
      throw new Error("token-price mode requires --asset-platform.");
    }
    if (!config.contractAddresses.trim()) {
      throw new Error("token-price mode requires --contract-addresses.");
    }
  }
  if (mode === "coin" && !config.coinId.trim()) {
    throw new Error("coin mode requires --coin-id.");
  }
  if (mode === "search" && !config.query.trim()) {
    throw new Error("search mode requires --query.");
  }

  return {
    mode,
    plan: config.plan,
    apiKey: config.apiKey.trim(),
    baseUrl: normalizeBaseUrl(config.plan, config.baseUrl),
    timeoutMs: parsePositiveInt(config.timeoutMs, "timeoutMs"),
    ids: config.ids.trim(),
    vsCurrencies: config.vsCurrencies.trim(),
    includeMarketCap: config.includeMarketCap,
    include24hVol: config.include24hVol,
    include24hChange: config.include24hChange,
    includeLastUpdatedAt: config.includeLastUpdatedAt,
    assetPlatform: config.assetPlatform.trim(),
    contractAddresses: config.contractAddresses.trim(),
    coinId: config.coinId.trim(),
    query: config.query.trim(),
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

function buildHeaders(config) {
  const headers = {
    Accept: "application/json"
  };

  if (config.apiKey) {
    if (config.plan === "pro") {
      headers["x-cg-pro-api-key"] = config.apiKey;
    } else {
      headers["x-cg-demo-api-key"] = config.apiKey;
    }
  }

  return headers;
}

function buildPath(config) {
  if (config.mode === "simple-price") {
    const params = new URLSearchParams();
    params.set("ids", config.ids);
    params.set("vs_currencies", config.vsCurrencies);
    params.set("include_market_cap", String(config.includeMarketCap));
    params.set("include_24hr_vol", String(config.include24hVol));
    params.set("include_24hr_change", String(config.include24hChange));
    params.set("include_last_updated_at", String(config.includeLastUpdatedAt));
    return `/simple/price?${params.toString()}`;
  }

  if (config.mode === "token-price") {
    const params = new URLSearchParams();
    params.set("contract_addresses", config.contractAddresses);
    params.set("vs_currencies", config.vsCurrencies);
    params.set("include_market_cap", String(config.includeMarketCap));
    params.set("include_24hr_vol", String(config.include24hVol));
    params.set("include_24hr_change", String(config.include24hChange));
    params.set("include_last_updated_at", String(config.includeLastUpdatedAt));
    return `/simple/token_price/${encodeURIComponent(config.assetPlatform)}?${params.toString()}`;
  }

  if (config.mode === "coin") {
    return `/coins/${encodeURIComponent(config.coinId)}`;
  }

  const params = new URLSearchParams();
  params.set("query", config.query);
  return `/search?${params.toString()}`;
}

async function callCoinGecko(config) {
  const path = buildPath(config);
  const url = `${config.baseUrl}${path}`;

  const response = await withTimeout(
    fetch(url, {
      method: "GET",
      headers: buildHeaders(config)
    }),
    config.timeoutMs,
    `CoinGecko ${config.mode}`
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
      (body && (body.error || body.status?.error_message || body.message)) ||
      bodyText ||
      `HTTP ${response.status}`;
    throw new Error(`coingecko_error_${response.status}: ${message}`);
  }

  return {
    request: {
      mode: config.mode,
      path,
      plan: config.plan,
      baseUrl: config.baseUrl
    },
    data: body
  };
}

function printResult(result, jsonMode) {
  if (jsonMode) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(`mode=${result.request.mode}`);
  if (result.request.mode === "coin") {
    console.log(`id=${result.data.id}`);
    console.log(`symbol=${result.data.symbol}`);
    console.log(`name=${result.data.name}`);
    return;
  }
  if (result.request.mode === "search") {
    const count = Array.isArray(result.data.coins) ? result.data.coins.length : 0;
    console.log(`coins=${count}`);
    return;
  }
  console.log("status=ok");
}

function stringifyError(error) {
  if (error instanceof Error) {
    const cause =
      error &&
      "cause" in error &&
      error.cause &&
      typeof error.cause === "object" &&
      "message" in error.cause
        ? String(error.cause.message)
        : "";
    return cause ? `${error.message} (${cause})` : error.message;
  }
  return String(error);
}

async function main() {
  const config = parseArgs(process.argv.slice(2));
  const result = await callCoinGecko(config);
  printResult(result, config.json);
}

main().catch((error) => {
  const message = stringifyError(error);
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
