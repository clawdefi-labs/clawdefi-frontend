#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

function printUsage() {
  console.log("Usage:");
  console.log("  node scripts/create-wallet.js --env");
  console.log("  node scripts/create-wallet.js --json");
  console.log("  node scripts/create-wallet.js --managed [wallet-name]");
  console.log("");
  console.log("Notes:");
  console.log("  - You must pass an explicit mode flag (no default mode).");
  console.log("  - Requires dependency: npm install ethers");
  console.log("  - --managed writes plaintext key JSON to disk (local development only).");
}

function parseArgs(argv) {
  let mode = null;
  let managedName = "agent";

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--help" || arg === "-h") {
      printUsage();
      process.exit(0);
    }
    if (arg === "--env") {
      mode = "env";
      continue;
    }
    if (arg === "--json") {
      mode = "json";
      continue;
    }
    if (arg === "--managed") {
      mode = "managed";
      const maybeName = argv[i + 1];
      if (maybeName && !maybeName.startsWith("-")) {
        managedName = maybeName;
        i += 1;
      }
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!mode) {
    throw new Error("No mode selected. Use --env, --json, or --managed.");
  }

  return { mode, managedName };
}

function loadWalletFactory() {
  try {
    const ethers = require("ethers");
    if (!ethers.Wallet || typeof ethers.Wallet.createRandom !== "function") {
      throw new Error("ethers.Wallet.createRandom is unavailable");
    }
    return ethers.Wallet;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Missing dependency or invalid ethers runtime (${message}). Run: npm install ethers`,
    );
  }
}

function ensureDirSecure(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true, mode: 0o700 });
  try {
    fs.chmodSync(dirPath, 0o700);
  } catch (_) {
    // best-effort hardening only
  }
}

function appendAudit(event, details) {
  const auditDir = path.join(os.homedir(), ".openclaw", "wallets");
  ensureDirSecure(auditDir);

  const logPath = path.join(auditDir, "audit.log");
  const row = JSON.stringify({
    ts: new Date().toISOString(),
    event,
    ...details,
  });

  fs.appendFileSync(logPath, `${row}\n`, { mode: 0o600 });
  try {
    fs.chmodSync(logPath, 0o600);
  } catch (_) {
    // best-effort hardening only
  }
}

function writeManagedWalletFile(payload, managedName) {
  if (!/^[a-zA-Z0-9._-]+$/.test(managedName)) {
    throw new Error(
      "Invalid wallet name. Use only letters, numbers, dot, underscore, or dash.",
    );
  }

  const walletsDir = path.join(os.homedir(), ".openclaw", "wallets");
  ensureDirSecure(walletsDir);

  const outPath = path.join(walletsDir, `${managedName}.json`);
  fs.writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`, {
    mode: 0o600,
  });
  try {
    fs.chmodSync(outPath, 0o600);
  } catch (_) {
    // best-effort hardening only
  }
  return outPath;
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.length === 0) {
    printUsage();
    process.exit(2);
  }

  const { mode, managedName } = parseArgs(argv);
  const Wallet = loadWalletFactory();
  const wallet = Wallet.createRandom();

  const payload = {
    address: wallet.address,
    privateKey: wallet.privateKey,
    createdAt: new Date().toISOString(),
  };

  if (mode === "json") {
    console.log(JSON.stringify(payload, null, 2));
    appendAudit("wallet_created", { mode: "json", address: payload.address });
    return;
  }

  if (mode === "managed") {
    const outPath = writeManagedWalletFile(payload, managedName);
    console.log(`Wallet created: ${payload.address}`);
    console.log(`Stored at: ${outPath}`);
    console.log("WARNING: --managed stores plaintext private key on disk. Use local development only.");
    appendAudit("wallet_created", {
      mode: "managed",
      address: payload.address,
      path: outPath,
    });
    return;
  }

  console.error(
    "WARNING: --env prints the private key to stdout. Run only in a secure local terminal; do not run in CI or anywhere stdout is logged.",
  );
  console.log(`export WALLET_ADDRESS="${payload.address}"`);
  console.log(`export PRIVATE_KEY="${payload.privateKey}"`);
  appendAudit("wallet_created", { mode: "env", address: payload.address });
}

try {
  main();
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`create-wallet error: ${message}`);
  if (message.includes("No mode selected")) {
    printUsage();
    process.exit(2);
  }
  process.exit(1);
}
