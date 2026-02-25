#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const WALLET_DIR = path.join(os.homedir(), ".openclaw", "wallets");
const CANONICAL_WALLET_BASENAME = "clawdefi-wallet";
const DEFAULT_PROFILE_PATH = path.join(
  os.homedir(),
  ".openclaw",
  "skills",
  "clawdefi-agent",
  "profile.json",
);

function printUsage() {
  console.log("Usage:");
  console.log("  node scripts/create-wallet.js --env");
  console.log("  node scripts/create-wallet.js --json");
  console.log("  node scripts/create-wallet.js --managed");
  console.log("  node scripts/create-wallet.js --env --force");
  console.log("  node scripts/create-wallet.js --json --force");
  console.log("  node scripts/create-wallet.js --managed --force");
  console.log("");
  console.log("Notes:");
  console.log("  - You must pass an explicit mode flag: --env, --json, or --managed.");
  console.log("  - Requires dependency: npm install ethers");
  console.log(
    "  - Wallet JSON is always written to ~/.openclaw/wallets/clawdefi-wallet.json (plaintext key at rest).",
  );
  console.log(
    "  - If canonical file exists and --force is not set, a new file is created as clawdefi-wallet-2.json, then -3, ...",
  );
  console.log("  - --force overwrites the canonical wallet file path.");
  console.log("  - Public wallet addresses are synced to ~/.openclaw/skills/clawdefi-agent/profile.json (or $CLAWDEFI_PROFILE_PATH).");
  console.log("  - Custom wallet names/paths are intentionally not supported.");
}

function parseArgs(argv) {
  let mode = null;
  let force = false;

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
      continue;
    }
    if (arg === "--force") {
      force = true;
      continue;
    }

    throw new Error(
      `Unexpected argument: ${arg}. Custom wallet names/paths are disabled; use canonical policy only.`,
    );
  }

  if (!mode) {
    throw new Error("No mode selected. Use --env, --json, or --managed.");
  }

  return { mode, force };
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
  ensureDirSecure(WALLET_DIR);

  const logPath = path.join(WALLET_DIR, "audit.log");
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

function resolveProfilePath() {
  const override = process.env.CLAWDEFI_PROFILE_PATH;
  if (override && override.trim()) {
    return override.trim();
  }
  return DEFAULT_PROFILE_PATH;
}

function syncPublicWalletProfile(address) {
  const profilePath = resolveProfilePath();
  const profileDir = path.dirname(profilePath);
  ensureDirSecure(profileDir);

  let profile = {};
  if (fs.existsSync(profilePath)) {
    try {
      const raw = fs.readFileSync(profilePath, "utf8");
      profile = raw.trim() ? JSON.parse(raw) : {};
    } catch (_) {
      profile = {};
    }
  }

  const currentWallets = Array.isArray(profile.wallets)
    ? profile.wallets.filter((v) => typeof v === "string")
    : [];

  const seen = new Set(currentWallets.map((w) => w.toLowerCase()));
  let wallets = [...currentWallets];
  let added = false;

  if (!seen.has(address.toLowerCase())) {
    wallets.push(address);
    added = true;
  }

  const nextProfile = { wallets };
  fs.writeFileSync(profilePath, `${JSON.stringify(nextProfile, null, 2)}\n`, {
    mode: 0o600,
  });
  try {
    fs.chmodSync(profilePath, 0o600);
  } catch (_) {
    // best-effort hardening only
  }

  return { profilePath, added };
}

function getCanonicalWalletPath() {
  return path.join(WALLET_DIR, `${CANONICAL_WALLET_BASENAME}.json`);
}

function getIndexedWalletPath(index) {
  return path.join(WALLET_DIR, `${CANONICAL_WALLET_BASENAME}-${index}.json`);
}

function resolveWalletOutPath(force) {
  ensureDirSecure(WALLET_DIR);

  const canonicalPath = getCanonicalWalletPath();
  const canonicalExists = fs.existsSync(canonicalPath);

  if (force || !canonicalExists) {
    return {
      canonicalPath,
      outPath: canonicalPath,
      canonicalExists,
      createdAdditional: false,
      additionalIndex: null,
      overwroteCanonical: force && canonicalExists,
    };
  }

  for (let index = 2; index < 10000; index += 1) {
    const candidate = getIndexedWalletPath(index);
    if (!fs.existsSync(candidate)) {
      return {
        canonicalPath,
        outPath: candidate,
        canonicalExists: true,
        createdAdditional: true,
        additionalIndex: index,
        overwroteCanonical: false,
      };
    }
  }

  throw new Error("Unable to allocate wallet filename. Too many wallet files already exist.");
}

function writeWalletFile(payload, outPath) {
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

function printPathNoticeBeforeCreate(pathInfo) {
  if (pathInfo.overwroteCanonical) {
    console.error(
      `WARNING: --force enabled. Existing canonical wallet at ${pathInfo.canonicalPath} will be overwritten.`,
    );
    return;
  }

  if (pathInfo.createdAdditional) {
    console.error(
      `NOTICE: Existing canonical wallet detected at ${pathInfo.canonicalPath}.`,
    );
    console.error(
      `NOTICE: Creating additional wallet at ${pathInfo.outPath}. Use --force to overwrite canonical wallet instead.`,
    );
  }
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.length === 0) {
    printUsage();
    process.exit(2);
  }

  const { mode, force } = parseArgs(argv);
  const Wallet = loadWalletFactory();
  const wallet = Wallet.createRandom();
  const pathInfo = resolveWalletOutPath(force);

  const payload = {
    address: wallet.address,
    privateKey: wallet.privateKey,
    createdAt: new Date().toISOString(),
  };
  printPathNoticeBeforeCreate(pathInfo);
  writeWalletFile(payload, pathInfo.outPath);

  let profileSync = null;
  try {
    profileSync = syncPublicWalletProfile(payload.address);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`WARNING: profile sync failed: ${message}`);
  }

  const outputPayload = {
    ...payload,
    walletFilePath: pathInfo.outPath,
    canonicalWalletFilePath: pathInfo.canonicalPath,
    profilePath: profileSync ? profileSync.profilePath : resolveProfilePath(),
    profileWalletAdded: profileSync ? profileSync.added : false,
    createdAdditionalWallet: pathInfo.createdAdditional,
    overwrittenCanonicalWallet: pathInfo.overwroteCanonical,
  };

  const auditDetails = {
    mode,
    address: payload.address,
    path: pathInfo.outPath,
    canonicalPath: pathInfo.canonicalPath,
    profilePath: outputPayload.profilePath,
    profileWalletAdded: outputPayload.profileWalletAdded,
    force,
    createdAdditionalWallet: pathInfo.createdAdditional,
    additionalIndex: pathInfo.additionalIndex,
    overwrittenCanonicalWallet: pathInfo.overwroteCanonical,
  };

  if (mode === "json") {
    console.log(JSON.stringify(outputPayload, null, 2));
    appendAudit("wallet_created", auditDetails);
    return;
  }

  if (mode === "managed") {
    console.log(`Wallet created: ${outputPayload.address}`);
    console.log(`Stored at: ${outputPayload.walletFilePath}`);
    console.log(`Public profile: ${outputPayload.profilePath}`);
    console.log(
      "WARNING: Wallet file stores plaintext private key on disk. Use only on a secured local machine.",
    );
    appendAudit("wallet_created", auditDetails);
    return;
  }

  console.error(
    "WARNING: --env prints the private key to stdout. Run only in a secure local terminal; do not run in CI or anywhere stdout is logged.",
  );
  console.error(
    "WARNING: Wallet file stores plaintext private key on disk. Use only on a secured local machine.",
  );
  console.log(`export WALLET_ADDRESS="${outputPayload.address}"`);
  console.log(`export PRIVATE_KEY="${outputPayload.privateKey}"`);
  console.log(`export WALLET_FILE_PATH="${outputPayload.walletFilePath}"`);
  console.log(`export CLAWDEFI_PROFILE_PATH="${outputPayload.profilePath}"`);
  appendAudit("wallet_created", auditDetails);
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
