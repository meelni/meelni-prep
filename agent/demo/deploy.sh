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
python3 "$agent_dir/shared/validate_livekit_deploy.py" \
  "$environment" "demo" "$config_path" \
  "${MEELNI_PRODUCTION_LIVEKIT_URL:-}" \
  "${MEELNI_PREVIEW_LIVEKIT_URL:-}" "$expected_agent_id"

cd "$agent_dir"

tmp_dockerfile="$(mktemp)"
cp Dockerfile "$tmp_dockerfile"
restore_dockerfile() {
  cp "$tmp_dockerfile" Dockerfile
  rm -f "$tmp_dockerfile"
}
trap restore_dockerfile EXIT

cp demo/Dockerfile Dockerfile
lk --config "$config_path" agent deploy .
