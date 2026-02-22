#!/usr/bin/env node
"use strict";

const dns = require("node:dns/promises");

function printUsage() {
  console.log("Usage:");
  console.log("  node scripts/query-avantis.js health --json");
  console.log("  node scripts/query-avantis.js pair-feeds --pair-symbol ETH/USD --json");
  console.log("");
  console.log("Environment:");
  console.log("  AVANTIS_SOCKET_API_URL    (default: https://socket-api-pub.avantisfi.com/socket-api/v1/data)");
  console.log("  AVANTIS_CORE_API_BASE_URL (default: https://core.avantisfi.com)");
  console.log("  AVANTIS_FEED_V3_URL       (default: https://feed-v3.avantisfi.com)");
  console.log("  AVANTIS_TIMEOUT_MS        (default: 10000)");
  console.log("  AVANTIS_RETRIES           (default: 3)");
  console.log("  AVANTIS_RETRY_DELAY_MS    (default: 750)");
}

function parsePositiveInt(rawValue, key) {
  const value = Number.parseInt(String(rawValue), 10);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${key} must be a positive integer.`);
  }
  return value;
}

function normalizeUrl(rawUrl, key) {
  const value = String(rawUrl || "").trim();
  if (!value) {
    throw new Error(`${key} cannot be empty.`);
  }
  try {
    return new URL(value).toString();
  } catch {
    throw new Error(`${key} must be a valid URL.`);
  }
}

function normalizeBaseUrl(rawUrl, key) {
  const normalized = normalizeUrl(rawUrl, key);
  return normalized.replace(/\/+$/, "");
}

function parseArgs(argv) {
  if (argv.length === 0 || argv[0] === "--help" || argv[0] === "-h") {
    printUsage();
    process.exit(0);
  }

  const mode = String(argv[0]).toLowerCase();
  if (!["health", "pair-feeds"].includes(mode)) {
    throw new Error("First argument must be one of: health | pair-feeds");
  }

  const config = {
    mode,
    socketApiUrl:
      process.env.AVANTIS_SOCKET_API_URL ||
      "https://socket-api-pub.avantisfi.com/socket-api/v1/data",
    coreApiBaseUrl: process.env.AVANTIS_CORE_API_BASE_URL || "https://core.avantisfi.com",
    feedV3Url: process.env.AVANTIS_FEED_V3_URL || "https://feed-v3.avantisfi.com",
    timeoutMs: process.env.AVANTIS_TIMEOUT_MS || "10000",
    retries: process.env.AVANTIS_RETRIES || "3",
    retryDelayMs: process.env.AVANTIS_RETRY_DELAY_MS || "750",
    pairSymbol: process.env.AVANTIS_PAIR_SYMBOL || "",
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

    if (arg === "--socket-api-url") {
      config.socketApiUrl = value;
      i += 1;
      continue;
    }
    if (arg === "--core-api-base-url") {
      config.coreApiBaseUrl = value;
      i += 1;
      continue;
    }
    if (arg === "--feed-v3-url") {
      config.feedV3Url = value;
      i += 1;
      continue;
    }
    if (arg === "--timeout-ms") {
      config.timeoutMs = value;
      i += 1;
      continue;
    }
    if (arg === "--retries") {
      config.retries = value;
      i += 1;
      continue;
    }
    if (arg === "--retry-delay-ms") {
      config.retryDelayMs = value;
      i += 1;
      continue;
    }
    if (arg === "--pair-symbol") {
      config.pairSymbol = value;
      i += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  const parsed = {
    mode,
    socketApiUrl: normalizeUrl(config.socketApiUrl, "socketApiUrl"),
    coreApiBaseUrl: normalizeBaseUrl(config.coreApiBaseUrl, "coreApiBaseUrl"),
    feedV3Url: normalizeBaseUrl(config.feedV3Url, "feedV3Url"),
    timeoutMs: parsePositiveInt(config.timeoutMs, "timeoutMs"),
    retries: parsePositiveInt(config.retries, "retries"),
    retryDelayMs: parsePositiveInt(config.retryDelayMs, "retryDelayMs"),
    pairSymbol: String(config.pairSymbol || "").trim().toUpperCase(),
    json: config.json
  };

  if (parsed.mode === "pair-feeds" && !parsed.pairSymbol) {
    throw new Error("pair-feeds mode requires --pair-symbol (example: ETH/USD)");
  }

  return parsed;
}

async function withTimeout(promise, timeoutMs, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
    })
  ]);
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function extractHost(url) {
  return new URL(url).hostname;
}

async function resolveHost(host) {
  const result = {
    host,
    ipv4: [],
    ipv6: [],
    ok: false,
    error: null
  };

  try {
    const [a4, a6] = await Promise.allSettled([
      dns.resolve4(host),
      dns.resolve6(host)
    ]);

    if (a4.status === "fulfilled") {
      result.ipv4 = a4.value;
    }
    if (a6.status === "fulfilled") {
      result.ipv6 = a6.value;
    }
    if (a4.status === "rejected" && a6.status === "rejected") {
      result.error = `${a4.reason || a6.reason}`;
    }

    result.ok = result.ipv4.length > 0 || result.ipv6.length > 0;
    return result;
  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error);
    return result;
  }
}

async function fetchJsonWithRetry(url, timeoutMs, retries, retryDelayMs, options = {}) {
  const allowHttpErrorStatus = options.allowHttpErrorStatus === true;
  const parseJsonBody = options.parseJsonBody !== false;
  let lastError = null;
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      const startedAt = Date.now();
      const response = await withTimeout(
        fetch(url, {
          method: "GET",
          headers: {
            Accept: "application/json"
          }
        }),
        timeoutMs,
        `GET ${url}`
      );

      let body = null;
      if (parseJsonBody) {
        const bodyText = await response.text();
        if (bodyText) {
          try {
            body = JSON.parse(bodyText);
          } catch {
            body = bodyText;
          }
        }
      }

      if (!response.ok && !allowHttpErrorStatus) {
        const bodyString = typeof body === "string" ? body : JSON.stringify(body);
        throw new Error(`http_${response.status}: ${bodyString}`);
      }

      return {
        ok: response.ok || allowHttpErrorStatus,
        url,
        attempt,
        elapsedMs: Date.now() - startedAt,
        status: response.status,
        reachable: true,
        body
      };
    } catch (error) {
      lastError = error;
      if (attempt < retries) {
        await sleep(retryDelayMs * attempt);
      }
    }
  }

  const msg = lastError instanceof Error ? lastError.message : String(lastError);
  return {
    ok: false,
    url,
    attempts: retries,
    reachable: false,
    error: msg
  };
}

function normalizePairSymbol(rawSymbol) {
  return String(rawSymbol || "")
    .trim()
    .replace(/\s+/g, "")
    .replace(/-/g, "/")
    .toUpperCase();
}

function extractPairSnapshot(socketPayload, pairSymbol) {
  const pairs = socketPayload && socketPayload.data && socketPayload.data.pairInfos
    ? socketPayload.data.pairInfos
    : {};
  const normalizedTarget = normalizePairSymbol(pairSymbol);

  const entries = Object.values(pairs).map((pair) => {
    const from = String(pair && pair.from ? pair.from : "").toUpperCase();
    const to = String(pair && pair.to ? pair.to : "").toUpperCase();
    return {
      symbol: `${from}/${to}`,
      index: typeof pair.index === "number" ? pair.index : null,
      feedId: pair && pair.feed ? pair.feed.feedId : null,
      lazerFeedId: pair && pair.lazerFeed ? pair.lazerFeed.feedId : null,
      isPairListed: Boolean(pair && pair.isPairListed),
      openInterest: pair && pair.openInterest ? pair.openInterest : null,
      openFeeP: pair && typeof pair.openFeeP === "number" ? pair.openFeeP : null,
      closeFeeP: pair && typeof pair.closeFeeP === "number" ? pair.closeFeeP : null
    };
  });

  const found = entries.find((entry) => normalizePairSymbol(entry.symbol) === normalizedTarget) || null;

  return {
    pairSymbol: normalizedTarget,
    pairCount: entries.length,
    found,
    sample: entries.slice(0, 5)
  };
}

function buildMonitoringStatus({ dnsSocket, socketRequest }) {
  if (dnsSocket.ok && socketRequest.ok) {
    return {
      status: "ok",
      reason: "avantis_socket_reachable",
      action: "proceed_with_avantis_native_pnl"
    };
  }

  return {
    status: "degraded",
    reason: !dnsSocket.ok ? "dns_resolution_failed" : "socket_api_unreachable",
    action: "do_not_claim_authoritative_perp_pnl",
    fallback: {
      pythCommand:
        "node scripts/query-pyth.js latest --feed-ids <pyth_feed_id> --json",
      guidance:
        "Mark monitoring as degraded and avoid precision PnL claims until Avantis socket endpoint is reachable."
    }
  };
}

function printResult(result, jsonMode) {
  if (jsonMode) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(`mode=${result.mode}`);
  console.log(`monitoring=${result.monitoring.status}`);
  console.log(`reason=${result.monitoring.reason}`);
  if (result.mode === "pair-feeds" && result.data && result.data.pair) {
    console.log(`pair=${result.data.pair.pairSymbol}`);
    console.log(`pair_found=${Boolean(result.data.pair.found)}`);
    if (result.data.pair.found) {
      console.log(`pair_feed_id=${result.data.pair.found.feedId || ""}`);
      console.log(`pair_lazer_feed_id=${result.data.pair.found.lazerFeedId || ""}`);
    }
  }
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

  const socketHost = extractHost(config.socketApiUrl);
  const coreHost = extractHost(config.coreApiBaseUrl);
  const feedHost = extractHost(config.feedV3Url);

  const [dnsSocket, dnsCore, dnsFeed] = await Promise.all([
    resolveHost(socketHost),
    resolveHost(coreHost),
    resolveHost(feedHost)
  ]);

  const [socketRequest, coreRequest, feedRequest] = await Promise.all([
    fetchJsonWithRetry(config.socketApiUrl, config.timeoutMs, config.retries, config.retryDelayMs, {
      parseJsonBody: true,
      allowHttpErrorStatus: false
    }),
    fetchJsonWithRetry(config.coreApiBaseUrl, config.timeoutMs, config.retries, config.retryDelayMs, {
      parseJsonBody: false,
      allowHttpErrorStatus: true
    }),
    fetchJsonWithRetry(config.feedV3Url, config.timeoutMs, config.retries, config.retryDelayMs, {
      parseJsonBody: false,
      allowHttpErrorStatus: true
    })
  ]);

  const monitoring = buildMonitoringStatus({ dnsSocket, socketRequest });
  const socketPayload =
    socketRequest.ok && socketRequest.body && typeof socketRequest.body === "object"
      ? socketRequest.body
      : null;
  const result = {
    mode: config.mode,
    source: {
      socketApiUrl: config.socketApiUrl,
      coreApiBaseUrl: config.coreApiBaseUrl,
      feedV3Url: config.feedV3Url
    },
    checks: {
      dns: {
        socket: dnsSocket,
        core: dnsCore,
        feedV3: dnsFeed
      },
      endpoints: {
        socketApi: {
          ok: socketRequest.ok,
          reachable: socketRequest.reachable === true,
          status: socketRequest.status || null,
          attempts: socketRequest.attempt || socketRequest.attempts,
          elapsedMs: socketRequest.elapsedMs || null,
          error: socketRequest.error || null,
          dataVersion:
            socketPayload &&
            socketPayload.data &&
            typeof socketPayload.data.dataVersion !== "undefined"
              ? socketPayload.data.dataVersion
              : null,
          pairCount:
            socketPayload &&
            socketPayload.data &&
            typeof socketPayload.data.pairCount === "number"
              ? socketPayload.data.pairCount
              : null
        },
        coreApi: {
          ok: coreRequest.ok,
          reachable: coreRequest.reachable === true,
          status: coreRequest.status || null,
          attempts: coreRequest.attempt || coreRequest.attempts,
          elapsedMs: coreRequest.elapsedMs || null,
          error: coreRequest.error || null
        },
        feedV3: {
          ok: feedRequest.ok,
          reachable: feedRequest.reachable === true,
          status: feedRequest.status || null,
          attempts: feedRequest.attempt || feedRequest.attempts,
          elapsedMs: feedRequest.elapsedMs || null,
          error: feedRequest.error || null
        }
      }
    },
    monitoring,
    data: null
  };

  if (socketPayload) {
    const payload = socketPayload;
    const meta = {
      success: Boolean(payload.success),
      dataVersion:
        payload && payload.data && typeof payload.data.dataVersion !== "undefined"
          ? payload.data.dataVersion
          : null,
      pairCount:
        payload && payload.data && typeof payload.data.pairCount === "number"
          ? payload.data.pairCount
          : null
    };

    if (config.mode === "pair-feeds") {
      const pair = extractPairSnapshot(payload, config.pairSymbol);
      result.data = { meta, pair };
      if (!pair.found) {
        result.monitoring = {
          status: "degraded",
          reason: "pair_not_found_in_avantis_feed",
          action: "block_precise_perp_monitoring_until_pair_is_resolved"
        };
      }
    } else {
      result.data = { meta };
    }
  } else if (config.mode === "pair-feeds") {
    throw new Error(
      `avantis_pair_feed_unavailable: ${socketRequest.error || "unknown socket-api error"}`
    );
  }

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
