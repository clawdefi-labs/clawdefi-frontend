#!/usr/bin/env bash
set -euo pipefail

SKILL_NAME="${SKILL_NAME:-clawdefi-agent}"
SKILLS_BASE_URL="${SKILLS_BASE_URL:-https://www.clawdefi.ai/skills}"
MANIFEST_URL="${MANIFEST_URL:-${SKILLS_BASE_URL}/${SKILL_NAME}/manifest.json}"
SKILLS_AUTH_TOKEN="${SKILLS_AUTH_TOKEN:-}"
TARGET_ROOT="${TARGET_ROOT:-$HOME/.openclaw/skills}"
TARGET_DIR="${TARGET_ROOT}/${SKILL_NAME}"
TARGET_FILE="${TARGET_DIR}/SKILL.md"
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
  "scripts/simulate-transaction.js"
  "scripts/swap-1inch.js"
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

hash_file() {
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

if ! command -v jq >/dev/null 2>&1; then
  echo "jq is required for manifest parsing" >&2
  exit 1
fi

mkdir -p "$TARGET_DIR" "$TARGET_DIR/scripts"

tmp_dir="$(mktemp -d)"
manifest_tmp="${tmp_dir}/manifest.json"
skill_tmp="${tmp_dir}/SKILL.md"
trap 'rm -rf "$tmp_dir"' EXIT

auth_curl "$MANIFEST_URL" -o "$manifest_tmp"

remote_version="$(jq -r '.version' "$manifest_tmp")"
remote_skill_url="$(jq -r '.skill_url' "$manifest_tmp")"
remote_sha256="$(jq -r '.sha256' "$manifest_tmp")"

if [ -z "$remote_version" ] || [ "$remote_version" = "null" ] || [ -z "$remote_skill_url" ] || [ "$remote_skill_url" = "null" ] || [ -z "$remote_sha256" ] || [ "$remote_sha256" = "null" ]; then
  echo "Manifest is missing required fields (version, skill_url, sha256)" >&2
  exit 1
fi

auth_curl "$remote_skill_url" -o "$skill_tmp"

actual_sha256="$(hash_file "$skill_tmp")"

if [ "$actual_sha256" != "$remote_sha256" ]; then
  echo "Checksum mismatch for downloaded SKILL.md" >&2
  exit 1
fi

skill_changed=1
if [ -f "$TARGET_FILE" ]; then
  local_sha256="$(hash_file "$TARGET_FILE")"
  if [ "$local_sha256" = "$remote_sha256" ]; then
    skill_changed=0
  fi
fi

if [ "$skill_changed" -eq 1 ]; then
  backup_if_exists "$TARGET_FILE"
  mv "$skill_tmp" "$TARGET_FILE"
  skill_status="updated"
else
  rm -f "$skill_tmp"
  skill_status="unchanged"
fi

runtime_changed_any=0
runtime_results=()

for runtime_file in "${RUNTIME_FILES[@]}"; do
  runtime_tmp="${tmp_dir}/$(basename "$runtime_file")"
  runtime_target="${TARGET_DIR}/${runtime_file}"
  runtime_url="$(jq -r --arg p "$runtime_file" '.files[]? | select(.path == $p) | .url // empty' "$manifest_tmp" | head -n 1)"
  runtime_sha256="$(jq -r --arg p "$runtime_file" '.files[]? | select(.path == $p) | .sha256 // empty' "$manifest_tmp" | head -n 1)"

  if [ -z "$runtime_url" ]; then
    runtime_url="$(dirname "$remote_skill_url")/${runtime_file}"
  fi

  auth_curl "$runtime_url" -o "$runtime_tmp"
  downloaded_runtime_sha256="$(hash_file "$runtime_tmp")"

  if [ -n "$runtime_sha256" ]; then
    if [ "$downloaded_runtime_sha256" != "$runtime_sha256" ]; then
      echo "Checksum mismatch for downloaded ${runtime_file}" >&2
      exit 1
    fi
  else
    echo "Warning: no checksum provided for ${runtime_file}; syncing without checksum verification." >&2
  fi

  runtime_changed=0
  if [ -f "$runtime_target" ]; then
    local_runtime_sha256="$(hash_file "$runtime_target")"
    if [ "$local_runtime_sha256" != "$downloaded_runtime_sha256" ]; then
      runtime_changed=1
    fi
  else
    runtime_changed=1
  fi

  if [ "$runtime_changed" -eq 1 ]; then
    mkdir -p "$(dirname "$runtime_target")"
    backup_if_exists "$runtime_target"
    mv "$runtime_tmp" "$runtime_target"
    chmod +x "$runtime_target"
    runtime_changed_any=1
    runtime_results+=("${runtime_file}=updated")
  else
    rm -f "$runtime_tmp"
    runtime_results+=("${runtime_file}=unchanged")
  fi
done

if [ "$skill_changed" -eq 0 ] && [ "$runtime_changed_any" -eq 0 ]; then
  echo "${SKILL_NAME} is already up to date (${remote_version})"
  exit 0
fi

echo "$remote_version" > "${TARGET_DIR}/.installed-version"

echo "Update result for ${SKILL_NAME} (${remote_version}): SKILL.md=${skill_status}"
for runtime_result in "${runtime_results[@]}"; do
  echo "- ${runtime_result}"
done
