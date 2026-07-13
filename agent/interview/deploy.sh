#!/bin/bash
set -euo pipefail

environment="${1:-}"
case "$environment" in
  preview)
    config_path="${MEELNI_LIVEKIT_PREVIEW_INTERVIEW_CONFIG:-}"
    expected_agent_id="${MEELNI_LIVEKIT_PREVIEW_INTERVIEW_AGENT_ID:-}"
    ;;
  production)
    config_path="${MEELNI_LIVEKIT_PRODUCTION_INTERVIEW_CONFIG:-}"
    expected_agent_id="${MEELNI_LIVEKIT_PRODUCTION_INTERVIEW_AGENT_ID:-}"
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
  "$environment" "interview" "$config_path" \
  "${MEELNI_PRODUCTION_LIVEKIT_URL:-}" \
  "${MEELNI_PREVIEW_LIVEKIT_URL:-}" "$expected_agent_id"

cd "$agent_dir"
lk --config "$config_path" agent deploy .
