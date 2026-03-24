#!/usr/bin/env node

import { createHash } from "node:crypto";
import { access, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SKILL_NAME = "clawdefi-agent";
const REQUIRED_RUNTIME_FILES = [
  "scripts/install-raw.sh",
  "scripts/update-from-manifest.sh",
  "scripts/onboard.sh",
  "scripts/update.sh"
];
const EXCLUDED_RUNTIME_BASENAMES = new Set([
  "generate-platform-manifest.sh",
  "generate-skill-manifest.sh",
  "install-platform.sh",
  "update-platform.sh",
  "perps-tx-action-common.js",
  "query-protocol.js",
  "simulate-transaction.js",
  "swap-1inch.js"
]);
const FALLBACK_RUNTIME_FILES = [
  "scripts/install-raw.sh",
  "scripts/update-from-manifest.sh",
  "scripts/onboard.sh",
  "scripts/update.sh",
  "scripts/wallet-common.js",
  "scripts/wallet-create.js",
  "scripts/wallet-import.js",
  "scripts/wallet-discover.js",
  "scripts/wallet-select.js",
  "scripts/wallet-balance.js",
  "scripts/wallet-sign.js",
  "scripts/wallet-sign-broadcast.js",
  "scripts/wallet-transfer.js",
  "scripts/query-coingecko.js",
  "scripts/query-avantis.js",
  "scripts/query-pyth.js",
  "scripts/query-contract-verification.js"
];

const FRONTEND_ROOT = path.resolve(__dirname, "..");
const WORKSPACE_ROOT = path.resolve(FRONTEND_ROOT, "..");
const LOCAL_SKILL_ROOT = path.join(WORKSPACE_ROOT, "skill");
const DISABLE_LOCAL_SOURCE = process.env.SKILL_DISABLE_LOCAL === "1";
const CANONICAL_PUBLIC_SKILL_BASE_URL = "https://www.clawdefi.ai/skills/clawdefi-agent";
const USE_VERCEL_DEPLOY_BASE_URL = process.env.SKILL_USE_VERCEL_URL === "1";
const VERCEL_DEPLOY_BASE_URL = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}/skills/${SKILL_NAME}`
  : "";
const SOURCE_BASE_URL = (
  process.env.SKILL_SOURCE_BASE_URL ||
  "https://raw.githubusercontent.com/clawdefi-labs/clawdefi-agent-skill/main"
).replace(/\/+$/, "");
const PUBLIC_SKILL_BASE_URL = (
  process.env.SKILL_PUBLIC_BASE_URL ||
  (USE_VERCEL_DEPLOY_BASE_URL ? VERCEL_DEPLOY_BASE_URL : "") ||
  CANONICAL_PUBLIC_SKILL_BASE_URL
).replace(/\/+$/, "");
const OUTPUT_ROOT = path.join(FRONTEND_ROOT, "public");
const OUTPUT_SKILL_ROOT = path.join(OUTPUT_ROOT, "skills", SKILL_NAME);
const LEGACY_SKILL_BASE_URL = "https://skills.clawdefi.ai/clawdefi-agent";
const LEGACY_SKILL_BASE_URL_TEMPLATE = "https://skills.clawdefi.ai/${SKILL_NAME}";
const SKILL_BASE_URL_RE = /https:\/\/[^/\s`"]+\/skills\/clawdefi-agent/g;
const SKILL_BASE_URL_CHECK_RE = /https:\/\/[^/\s`"]+\/skills\/clawdefi-agent/;
const PUBLIC_SKILL_BASE_ROOT = PUBLIC_SKILL_BASE_URL.replace(/\/[^/]+$/, "");

function sha256(content) {
  return createHash("sha256").update(content).digest("hex");
}

function parseFrontmatterVersion(skillText) {
  const match = skillText.match(/^version:\s*([^\n]+)$/m);
  if (!match) {
    throw new Error("Cannot parse version from SKILL.md frontmatter.");
  }
  return match[1].trim();
}

function rewriteSkillPublicUrls(skillText) {
  const hasLegacyBase = skillText.includes(LEGACY_SKILL_BASE_URL);
  const hasSkillBase = SKILL_BASE_URL_CHECK_RE.test(skillText);
  if (!hasLegacyBase && !hasSkillBase) {
    return skillText;
  }
  return skillText
    .replace(SKILL_BASE_URL_RE, PUBLIC_SKILL_BASE_URL)
    .split(LEGACY_SKILL_BASE_URL)
    .join(PUBLIC_SKILL_BASE_URL);
}

function rewriteRuntimeFilePublicUrls(relativePath, content) {
  if (
    relativePath === "scripts/install-raw.sh" ||
    relativePath === "scripts/update-from-manifest.sh"
  ) {
    return content
      .split(LEGACY_SKILL_BASE_URL_TEMPLATE)
      .join(`${PUBLIC_SKILL_BASE_ROOT}/${"${SKILL_NAME}"}`)
      .split(LEGACY_SKILL_BASE_URL)
      .join(PUBLIC_SKILL_BASE_URL);
  }
  return content;
}

async function fileExists(targetPath) {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function fetchText(url) {
  const response = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "text/plain"
    }
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Fetch failed (${response.status}) ${url}: ${body.slice(0, 180)}`);
  }
  return response.text();
}

async function fetchJson(url) {
  const response = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json"
    }
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Fetch failed (${response.status}) ${url}: ${body.slice(0, 180)}`);
  }
  return response.json();
}

function normalizeRuntimePath(runtimePath) {
  if (!runtimePath) {
    return null;
  }
  const trimmed = String(runtimePath).trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed.startsWith("scripts/")) {
    return trimmed;
  }
  return `scripts/${trimmed}`;
}

async function resolveRuntimeFiles() {
  let discovered = [];
  const localScriptsDir = path.join(LOCAL_SKILL_ROOT, "scripts");

  if (!DISABLE_LOCAL_SOURCE && (await fileExists(localScriptsDir))) {
    const localEntries = await readdir(localScriptsDir, { withFileTypes: true });
    discovered = localEntries.filter((entry) => entry.isFile()).map((entry) => `scripts/${entry.name}`);
  }

  if (!discovered.length) {
    const publishedManifestPath = path.join(OUTPUT_SKILL_ROOT, "manifest.json");
    if (await fileExists(publishedManifestPath)) {
      try {
        const publishedManifest = JSON.parse(await readFile(publishedManifestPath, "utf8"));
        discovered = Array.isArray(publishedManifest.files)
          ? publishedManifest.files
              .map((entry) => (entry && typeof entry.path === "string" ? entry.path : ""))
              .filter(Boolean)
          : [];
      } catch {
        discovered = [];
      }
    }
  }

  if (!discovered.length) {
    try {
      const remoteManifest = await fetchJson(`${SOURCE_BASE_URL}/manifest.json`);
      discovered = Array.isArray(remoteManifest.files)
        ? remoteManifest.files
            .map((entry) => (entry && typeof entry.path === "string" ? entry.path : ""))
            .filter(Boolean)
        : [];
    } catch {
      discovered = [];
    }
  }

  if (!discovered.length) {
    discovered = [...FALLBACK_RUNTIME_FILES];
  }

  const normalized = new Set();
  for (const runtimeFile of [...REQUIRED_RUNTIME_FILES, ...discovered]) {
    const normalizedPath = normalizeRuntimePath(runtimeFile);
    if (!normalizedPath) {
      continue;
    }
    if (!normalizedPath.startsWith("scripts/")) {
      continue;
    }
    const basename = path.basename(normalizedPath);
    if (EXCLUDED_RUNTIME_BASENAMES.has(basename)) {
      continue;
    }
    normalized.add(normalizedPath);
  }

  return [...normalized].sort();
}

async function loadSourceFile(relativePath) {
  const localPath = path.join(LOCAL_SKILL_ROOT, relativePath);
  if (!DISABLE_LOCAL_SOURCE && (await fileExists(localPath))) {
    const content = await readFile(localPath, "utf8");
    return { content, source: "local" };
  }

  const publishedSkillPath =
    relativePath === "SKILL.md"
      ? path.join(OUTPUT_SKILL_ROOT, "SKILL.md")
      : path.join(OUTPUT_SKILL_ROOT, relativePath);
  if (await fileExists(publishedSkillPath)) {
    const content = await readFile(publishedSkillPath, "utf8");
    return { content, source: "published" };
  }

  if (relativePath === "SKILL.md") {
    const publishedRootSkillPath = path.join(OUTPUT_ROOT, "skill.md");
    if (await fileExists(publishedRootSkillPath)) {
      const content = await readFile(publishedRootSkillPath, "utf8");
      return { content, source: "published" };
    }
  }

  const remoteUrl = `${SOURCE_BASE_URL}/${relativePath}`;
  const content = await fetchText(remoteUrl);
  return { content, source: "remote" };
}

async function writeText(targetPath, content) {
  await mkdir(path.dirname(targetPath), { recursive: true });
  await writeFile(targetPath, content, "utf8");
}

async function prunePublishedRuntimeFiles(runtimeFiles) {
  const scriptsDir = path.join(OUTPUT_SKILL_ROOT, "scripts");
  if (!(await fileExists(scriptsDir))) {
    return;
  }

  const allowed = new Set(runtimeFiles.map((runtimeFile) => path.basename(runtimeFile)));
  for (const entry of await readdir(scriptsDir, { withFileTypes: true })) {
    if (!entry.isFile()) {
      continue;
    }
    if (allowed.has(entry.name)) {
      continue;
    }
    await rm(path.join(scriptsDir, entry.name), { force: true });
  }
}

async function performSync() {
  const runtimeFiles = await resolveRuntimeFiles();
  const copiedFrom = new Set();
  const fileMap = new Map();

  const skill = await loadSourceFile("SKILL.md");
  fileMap.set("SKILL.md", skill.content);
  copiedFrom.add(skill.source);

  for (const runtimeFile of runtimeFiles) {
    const loaded = await loadSourceFile(runtimeFile);
    fileMap.set(runtimeFile, rewriteRuntimeFilePublicUrls(runtimeFile, loaded.content));
    copiedFrom.add(loaded.source);
  }

  const rawSkillText = fileMap.get("SKILL.md");
  const skillText = rewriteSkillPublicUrls(rawSkillText);
  const version = parseFrontmatterVersion(skillText);
  const skillSha = sha256(skillText);

  await prunePublishedRuntimeFiles(runtimeFiles);
  await writeText(path.join(OUTPUT_ROOT, "skill.md"), skillText);
  await writeText(path.join(OUTPUT_SKILL_ROOT, "SKILL.md"), skillText);

  const filesManifest = [];
  for (const runtimeFile of runtimeFiles) {
    const content = fileMap.get(runtimeFile);
    const outPath = path.join(OUTPUT_SKILL_ROOT, runtimeFile);
    await writeText(outPath, content);
    filesManifest.push({
      path: runtimeFile,
      url: `${PUBLIC_SKILL_BASE_URL}/${runtimeFile}`,
      sha256: sha256(content)
    });
  }

  const manifest = {
    name: SKILL_NAME,
    version,
    skill_url: `${PUBLIC_SKILL_BASE_URL}/SKILL.md`,
    sha256: skillSha,
    files: filesManifest
  };

  await writeText(
    path.join(OUTPUT_SKILL_ROOT, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`
  );

  const sourceSummary = [...copiedFrom].sort().join("+");
  console.log(
    `Synced ${SKILL_NAME} assets (version=${version}, source=${sourceSummary}, files=${runtimeFiles.length}) to ${OUTPUT_SKILL_ROOT}`
  );
  console.log(`Published entrypoints: /skill.md and /skills/${SKILL_NAME}/SKILL.md`);
}

async function main() {
  await performSync();
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`sync-skill-assets failed: ${message}`);
  process.exit(1);
});
