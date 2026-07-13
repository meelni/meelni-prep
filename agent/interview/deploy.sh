#!/bin/bash
set -euo pipefail

environment="${1:-}"
case "$environment" in
  preview) config_path="${MEELNI_LIVEKIT_PREVIEW_INTERVIEW_CONFIG:-}" ;;
  production) config_path="${MEELNI_LIVEKIT_PRODUCTION_INTERVIEW_CONFIG:-}" ;;
  *) echo "Usage: ./deploy.sh preview|production" >&2; exit 1 ;;
esac

script_dir="$(cd "$(dirname "$0")" && pwd)"
agent_dir="$(cd "$script_dir/.." && pwd)"
python3 "$agent_dir/shared/validate_livekit_deploy.py" \
  "$environment" "$config_path" "${MEELNI_PRODUCTION_LIVEKIT_URL:-}"

cd "$agent_dir"
lk --config "$config_path" agent deploy .
