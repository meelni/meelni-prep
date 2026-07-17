#!/bin/bash
set -euo pipefail

environment="${1:-}"
case "$environment" in
  preview)
    config_path="${MEELNI_LIVEKIT_PREVIEW_DEMO_CONFIG:-}"
    expected_agent_id="${MEELNI_LIVEKIT_PREVIEW_DEMO_AGENT_ID:-}"
    target_url="${MEELNI_PREVIEW_LIVEKIT_URL:-}"
    ;;
  production)
    config_path="${MEELNI_LIVEKIT_PRODUCTION_DEMO_CONFIG:-}"
    expected_agent_id="${MEELNI_LIVEKIT_PRODUCTION_DEMO_AGENT_ID:-}"
    target_url="${MEELNI_PRODUCTION_LIVEKIT_URL:-}"
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
