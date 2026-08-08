#!/bin/bash
set -euo pipefail
umask 077

readonly canonical_project_host="meelni-preview-gui1i7s9.livekit.cloud"
readonly canonical_agent_id="CA_ovn67QQ7ywmJ"
readonly canonical_interview_name="meelni-preview-interview"
readonly canonical_demo_name="meelni-preview-demo"

config_path="${MEELNI_LIVEKIT_PREVIEW_RUNTIME_CONFIG:-}"
secrets_path="${MEELNI_LIVEKIT_PREVIEW_RUNTIME_SECRETS_FILE:-}"
expected_agent_id="${MEELNI_LIVEKIT_PREVIEW_RUNTIME_AGENT_ID:-}"
target_url="${MEELNI_PREVIEW_LIVEKIT_URL:-}"
candidate_sha="${MEELNI_LIVEKIT_PREVIEW_SOURCE_SHA:-}"

script_dir="$(cd "$(dirname "$0")" && pwd)"
agent_dir="$(cd "$script_dir/.." && pwd)"
repo_root="$(cd "$agent_dir/.." && pwd)"

if [[ -z "$config_path" ]] || \
  [[ -L "$config_path" ]] || \
  ! config_path="$(realpath "$config_path" 2>/dev/null)" || \
  [[ ! -f "$config_path" ]] || \
  [[ -z "$secrets_path" ]] || \
  [[ -L "$secrets_path" ]] || \
  ! secrets_path="$(realpath "$secrets_path" 2>/dev/null)" || \
  [[ ! -f "$secrets_path" ]] || \
  [[ "$secrets_path" == "$repo_root" ]] || \
  [[ "$secrets_path" == "$repo_root/"* ]]; then
  echo "Preview LiveKit deploy requires exact config and external runtime secrets files." >&2
  exit 1
fi

secrets_mode=""
secrets_owner_uid=""
read -r secrets_mode _ secrets_owner_uid _ < <(/bin/ls -dn "$secrets_path" 2>/dev/null || true)
if [[ "$secrets_owner_uid" != "$(/usr/bin/id -u)" ]] || \
  [[ "${secrets_mode:4:6}" != "------" ]]; then
  echo "Preview LiveKit runtime secrets must be owner-only." >&2
  exit 1
fi

canonical_subdomain="${canonical_project_host%.livekit.cloud}"
if [[ "$target_url" != "wss://$canonical_project_host" ]] || \
  [[ "$expected_agent_id" != "$canonical_agent_id" ]] || \
  [[ ! "$candidate_sha" =~ ^[a-f0-9]{40}$ ]] || \
  [[ "$(git -C "$repo_root" rev-parse HEAD)" != "$candidate_sha" ]] || \
  [[ -n "$(git -C "$repo_root" status --porcelain --untracked-files=all)" ]]; then
  echo "Preview LiveKit deployment identity must match a clean, committed candidate." >&2
  exit 1
fi

if ! /usr/bin/awk \
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
  ' "$config_path"; then
  echo "LiveKit deployment identity does not match the canonical Preview runtime target." >&2
  exit 1
fi

if ! /usr/bin/awk \
  -v expected_interview="$canonical_interview_name" \
  -v expected_demo="$canonical_demo_name" '
    function remember(name, value) {
      if (seen[name]++) invalid = 1
      values[name] = value
    }
    /^[A-Z][A-Z0-9_]*=/ {
      name = $0
      sub(/=.*/, "", name)
      value = substr($0, length(name) + 2)
      if (!(name in allowed) || length(value) == 0) invalid = 1
      remember(name, value)
      next
    }
    { invalid = 1 }
    BEGIN {
      allowed["MEELNI_RUNTIME_ENVIRONMENT"] = 1
      allowed["LIVEKIT_INTERVIEW_AGENT_NAME"] = 1
      allowed["LIVEKIT_DEMO_AGENT_NAME"] = 1
      allowed["OPENAI_API_KEY"] = 1
      allowed["MEELNI_INTERVIEW_STT_MODEL"] = 1
      allowed["MEELNI_INTERVIEW_LLM_MODEL"] = 1
      allowed["MEELNI_INTERVIEW_TTS_MODEL"] = 1
      allowed["MEELNI_INTERVIEW_VOICE"] = 1
      allowed["MEELNI_INTERVIEW_TTS_SPEED"] = 1
      allowed["MEELNI_INTERVIEW_TTS_EMOTION"] = 1
      allowed["MEELNI_INTERVIEW_TTS_VOLUME"] = 1
    }
    END {
      speed = values["MEELNI_INTERVIEW_TTS_SPEED"] + 0
      volume = values["MEELNI_INTERVIEW_TTS_VOLUME"] + 0
      exit !(NR == 11 && invalid != 1 &&
        values["MEELNI_RUNTIME_ENVIRONMENT"] == "preview" &&
        values["LIVEKIT_INTERVIEW_AGENT_NAME"] == expected_interview &&
        values["LIVEKIT_DEMO_AGENT_NAME"] == expected_demo &&
        values["OPENAI_API_KEY"] ~ /^sk-[A-Za-z0-9_-]{20,}$/ &&
        length(values["MEELNI_INTERVIEW_STT_MODEL"]) <= 255 &&
        length(values["MEELNI_INTERVIEW_LLM_MODEL"]) <= 255 &&
        length(values["MEELNI_INTERVIEW_TTS_MODEL"]) <= 255 &&
        length(values["MEELNI_INTERVIEW_VOICE"]) <= 255 &&
        values["MEELNI_INTERVIEW_TTS_SPEED"] ~ /^[+]?[0-9]+([.][0-9]+)?$/ &&
        speed >= 0.6 && speed <= 1.5 &&
        length(values["MEELNI_INTERVIEW_TTS_EMOTION"]) <= 255 &&
        values["MEELNI_INTERVIEW_TTS_VOLUME"] ~ /^[+]?[0-9]+([.][0-9]+)?$/ &&
        volume >= 0.5 && volume <= 2)
    }
  ' "$secrets_path"; then
  echo "Preview LiveKit runtime secrets file is invalid." >&2
  exit 1
fi

if ! lk_path="$(command -v lk 2>/dev/null)" || \
  ! lk_path="$(realpath "$lk_path" 2>/dev/null)" || \
  [[ ! -f "$lk_path" ]] || \
  [[ ! -x "$lk_path" ]]; then
  echo "Preview LiveKit deploy requires an installed LiveKit CLI." >&2
  exit 1
fi

snapshot_dir="$(mktemp -d)"
trap 'rm -rf "$snapshot_dir"' EXIT
source_dir="$snapshot_dir/source"
mkdir "$source_dir"
cp "$config_path" "$snapshot_dir/livekit.toml"
cp "$secrets_path" "$snapshot_dir/preview-runtime.env"
cp "$script_dir/Dockerfile" "$source_dir/Dockerfile"
cp "$script_dir/.dockerignore" "$source_dir/.dockerignore"
cp "$agent_dir/requirements.txt" "$source_dir/requirements.txt"
cp -R "$agent_dir/shared" "$source_dir/shared"
cp -R "$agent_dir/interview" "$source_dir/interview"
cp -R "$agent_dir/demo" "$source_dir/demo"
mkdir "$source_dir/preview"
cp "$script_dir/supervisor.py" "$source_dir/preview/supervisor.py"
find "$source_dir" -type d -name __pycache__ -prune -exec rm -rf {} +
chmod 600 "$snapshot_dir/livekit.toml" "$snapshot_dir/preview-runtime.env"

cd "$source_dir"
"$lk_path" --config ../livekit.toml agent deploy \
  --no-default-attributes \
  --attribute "meelni.source_sha=$candidate_sha" \
  --attribute "meelni.runtime_topology=preview-single-deployment" \
  --secrets-file ../preview-runtime.env \
  .
