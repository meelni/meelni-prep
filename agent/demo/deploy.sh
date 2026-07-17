#!/bin/bash
set -euo pipefail

environment="${1:-}"
case "$environment" in
  preview)
    config_path="${MEELNI_LIVEKIT_PREVIEW_DEMO_CONFIG:-}"
    expected_agent_id="${MEELNI_LIVEKIT_PREVIEW_DEMO_AGENT_ID:-}"
    target_url="${MEELNI_PREVIEW_LIVEKIT_URL:-}"
    canonical_project_host="meelni-preview-dk7443ua.livekit.cloud"
    canonical_agent_id=""
    ;;
  production)
    config_path="${MEELNI_LIVEKIT_PRODUCTION_DEMO_CONFIG:-}"
    expected_agent_id="${MEELNI_LIVEKIT_PRODUCTION_DEMO_AGENT_ID:-}"
    target_url="${MEELNI_PRODUCTION_LIVEKIT_URL:-}"
    canonical_project_host="meelni-ek4vaisp.livekit.cloud"
    canonical_agent_id="CA_t3sKQEihMQ7x"
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
snapshot_dir="$(mktemp -d)"
config_snapshot="$snapshot_dir/livekit.toml"
cp "$config_path" "$config_snapshot"
chmod 600 "$config_snapshot"
tmp_dockerfile=""
cleanup() {
  if [[ -n "$tmp_dockerfile" ]]; then
    if [[ -f "$tmp_dockerfile" ]]; then
      cp "$tmp_dockerfile" "$agent_dir/Dockerfile"
    fi
    rm -f "$tmp_dockerfile"
  fi
  rm -rf "$snapshot_dir"
}
trap cleanup EXIT

if [[ -z "$canonical_agent_id" ]]; then
  echo "The canonical Preview demo deployment identity has not been provisioned." >&2
  exit 1
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
  echo "LiveKit deployment identity does not match the canonical $environment demo target." >&2
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
    --action livekit-production-demo-deploy \
    --provider livekit \
    --configuration-file "$config_snapshot" \
    --target-material "livekit:production:demo:$target_url:$expected_agent_id"
fi

config_argument="$(/usr/bin/python3 -c 'import os, sys; print(os.path.relpath(sys.argv[1], sys.argv[2]))' "$config_snapshot" "$agent_dir")"
cd "$agent_dir"

tmp_dockerfile="$(mktemp)"
cp Dockerfile "$tmp_dockerfile"

cp demo/Dockerfile Dockerfile
lk --config "$config_argument" agent deploy .
