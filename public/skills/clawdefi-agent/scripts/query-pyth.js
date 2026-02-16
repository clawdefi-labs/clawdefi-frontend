#!/usr/bin/env node
"use strict";

function printUsage() {
  console.log("Usage:");
  console.log("  node scripts/query-pyth.js latest --feed-ids <id1,id2> --json");
  console.log("  node scripts/query-pyth.js stream --feed-ids <id1,id2> --max-events 3 --json");
  console.log("  node scripts/query-pyth.js pro-wss --json");
  console.log("");
  console.log("Modes:");
  console.log("  latest   Fetch latest updates from Hermes REST API");
  console.log("  stream   Read streaming updates from Hermes SSE endpoint");
  console.log("  pro-wss  Return official Pyth Pro WebSocket endpoints and auth requirements");
  console.log("");
  console.log("Environment:");
  console.log("  PYTH_HERMES_BASE_URL      (default: https://hermes.pyth.network)");
  console.log("  PYTH_FEED_IDS             comma-separated Pyth feed IDs");
  console.log("  PYTH_TIMEOUT_MS           (default: 10000)");
  console.log("  PYTH_STREAM_TIMEOUT_MS    (default: 30000)");
  console.log("  PYTH_MAX_EVENTS           (default: 3)");
  console.log("  PYTH_PRO_WS_URLS          comma-separated WebSocket endpoints");
  console.log("  PYTH_PRO_ACCESS_TOKEN     optional, for pro-wss mode metadata");
  console.log("");
  console.log("Flags:");
  console.log("  --include-binary true|false      include binary payload from Hermes responses (default: false)");
  console.log("  --include-raw-events true|false  include raw SSE event payload text in stream mode (default: false)");
}

function parsePositiveInt(rawValue, key) {
  const value = Number.parseInt(String(rawValue), 10);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${key} must be a positive integer.`);
  }
  return value;
}

function normalizeBaseUrl(rawUrl) {
  const trimmed = String(rawUrl || "").trim();
  if (!trimmed) {
    return "https://hermes.pyth.network";
  }
  return trimmed.replace(/\/+$/, "");
}

function normalizeWsUrls(rawValue) {
  const fallback = [
    "wss://pyth-lazer-0.dourolabs.app/v1/stream",
    "wss://pyth-lazer-1.dourolabs.app/v1/stream",
    "wss://pyth-lazer-2.dourolabs.app/v1/stream"
  ];
  const trimmed = String(rawValue || "").trim();
  if (!trimmed) {
    return fallback;
  }
  return trimmed
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseFeedIds(rawValue) {
  const trimmed = String(rawValue || "").trim();
  if (!trimmed) {
    return [];
  }
  const ids = trimmed
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  for (const id of ids) {
    if (!/^0x[a-fA-F0-9]{64}$/.test(id)) {
      throw new Error(`Invalid feed id format: ${id}`);
    }
  }
  return ids;
}

function parseArgs(argv) {
  if (argv.length === 0 || argv[0] === "--help" || argv[0] === "-h") {
    printUsage();
    process.exit(0);
  }

  const mode = String(argv[0]).toLowerCase();
  if (!["latest", "stream", "pro-wss"].includes(mode)) {
    throw new Error("First argument must be one of: latest | stream | pro-wss");
  }

  const config = {
    mode,
    hermesBaseUrl: process.env.PYTH_HERMES_BASE_URL || "https://hermes.pyth.network",
    feedIds: process.env.PYTH_FEED_IDS || "",
    timeoutMs: process.env.PYTH_TIMEOUT_MS || "10000",
    streamTimeoutMs: process.env.PYTH_STREAM_TIMEOUT_MS || "30000",
    maxEvents: process.env.PYTH_MAX_EVENTS || "3",
    proWsUrls: process.env.PYTH_PRO_WS_URLS || "",
    proAccessToken: process.env.PYTH_PRO_ACCESS_TOKEN || "",
    includeBinary: (process.env.PYTH_INCLUDE_BINARY || "false").toLowerCase(),
    includeRawEvents: (process.env.PYTH_INCLUDE_RAW_EVENTS || "false").toLowerCase(),
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

    if (arg === "--hermes-base-url") {
      config.hermesBaseUrl = value;
      i += 1;
      continue;
    }
    if (arg === "--feed-ids") {
      config.feedIds = value;
      i += 1;
      continue;
    }
    if (arg === "--timeout-ms") {
      config.timeoutMs = value;
      i += 1;
      continue;
    }
    if (arg === "--stream-timeout-ms") {
      config.streamTimeoutMs = value;
      i += 1;
      continue;
    }
    if (arg === "--max-events") {
      config.maxEvents = value;
      i += 1;
      continue;
    }
    if (arg === "--pro-ws-urls") {
      config.proWsUrls = value;
      i += 1;
      continue;
    }
    if (arg === "--pro-access-token") {
      config.proAccessToken = value;
      i += 1;
      continue;
    }
    if (arg === "--include-binary") {
      config.includeBinary = value.toLowerCase();
      i += 1;
      continue;
    }
    if (arg === "--include-raw-events") {
      config.includeRawEvents = value.toLowerCase();
      i += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  const parsed = {
    mode,
    hermesBaseUrl: normalizeBaseUrl(config.hermesBaseUrl),
    feedIds: parseFeedIds(config.feedIds),
    timeoutMs: parsePositiveInt(config.timeoutMs, "timeoutMs"),
    streamTimeoutMs: parsePositiveInt(config.streamTimeoutMs, "streamTimeoutMs"),
    maxEvents: parsePositiveInt(config.maxEvents, "maxEvents"),
    proWsUrls: normalizeWsUrls(config.proWsUrls),
    proAccessToken: String(config.proAccessToken).trim(),
    includeBinary: config.includeBinary === "true",
    includeRawEvents: config.includeRawEvents === "true",
    json: config.json
  };

  if ((mode === "latest" || mode === "stream") && parsed.feedIds.length === 0) {
    throw new Error(`${mode} mode requires --feed-ids (comma-separated 0x... feed IDs).`);
  }

  for (const wsUrl of parsed.proWsUrls) {
    if (!wsUrl.startsWith("wss://")) {
      throw new Error(`Invalid WebSocket URL (must start with wss://): ${wsUrl}`);
    }
  }

  return parsed;
}

async function fetchJson(url, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json"
      },
      signal: controller.signal
    });
    const bodyText = await response.text();
    let body = null;
    try {
      body = bodyText ? JSON.parse(bodyText) : null;
    } catch (_) {
      body = { raw: bodyText };
    }

    if (!response.ok) {
      const message =
        (body && (body.message || body.error || body.description)) || bodyText || `HTTP ${response.status}`;
      throw new Error(`pyth_http_error_${response.status}: ${message}`);
    }
    return body;
  } finally {
    clearTimeout(timeout);
  }
}

function buildHermesLatestUrl(baseUrl, feedIds) {
  const params = new URLSearchParams();
  for (const id of feedIds) {
    params.append("ids[]", id);
  }
  return `${baseUrl}/v2/updates/price/latest?${params.toString()}`;
}

function buildHermesStreamUrl(baseUrl, feedIds) {
  const params = new URLSearchParams();
  for (const id of feedIds) {
    params.append("ids[]", id);
  }
  return `${baseUrl}/v2/updates/price/stream?${params.toString()}`;
}

function parseSseChunk(buffer, onEvent) {
  let start = 0;
  let currentEvent = "";
  const lines = buffer.split("\n");
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].replace(/\r$/, "");
    if (line === "") {
      if (currentEvent) {
        onEvent(currentEvent);
        currentEvent = "";
      }
      start = i + 1;
      continue;
    }
    if (line.startsWith("data:")) {
      const data = line.slice(5).trimStart();
      currentEvent = currentEvent ? `${currentEvent}\n${data}` : data;
    }
  }
  return lines.slice(start).join("\n");
}

async function fetchStreamEvents(url, timeoutMs, maxEvents) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  const events = [];
  const decoder = new TextDecoder();
  let pending = "";

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "text/event-stream"
      },
      signal: controller.signal
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`pyth_stream_error_${response.status}: ${text || "stream request failed"}`);
    }
    if (!response.body) {
      throw new Error("pyth_stream_error: response body is empty");
    }

    const reader = response.body.getReader();
    while (events.length < maxEvents) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      pending += decoder.decode(value, { stream: true });
      pending = parseSseChunk(pending, (eventPayload) => {
        if (!eventPayload) {
          return;
        }
        try {
          events.push({
            raw: eventPayload,
            data: JSON.parse(eventPayload)
          });
        } catch {
          events.push({
            raw: eventPayload,
            data: null
          });
        }
      });
    }

    return events.slice(0, maxEvents);
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError" && events.length > 0) {
      return events.slice(0, maxEvents);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    controller.abort();
  }
}

function summarizeBinary(binaryNode) {
  if (!binaryNode || typeof binaryNode !== "object") {
    return null;
  }
  const encoding =
    "encoding" in binaryNode && typeof binaryNode.encoding === "string"
      ? binaryNode.encoding
      : null;
  const dataArray =
    "data" in binaryNode && Array.isArray(binaryNode.data) ? binaryNode.data : [];
  const bytes = dataArray.reduce((sum, item) => {
    if (typeof item !== "string") {
      return sum;
    }
    return sum + Math.floor(item.length / 2);
  }, 0);
  return {
    encoding,
    updateCount: dataArray.length,
    approxBytes: bytes
  };
}

function normalizeLatestPayload(payload, includeBinary) {
  if (!payload || typeof payload !== "object") {
    return payload;
  }
  const parsed = Array.isArray(payload.parsed) ? payload.parsed : [];
  if (includeBinary) {
    return payload;
  }
  return {
    parsed,
    binary: summarizeBinary(payload.binary)
  };
}

function normalizeStreamEvents(events, options) {
  return events.map((event) => {
    const out = {};
    if (options.includeRawEvents) {
      out.raw = event.raw;
    }
    if (!event.data || typeof event.data !== "object") {
      out.data = event.data;
      return out;
    }

    if (options.includeBinary) {
      out.data = event.data;
      return out;
    }

    out.data = {
      parsed: Array.isArray(event.data.parsed) ? event.data.parsed : [],
      binary: summarizeBinary(event.data.binary)
    };
    return out;
  });
}

function printResult(result, jsonMode) {
  if (jsonMode) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(`mode=${result.mode}`);
  if (result.mode === "latest") {
    const parsedCount = Array.isArray(result.data && result.data.parsed) ? result.data.parsed.length : 0;
    console.log(`feedCount=${parsedCount}`);
    console.log(`source=${result.meta.source}`);
    return;
  }
  if (result.mode === "stream") {
    console.log(`eventsCaptured=${Array.isArray(result.events) ? result.events.length : 0}`);
    console.log(`source=${result.meta.source}`);
    return;
  }
  console.log(`endpoints=${result.endpoints.length}`);
  console.log(`tokenConfigured=${result.auth.tokenConfigured}`);
}

function stringifyError(error) {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

async function main() {
  const config = parseArgs(process.argv.slice(2));

  if (config.mode === "latest") {
    const url = buildHermesLatestUrl(config.hermesBaseUrl, config.feedIds);
    const data = await fetchJson(url, config.timeoutMs);
    const result = {
      mode: "latest",
      meta: {
        source: "pyth-hermes",
        baseUrl: config.hermesBaseUrl,
        requestUrl: url,
        includeBinary: config.includeBinary
      },
      data: normalizeLatestPayload(data, config.includeBinary)
    };
    printResult(result, config.json);
    return;
  }

  if (config.mode === "stream") {
    const url = buildHermesStreamUrl(config.hermesBaseUrl, config.feedIds);
    const events = await fetchStreamEvents(url, config.streamTimeoutMs, config.maxEvents);
    const result = {
      mode: "stream",
      meta: {
        source: "pyth-hermes-sse",
        baseUrl: config.hermesBaseUrl,
        requestUrl: url,
        maxEvents: config.maxEvents,
        includeBinary: config.includeBinary,
        includeRawEvents: config.includeRawEvents
      },
      events: normalizeStreamEvents(events, {
        includeBinary: config.includeBinary,
        includeRawEvents: config.includeRawEvents
      })
    };
    printResult(result, config.json);
    return;
  }

  const result = {
    mode: "pro-wss",
    meta: {
      source: "pyth-pro",
      note: "Use all endpoints for redundancy; authentication requires Authorization: Bearer <token>."
    },
    endpoints: config.proWsUrls,
    auth: {
      required: true,
      header: "Authorization: Bearer <PYTH_PRO_ACCESS_TOKEN>",
      tokenConfigured: config.proAccessToken.length > 0
    },
    sdkHint: {
      package: "@pythnetwork/pyth-lazer-sdk",
      install: "npm install --save @pythnetwork/pyth-lazer-sdk"
    }
  };
  printResult(result, config.json);
}

main().catch((error) => {
  console.error(`query-pyth failed: ${stringifyError(error)}`);
  process.exit(1);
});
