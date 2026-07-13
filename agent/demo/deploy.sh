#!/bin/bash
set -euo pipefail

environment="${1:-}"
case "$environment" in
  preview) config_path="${MEELNI_LIVEKIT_PREVIEW_DEMO_CONFIG:-}" ;;
  production) config_path="${MEELNI_LIVEKIT_PRODUCTION_DEMO_CONFIG:-}" ;;
  *) echo "Usage: ./deploy.sh preview|production" >&2; exit 1 ;;
esac

script_dir="$(cd "$(dirname "$0")" && pwd)"
agent_dir="$(cd "$script_dir/.." && pwd)"
python3 "$agent_dir/shared/validate_livekit_deploy.py" \
  "$environment" "$config_path" "${MEELNI_PRODUCTION_LIVEKIT_URL:-}"

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
