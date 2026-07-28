#!/bin/bash
set -euo pipefail

environment="${1:-}"
secrets_path=""
case "$environment" in
  preview)
    config_path="${MEELNI_LIVEKIT_PREVIEW_INTERVIEW_CONFIG:-}"
    expected_agent_id="${MEELNI_LIVEKIT_PREVIEW_INTERVIEW_AGENT_ID:-}"
    target_url="${MEELNI_PREVIEW_LIVEKIT_URL:-}"
    canonical_project_host="meelni-preview-dk7443ua.livekit.cloud"
    canonical_agent_id="CA_ZbGxFjfEYwsD"
    ;;
  production)
    config_path="${MEELNI_LIVEKIT_PRODUCTION_INTERVIEW_CONFIG:-}"
    secrets_path="${MEELNI_LIVEKIT_PRODUCTION_INTERVIEW_SECRETS_FILE:-}"
    expected_agent_id="${MEELNI_LIVEKIT_PRODUCTION_INTERVIEW_AGENT_ID:-}"
    target_url="${MEELNI_PRODUCTION_LIVEKIT_URL:-}"
    canonical_project_host="meelni-ek4vaisp.livekit.cloud"
    canonical_agent_id="CA_yawKG67rCMG4"
    ;;
  *) echo "Usage: ./deploy.sh preview|production" >&2; exit 1 ;;
esac

if [[ -z "$config_path" ]] || \
  [[ -L "$config_path" ]] || \
  ! config_path="$(realpath "$config_path" 2>/dev/null)" || \
  [[ ! -f "$config_path" ]] || \
  [[ -z "$expected_agent_id" ]] || \
  [[ -z "$target_url" ]]; then
  echo "LiveKit deploy requires an exact config, target URL, and agent ID." >&2
  exit 1
fi

script_dir="$(cd "$(dirname "$0")" && pwd)"
agent_dir="$(cd "$script_dir/.." && pwd)"
repo_root="$(cd "$agent_dir/.." && pwd)"

if [[ "$environment" == "production" ]]; then
  if [[ -z "$secrets_path" ]] || \
    [[ -L "$secrets_path" ]] || \
    ! secrets_path="$(realpath "$secrets_path" 2>/dev/null)" || \
    [[ ! -f "$secrets_path" ]] || \
    [[ "$secrets_path" == "$repo_root" ]] || \
    [[ "$secrets_path" == "$repo_root/"* ]]; then
    echo "Production LiveKit deploy requires an external transcript-ingest secrets file." >&2
    exit 1
  fi
  secrets_mode=""
  secrets_owner_uid=""
  read -r secrets_mode _ secrets_owner_uid _ < <(/bin/ls -dn "$secrets_path" 2>/dev/null || true)
  if [[ "$secrets_owner_uid" != "$(/usr/bin/id -u)" ]] || \
    [[ "${secrets_mode:4:6}" != "------" ]]; then
    echo "Production LiveKit transcript-ingest secrets must be owner-only." >&2
    exit 1
  fi
fi

snapshot_dir="$(mktemp -d)"
trap 'rm -rf "$snapshot_dir"' EXIT
config_snapshot="$snapshot_dir/livekit.toml"
cp "$config_path" "$config_snapshot"
chmod 600 "$config_snapshot"
secrets_snapshot=""

if [[ "$environment" == "production" ]]; then
  secrets_snapshot="$snapshot_dir/interview-secrets.env"
  cp "$secrets_path" "$secrets_snapshot"
  chmod 600 "$secrets_snapshot"
  if ! /usr/bin/awk '
      NR == 1 && $0 ~ /^MEELNI_TRANSCRIPT_INGEST_SECRET=[A-Za-z0-9_-]+$/ {
        value = $0
        sub(/^MEELNI_TRANSCRIPT_INGEST_SECRET=/, "", value)
        valid = length(value) >= 32
      }
      END { exit !(NR == 1 && valid) }
    ' "$secrets_snapshot"; then
    echo "Production LiveKit secrets file must contain only the transcript-ingest secret." >&2
    exit 1
  fi
fi

canonical_subdomain="${canonical_project_host%.livekit.cloud}"
if [[ "$target_url" != "wss://$canonical_project_host" ]] || \
  [[ "$expected_agent_id" != "$canonical_agent_id" ]] || \
  ! /usr/bin/awk \
    -v expected_subdomain="$canonical_subdomain" \
    -v expected_agent_id="$canonical_agent_id" '
      /^[[:space:]]*\[[^]]+\][[:space:]]*$/ {
        section=$0
        gsub(/[[:space:]\[\]]/, "", section)
        next
      }
      section == "project" && $0 ~ /^[[:space:]]*subdomain[[:space:]]*=/ {
        project_count += 1
        line = $0
        if (line !~ /^[[:space:]]*subdomain[[:space:]]*=[[:space:]]*"[^"]+"[[:space:]]*$/) invalid = 1
        sub(/^[[:space:]]*subdomain[[:space:]]*=[[:space:]]*"/, "", line)
        sub(/"[[:space:]]*$/, "", line)
        project_value = line
      }
      section == "agent" && $0 ~ /^[[:space:]]*id[[:space:]]*=/ {
        agent_count += 1
        line = $0
        if (line !~ /^[[:space:]]*id[[:space:]]*=[[:space:]]*"[^"]+"[[:space:]]*$/) invalid = 1
        sub(/^[[:space:]]*id[[:space:]]*=[[:space:]]*"/, "", line)
        sub(/"[[:space:]]*$/, "", line)
        agent_value = line
      }
      END {
        exit !(invalid != 1 && project_count == 1 && agent_count == 1 &&
          project_value == expected_subdomain && agent_value == expected_agent_id)
      }
    ' "$config_snapshot"; then
  echo "LiveKit deployment identity does not match the canonical $environment interview target." >&2
  exit 1
fi

if [[ "$environment" == "production" ]]; then
  readonly production_node="/usr/local/bin/node"
  node_mode=""
  node_owner_uid=""
  read -r node_mode _ node_owner_uid _ < <(/bin/ls -dn "$production_node" 2>/dev/null || true)
  if [[ ! -f "$production_node" ]] || \
    [[ -L "$production_node" ]] || \
    [[ ! -x "$production_node" ]] || \
    [[ "$node_owner_uid" != "0" ]] || \
    [[ "${node_mode:5:1}" == "w" ]] || \
    [[ "${node_mode:8:1}" == "w" ]]; then
    echo "Production authorization requires the fixed system Node runtime at /usr/local/bin/node." >&2
    exit 1
  fi
  /usr/bin/env -u NODE_OPTIONS -u NODE_PATH \
    "$production_node" "$repo_root/scripts/consume-production-action-authorization.mjs" \
    --action livekit-production-interview-deploy \
    --provider livekit \
    --configuration-file "$config_snapshot" \
    --target-material "livekit:production:interview:$target_url:$expected_agent_id:transcript-secret-sha256:$(/usr/bin/shasum -a 256 "$secrets_snapshot" | /usr/bin/awk '{print $1}')"
fi

config_argument="$(/usr/bin/python3 -c 'import os, sys; print(os.path.relpath(sys.argv[1], sys.argv[2]))' "$config_snapshot" "$agent_dir")"
cd "$agent_dir"
if [[ "$environment" == "production" ]]; then
  secrets_argument="$(/usr/bin/python3 -c 'import os, sys; print(os.path.relpath(sys.argv[1], sys.argv[2]))' "$secrets_snapshot" "$agent_dir")"
  lk --config "$config_argument" agent deploy --secrets-file "$secrets_argument" .
else
  lk --config "$config_argument" agent deploy .
fi
