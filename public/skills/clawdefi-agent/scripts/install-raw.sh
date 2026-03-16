#!/usr/bin/env bash
set -euo pipefail

SKILL_NAME="${SKILL_NAME:-clawdefi-agent}"
SKILLS_BASE_URL="${SKILLS_BASE_URL:-https://www.clawdefi.ai/skills}"
SKILL_URL="${SKILL_URL:-${SKILLS_BASE_URL}/${SKILL_NAME}/SKILL.md}"
MANIFEST_URL="${MANIFEST_URL:-${SKILLS_BASE_URL}/${SKILL_NAME}/manifest.json}"
SKILLS_AUTH_TOKEN="${SKILLS_AUTH_TOKEN:-}"
OPENCLAW_STATE_DIR="${OPENCLAW_STATE_DIR:-$HOME/.openclaw}"
TARGET_ROOT="${TARGET_ROOT:-${OPENCLAW_STATE_DIR}/skills}"
TARGET_DIR="${TARGET_ROOT}/${SKILL_NAME}"
RUNTIME_FILES=(
  "scripts/onboard.sh"
  "scripts/update.sh"
  "scripts/wallet-common.js"
  "scripts/wallet-create.js"
  "scripts/wallet-import.js"
  "scripts/wallet-discover.js"
  "scripts/wallet-select.js"
  "scripts/wallet-balance.js"
  "scripts/wallet-sign.js"
  "scripts/wallet-sign-broadcast.js"
  "scripts/wallet-transfer.js"
  "scripts/wallet-total-portfolio.js"
  "scripts/simulate-transaction.js"
  "scripts/swap-1inch.js"
  "scripts/swap-common.js"
  "scripts/swap-action-helpers.js"
  "scripts/swap-quote.js"
  "scripts/swap-build.js"
  "scripts/swap-simulate.js"
  "scripts/swap-execute.js"
  "scripts/query-protocol.js"
  "scripts/query-coingecko.js"
  "scripts/query-avantis.js"
  "scripts/query-pyth.js"
  "scripts/query-contract-verification.js"
)

auth_curl() {
  if [ -n "$SKILLS_AUTH_TOKEN" ]; then
    curl -fsSL -H "Authorization: Bearer ${SKILLS_AUTH_TOKEN}" "$@"
  else
    curl -fsSL "$@"
  fi
}

sha256_file() {
  local file_path="$1"
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$file_path" | awk '{print $1}'
  else
    shasum -a 256 "$file_path" | awk '{print $1}'
  fi
}

backup_if_exists() {
  local file_path="$1"
  if [ -f "$file_path" ]; then
    cp "$file_path" "${file_path}.bak.$(date +%Y%m%d%H%M%S)"
  fi
}

mkdir -p "$TARGET_DIR" "$TARGET_DIR/scripts"

tmp_dir="$(mktemp -d)"
manifest_tmp="${tmp_dir}/manifest.json"
skill_tmp="${tmp_dir}/SKILL.md"
trap 'rm -rf "$tmp_dir"' EXIT

manifest_present=0
if auth_curl "$MANIFEST_URL" -o "$manifest_tmp"; then
  manifest_present=1
fi

download_skill_url="$SKILL_URL"
expected_skill_sha256=""
if [ "$manifest_present" -eq 1 ] && command -v jq >/dev/null 2>&1; then
  manifest_skill_url="$(jq -r '.skill_url // empty' "$manifest_tmp")"
  manifest_skill_sha256="$(jq -r '.sha256 // empty' "$manifest_tmp")"

  if [ -n "$manifest_skill_url" ]; then
    download_skill_url="$manifest_skill_url"
  fi
  if [ -n "$manifest_skill_sha256" ]; then
    expected_skill_sha256="$manifest_skill_sha256"
  fi
elif [ "$manifest_present" -eq 1 ]; then
  echo "Warning: manifest downloaded but jq is not installed; skipping manifest metadata/checksum parsing." >&2
fi

auth_curl "$download_skill_url" -o "$skill_tmp"

if ! grep -q "^name: ${SKILL_NAME}$" "$skill_tmp"; then
  echo "Downloaded file does not appear to match skill name: ${SKILL_NAME}" >&2
  exit 1
fi

if [ -n "$expected_skill_sha256" ]; then
  actual_skill_sha256="$(sha256_file "$skill_tmp")"
  if [ "$actual_skill_sha256" != "$expected_skill_sha256" ]; then
    echo "Checksum mismatch for downloaded SKILL.md" >&2
    exit 1
  fi
fi

backup_if_exists "${TARGET_DIR}/SKILL.md"
mv "$skill_tmp" "${TARGET_DIR}/SKILL.md"
synced_files=("- SKILL.md")

for runtime_file in "${RUNTIME_FILES[@]}"; do
  runtime_tmp="${tmp_dir}/$(basename "$runtime_file")"
  runtime_target="${TARGET_DIR}/${runtime_file}"
  runtime_url="$(dirname "$SKILL_URL")/${runtime_file}"
  expected_runtime_sha=""

  if [ "$manifest_present" -eq 1 ] && command -v jq >/dev/null 2>&1; then
    manifest_runtime_url="$(jq -r --arg p "$runtime_file" '.files[]? | select(.path == $p) | .url // empty' "$manifest_tmp" | head -n 1)"
    manifest_runtime_sha="$(jq -r --arg p "$runtime_file" '.files[]? | select(.path == $p) | .sha256 // empty' "$manifest_tmp" | head -n 1)"
    if [ -n "$manifest_runtime_url" ]; then
      runtime_url="$manifest_runtime_url"
    fi
    if [ -n "$manifest_runtime_sha" ]; then
      expected_runtime_sha="$manifest_runtime_sha"
    fi
  fi

  auth_curl "$runtime_url" -o "$runtime_tmp"

  if [ -n "$expected_runtime_sha" ]; then
    actual_runtime_sha="$(sha256_file "$runtime_tmp")"
    if [ "$actual_runtime_sha" != "$expected_runtime_sha" ]; then
      echo "Checksum mismatch for downloaded ${runtime_file}" >&2
      exit 1
    fi
  else
    echo "Warning: no checksum provided for ${runtime_file}; syncing without checksum verification." >&2
  fi

  mkdir -p "$(dirname "$runtime_target")"
  backup_if_exists "$runtime_target"
  mv "$runtime_tmp" "$runtime_target"
  chmod +x "$runtime_target"
  synced_files+=("- ${runtime_file}")
done

echo "Installed ${SKILL_NAME} to ${TARGET_DIR}"
echo "Synced files:"
for file in "${synced_files[@]}"; do
  echo "$file"
done
