#!/usr/bin/env node

import { createHash } from "node:crypto";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SKILL_NAME = "clawdefi-agent";
const RUNTIME_FILES = [
  "scripts/install-raw.sh",
  "scripts/update-from-manifest.sh",
  "scripts/create-wallet.js",
  "scripts/wallet-readiness-check.js",
  "scripts/token-balance-check.js",
  "scripts/allowance-manager.js",
  "scripts/simulate-transaction.js",
  "scripts/swap-1inch.js",
  "scripts/query-protocol.js",
  "scripts/query-coingecko.js",
  "scripts/query-avantis.js",
  "scripts/query-pyth.js",
  "scripts/query-contract-verification.js"
];

const FRONTEND_ROOT = path.resolve(__dirname, "..");
const WORKSPACE_ROOT = path.resolve(FRONTEND_ROOT, "..");
const LOCAL_SKILL_ROOT = path.join(WORKSPACE_ROOT, "skill");
const DISABLE_LOCAL_SOURCE = process.env.SKILL_DISABLE_LOCAL === "1";
const STRICT_SYNC = process.env.SKILL_SYNC_STRICT === "1";
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

async function loadSourceFile(relativePath) {
  const localPath = path.join(LOCAL_SKILL_ROOT, relativePath);
  if (!DISABLE_LOCAL_SOURCE && (await fileExists(localPath))) {
    const content = await readFile(localPath, "utf8");
    return { content, source: "local" };
  }

  const remoteUrl = `${SOURCE_BASE_URL}/${relativePath}`;
  const content = await fetchText(remoteUrl);
  return { content, source: "remote" };
}

async function writeText(targetPath, content) {
  await mkdir(path.dirname(targetPath), { recursive: true });
  await writeFile(targetPath, content, "utf8");
}

async function hasCompletePublishedArtifacts() {
  const requiredPaths = [
    path.join(OUTPUT_ROOT, "skill.md"),
    path.join(OUTPUT_SKILL_ROOT, "SKILL.md"),
    path.join(OUTPUT_SKILL_ROOT, "manifest.json"),
    ...RUNTIME_FILES.map((runtimeFile) => path.join(OUTPUT_SKILL_ROOT, runtimeFile))
  ];

  for (const requiredPath of requiredPaths) {
    if (!(await fileExists(requiredPath))) {
      return false;
    }
  }
  return true;
}

async function performSync() {
  const copiedFrom = new Set();
  const fileMap = new Map();

  const skill = await loadSourceFile("SKILL.md");
  fileMap.set("SKILL.md", skill.content);
  copiedFrom.add(skill.source);

  for (const runtimeFile of RUNTIME_FILES) {
    const loaded = await loadSourceFile(runtimeFile);
    fileMap.set(runtimeFile, rewriteRuntimeFilePublicUrls(runtimeFile, loaded.content));
    copiedFrom.add(loaded.source);
  }

  const rawSkillText = fileMap.get("SKILL.md");
  const skillText = rewriteSkillPublicUrls(rawSkillText);
  const version = parseFrontmatterVersion(skillText);
  const skillSha = sha256(skillText);

  await writeText(path.join(OUTPUT_ROOT, "skill.md"), skillText);
  await writeText(path.join(OUTPUT_SKILL_ROOT, "SKILL.md"), skillText);

  const filesManifest = [];
  for (const runtimeFile of RUNTIME_FILES) {
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
    `Synced ${SKILL_NAME} assets (version=${version}, source=${sourceSummary}) to ${OUTPUT_SKILL_ROOT}`
  );
  console.log(`Published entrypoints: /skill.md and /skills/${SKILL_NAME}/SKILL.md`);
}

async function performSyncFromExistingArtifacts() {
  const fileMap = new Map();
  const existingSkillPath = path.join(OUTPUT_SKILL_ROOT, "SKILL.md");
  const existingRootSkillPath = path.join(OUTPUT_ROOT, "skill.md");
  const skillPathToRead = (await fileExists(existingSkillPath))
    ? existingSkillPath
    : existingRootSkillPath;
  const existingSkill = await readFile(skillPathToRead, "utf8");
  fileMap.set("SKILL.md", existingSkill);

  for (const runtimeFile of RUNTIME_FILES) {
    const runtimePath = path.join(OUTPUT_SKILL_ROOT, runtimeFile);
    const runtimeContent = await readFile(runtimePath, "utf8");
    fileMap.set(runtimeFile, rewriteRuntimeFilePublicUrls(runtimeFile, runtimeContent));
  }

  const rawSkillText = fileMap.get("SKILL.md");
  const skillText = rewriteSkillPublicUrls(rawSkillText);
  const version = parseFrontmatterVersion(skillText);
  const skillSha = sha256(skillText);

  await writeText(path.join(OUTPUT_ROOT, "skill.md"), skillText);
  await writeText(path.join(OUTPUT_SKILL_ROOT, "SKILL.md"), skillText);

  const filesManifest = [];
  for (const runtimeFile of RUNTIME_FILES) {
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

  console.log(
    `Synced ${SKILL_NAME} assets (version=${version}, source=published) to ${OUTPUT_SKILL_ROOT}`
  );
  console.log(`Published entrypoints: /skill.md and /skills/${SKILL_NAME}/SKILL.md`);
}

async function main() {
  try {
    await performSync();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!STRICT_SYNC && (await hasCompletePublishedArtifacts())) {
      await performSyncFromExistingArtifacts();
      console.warn(
        `sync-skill-assets warning: ${message}. Re-synced from existing published skill artifacts in public/.`
      );
      return;
    }
    throw error;
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`sync-skill-assets failed: ${message}`);
  process.exit(1);
});
