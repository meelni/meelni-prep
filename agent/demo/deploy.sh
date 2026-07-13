#!/bin/bash
set -euo pipefail

environment="${1:-}"
case "$environment" in
  preview)
    config_path="${MEELNI_LIVEKIT_PREVIEW_DEMO_CONFIG:-}"
    expected_agent_id="${MEELNI_LIVEKIT_PREVIEW_DEMO_AGENT_ID:-}"
    ;;
  production)
    config_path="${MEELNI_LIVEKIT_PRODUCTION_DEMO_CONFIG:-}"
    expected_agent_id="${MEELNI_LIVEKIT_PRODUCTION_DEMO_AGENT_ID:-}"
    ;;
  *) echo "Usage: ./deploy.sh preview|production" >&2; exit 1 ;;
esac

if [[ -z "$config_path" ]] || \
  ! config_path="$(realpath "$config_path" 2>/dev/null)" || \
  [[ ! -f "$config_path" ]]; then
  echo "LiveKit deploy config must resolve to a file." >&2
  exit 1
fi

script_dir="$(cd "$(dirname "$0")" && pwd)"
agent_dir="$(cd "$script_dir/.." && pwd)"
config_argument="$(python3 "$agent_dir/shared/validate_livekit_deploy.py" \
  "$environment" "demo" "$config_path" \
  "${MEELNI_PRODUCTION_LIVEKIT_URL:-}" \
  "${MEELNI_PREVIEW_LIVEKIT_URL:-}" "$expected_agent_id")"

if [[ "$environment" == "production" ]]; then
  repo_root="$(cd "$agent_dir/.." && pwd)"
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
    --configuration-file "$config_path" \
    --target-material "livekit:production:demo:${MEELNI_PRODUCTION_LIVEKIT_URL:-}:$expected_agent_id"
fi

cd "$agent_dir"

tmp_dockerfile="$(mktemp)"
cp Dockerfile "$tmp_dockerfile"
restore_dockerfile() {
  cp "$tmp_dockerfile" Dockerfile
  rm -f "$tmp_dockerfile"
}
trap restore_dockerfile EXIT

cp demo/Dockerfile Dockerfile
lk --config "$config_argument" agent deploy .
