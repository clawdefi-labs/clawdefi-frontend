#!/usr/bin/env node
"use strict";

function printUsage() {
  console.log("Usage:");
  console.log("  node scripts/query-protocol.js list --json");
  console.log("  node scripts/query-protocol.js list --type swap --chain-slug base-mainnet --limit 20 --json");
  console.log("  node scripts/query-protocol.js profile --slug uniswap-v3 --json");
  console.log("  node scripts/query-protocol.js action-spec --protocol-slug uniswap-v3 --chain-slug base-mainnet --action-key swap_exact_in --json");
  console.log("");
  console.log("Environment:");
  console.log("  CORE_API_BASE_URL   (default: http://127.0.0.1:8080)");
  console.log("  QUERY_TIMEOUT_MS    (default: 10000)");
}

function parsePositiveInt(rawValue, key) {
  const value = Number.parseInt(String(rawValue), 10);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${key} must be a positive integer.`);
  }
  return value;
}

function normalizeBaseUrl(rawUrl) {
  const trimmed = String(rawUrl).trim();
  if (!trimmed) {
    return "http://127.0.0.1:8080";
  }
  return trimmed.replace(/\/+$/, "");
}

function parseArgs(argv) {
  if (argv.length === 0 || argv[0] === "--help" || argv[0] === "-h") {
    printUsage();
    process.exit(0);
  }

  const mode = String(argv[0]).toLowerCase();
  if (!["list", "profile", "action-spec"].includes(mode)) {
    throw new Error("First argument must be one of: list | profile | action-spec");
  }

  const config = {
    mode,
    coreBaseUrl: process.env.CORE_API_BASE_URL || "http://127.0.0.1:8080",
    timeoutMs: process.env.QUERY_TIMEOUT_MS || "10000",
    type: "",
    chainSlug: "",
    limit: "20",
    slug: "",
    protocolSlug: "",
    actionKey: "",
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

    if (arg === "--core-base-url") {
      config.coreBaseUrl = value;
      i += 1;
      continue;
    }
    if (arg === "--timeout-ms") {
      config.timeoutMs = value;
      i += 1;
      continue;
    }
    if (arg === "--type") {
      config.type = value;
      i += 1;
      continue;
    }
    if (arg === "--chain-slug") {
      config.chainSlug = value;
      i += 1;
      continue;
    }
    if (arg === "--limit") {
      config.limit = value;
      i += 1;
      continue;
    }
    if (arg === "--slug") {
      config.slug = value;
      i += 1;
      continue;
    }
    if (arg === "--protocol-slug") {
      config.protocolSlug = value;
      i += 1;
      continue;
    }
    if (arg === "--action-key") {
      config.actionKey = value;
      i += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  const timeoutMs = parsePositiveInt(config.timeoutMs, "timeoutMs");
  const limit = parsePositiveInt(config.limit, "limit");

  if (mode === "profile" && !config.slug.trim()) {
    throw new Error("profile mode requires --slug.");
  }
  if (mode === "action-spec") {
    if (!config.protocolSlug.trim()) {
      throw new Error("action-spec mode requires --protocol-slug.");
    }
    if (!config.chainSlug.trim()) {
      throw new Error("action-spec mode requires --chain-slug.");
    }
    if (!config.actionKey.trim()) {
      throw new Error("action-spec mode requires --action-key.");
    }
  }

  return {
    mode,
    coreBaseUrl: normalizeBaseUrl(config.coreBaseUrl),
    timeoutMs,
    type: config.type.trim(),
    chainSlug: config.chainSlug.trim(),
    limit,
    slug: config.slug.trim(),
    protocolSlug: config.protocolSlug.trim(),
    actionKey: config.actionKey.trim(),
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

function buildListPath(config) {
  const params = new URLSearchParams();
  if (config.type) {
    params.set("type", config.type);
  }
  if (config.chainSlug) {
    params.set("chainSlug", config.chainSlug);
  }
  params.set("limit", String(config.limit));
  const suffix = params.toString();
  return `/api/v1/protocols${suffix ? `?${suffix}` : ""}`;
}

function buildActionSpecPath(config) {
  const params = new URLSearchParams();
  params.set("protocolSlug", config.protocolSlug);
  params.set("chainSlug", config.chainSlug);
  params.set("actionKey", config.actionKey);
  return `/api/v1/action-specs/latest?${params.toString()}`;
}

async function callCore(baseUrl, path, timeoutMs) {
  const url = `${baseUrl}${path}`;
  const response = await withTimeout(
    fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json"
      }
    }),
    timeoutMs,
    `GET ${path}`
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
      (body && (body.message || body.error || body.description)) ||
      bodyText ||
      `HTTP ${response.status}`;
    throw new Error(`core_read_error_${response.status}: ${message}`);
  }

  return body;
}

function printResult(result, jsonMode) {
  if (jsonMode) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(`mode=${result.mode}`);
  if (result.mode === "list") {
    const count = result.data && typeof result.data.count === "number" ? result.data.count : 0;
    console.log(`count=${count}`);
    return;
  }
  if (result.mode === "profile") {
    console.log(`slug=${result.data.slug}`);
    console.log(`name=${result.data.name}`);
    console.log(`chains=${Array.isArray(result.data.chains) ? result.data.chains.length : 0}`);
    return;
  }
  console.log(`actionKey=${result.data.actionKey}`);
  console.log(`version=${result.data.version}`);
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
  let path = "";

  if (config.mode === "list") {
    path = buildListPath(config);
  } else if (config.mode === "profile") {
    path = `/api/v1/protocols/${encodeURIComponent(config.slug)}`;
  } else {
    path = buildActionSpecPath(config);
  }

  const data = await callCore(config.coreBaseUrl, path, config.timeoutMs);
  const result = {
    mode: config.mode,
    source: {
      coreBaseUrl: config.coreBaseUrl,
      path
    },
    data
  };
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
