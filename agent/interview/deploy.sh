#!/bin/bash
set -euo pipefail
umask 077

environment="${1:-}"
secrets_path=""
lk_path=""
candidate_sha=""
preview_shadow_deploy="false"
case "$environment" in
  preview)
    config_path="${MEELNI_LIVEKIT_PREVIEW_INTERVIEW_CONFIG:-}"
    expected_agent_id="${MEELNI_LIVEKIT_PREVIEW_INTERVIEW_AGENT_ID:-}"
    target_url="${MEELNI_PREVIEW_LIVEKIT_URL:-}"
    canonical_project_host="meelni-preview-dk7443ua.livekit.cloud"
    canonical_agent_id="CA_ZbGxFjfEYwsD"
    ;;
  preview-shadow)
    config_path="${MEELNI_LIVEKIT_PREVIEW_INTERVIEW_CONFIG:-}"
    secrets_path="${MEELNI_LIVEKIT_PREVIEW_SHADOW_SECRETS_FILE:-}"
    expected_agent_id="${MEELNI_LIVEKIT_PREVIEW_INTERVIEW_AGENT_ID:-}"
    target_url="${MEELNI_PREVIEW_LIVEKIT_URL:-}"
    candidate_sha="${MEELNI_PREVIEW_SHADOW_CANDIDATE_SHA:-}"
    canonical_project_host="meelni-preview-dk7443ua.livekit.cloud"
    canonical_agent_id="CA_ZbGxFjfEYwsD"
    preview_shadow_deploy="true"
    ;;
  production)
    config_path="${MEELNI_LIVEKIT_PRODUCTION_INTERVIEW_CONFIG:-}"
    secrets_path="${MEELNI_LIVEKIT_PRODUCTION_INTERVIEW_SECRETS_FILE:-}"
    expected_agent_id="${MEELNI_LIVEKIT_PRODUCTION_INTERVIEW_AGENT_ID:-}"
    target_url="${MEELNI_PRODUCTION_LIVEKIT_URL:-}"
    canonical_project_host="meelni-ek4vaisp.livekit.cloud"
    canonical_agent_id="CA_yawKG67rCMG4"
    ;;
  *) echo "Usage: ./deploy.sh preview|preview-shadow|production" >&2; exit 1 ;;
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

if [[ "$environment" == "production" || "$preview_shadow_deploy" == "true" ]]; then
  if [[ -z "$secrets_path" ]] || \
    [[ -L "$secrets_path" ]] || \
    ! secrets_path="$(realpath "$secrets_path" 2>/dev/null)" || \
    [[ ! -f "$secrets_path" ]] || \
    [[ "$secrets_path" == "$repo_root" ]] || \
    [[ "$secrets_path" == "$repo_root/"* ]]; then
    echo "$environment LiveKit deploy requires an external runtime secrets file." >&2
    exit 1
  fi
  secrets_mode=""
  secrets_owner_uid=""
  read -r secrets_mode _ secrets_owner_uid _ < <(/bin/ls -dn "$secrets_path" 2>/dev/null || true)
  if [[ "$secrets_owner_uid" != "$(/usr/bin/id -u)" ]] || \
    [[ "${secrets_mode:4:6}" != "------" ]]; then
    echo "$environment LiveKit runtime secrets must be owner-only." >&2
    exit 1
  fi
fi

snapshot_dir="$(mktemp -d)"
trap 'rm -rf "$snapshot_dir"' EXIT
config_snapshot="$snapshot_dir/livekit.toml"
cp "$config_path" "$config_snapshot"
chmod 600 "$config_snapshot"
secrets_snapshot=""

if [[ "$environment" == "production" || "$preview_shadow_deploy" == "true" ]]; then
  secrets_snapshot="$snapshot_dir/interview-secrets.env"
  cp "$secrets_path" "$secrets_snapshot"
  chmod 600 "$secrets_snapshot"
fi

if [[ "$environment" == "production" ]]; then
  if ! /usr/bin/awk '
      function remember(name, value) {
        if (seen[name]++) invalid = 1
        values[name] = value
      }
      $0 ~ /^MEELNI_TRANSCRIPT_INGEST_SECRET=[A-Za-z0-9_-]+$/ {
        value = $0
        sub(/^MEELNI_TRANSCRIPT_INGEST_SECRET=/, "", value)
        remember("MEELNI_TRANSCRIPT_INGEST_SECRET", value)
        next
      }
      $0 ~ /^OPIK_TRACING_ENABLED=true$/ { remember("OPIK_TRACING_ENABLED", "true"); next }
      $0 ~ /^OPIK_API_KEY=[A-Za-z0-9._-]+$/ {
        value = $0
        sub(/^OPIK_API_KEY=/, "", value)
        remember("OPIK_API_KEY", value)
        next
      }
      $0 ~ /^OPIK_WORKSPACE=savi-singh$/ { remember("OPIK_WORKSPACE", "savi-singh"); next }
      $0 ~ /^OPIK_PROJECT_NAME=meelni$/ { remember("OPIK_PROJECT_NAME", "meelni"); next }
      $0 ~ /^OPIK_CAPTURE_CONTENT=true$/ { remember("OPIK_CAPTURE_CONTENT", "true"); next }
      { invalid = 1 }
      END {
        exit !(NR == 6 && invalid != 1 &&
          length(values["MEELNI_TRANSCRIPT_INGEST_SECRET"]) >= 32 &&
          length(values["OPIK_API_KEY"]) >= 20 &&
          length(values["OPIK_API_KEY"]) <= 4096 &&
          values["OPIK_TRACING_ENABLED"] == "true" &&
          values["OPIK_WORKSPACE"] == "savi-singh" &&
          values["OPIK_PROJECT_NAME"] == "meelni" &&
          values["OPIK_CAPTURE_CONTENT"] == "true")
      }
    ' "$secrets_snapshot"; then
    echo "Production LiveKit runtime secrets file is invalid." >&2
    exit 1
  fi
fi

if [[ "$preview_shadow_deploy" == "true" ]]; then
  if [[ ! "$candidate_sha" =~ ^[a-f0-9]{40}$ ]] || \
    [[ "$(/usr/bin/git -C "$repo_root" rev-parse HEAD 2>/dev/null || true)" != "$candidate_sha" ]]; then
    echo "Preview-shadow LiveKit source identity is invalid." >&2
    exit 1
  fi
  preview_shadow_control_plane_url="${MEELNI_PREVIEW_SHADOW_CONTROL_PLANE_URL:-}"
  if [[ ! "$preview_shadow_control_plane_url" =~ ^https://meelni-[a-z0-9]+-meelni\.vercel\.app/api/internal/preview-shadow$ ]]; then
    echo "Preview-shadow control-plane identity is invalid." >&2
    exit 1
  fi
  if ! /usr/bin/awk \
    -v candidate_sha="$candidate_sha" \
    -v control_plane_url="$preview_shadow_control_plane_url" '
      function remember(name, value) {
        if (seen[name]++) invalid = 1
        values[name] = value
      }
      $0 == "MEELNI_PREVIEW_SHADOW_EXECUTION=enabled" {
        remember("MEELNI_PREVIEW_SHADOW_EXECUTION", "enabled"); next
      }
      $0 == "MEELNI_PREVIEW_SHADOW_KILL_SWITCH=open" {
        remember("MEELNI_PREVIEW_SHADOW_KILL_SWITCH", "open"); next
      }
      $0 ~ /^MEELNI_PREVIEW_SHADOW_RUN_ID=[a-f0-9]{64}$/ {
        value = $0
        sub(/^MEELNI_PREVIEW_SHADOW_RUN_ID=/, "", value)
        remember("MEELNI_PREVIEW_SHADOW_RUN_ID", value); next
      }
      $0 ~ /^MEELNI_PREVIEW_SHADOW_CANDIDATE_SHA=[a-f0-9]{40}$/ {
        value = $0
        sub(/^MEELNI_PREVIEW_SHADOW_CANDIDATE_SHA=/, "", value)
        remember("MEELNI_PREVIEW_SHADOW_CANDIDATE_SHA", value); next
      }
      $0 ~ /^MEELNI_PREVIEW_SHADOW_CONTROL_PLANE_URL=https:\/\/[A-Za-z0-9.-]+\/api\/internal\/preview-shadow$/ {
        value = $0
        sub(/^MEELNI_PREVIEW_SHADOW_CONTROL_PLANE_URL=/, "", value)
        remember("MEELNI_PREVIEW_SHADOW_CONTROL_PLANE_URL", value); next
      }
      { invalid = 1 }
      END {
        exit !(NR == 5 && invalid != 1 &&
          values["MEELNI_PREVIEW_SHADOW_EXECUTION"] == "enabled" &&
          values["MEELNI_PREVIEW_SHADOW_KILL_SWITCH"] == "open" &&
          length(values["MEELNI_PREVIEW_SHADOW_RUN_ID"]) == 64 &&
          values["MEELNI_PREVIEW_SHADOW_CANDIDATE_SHA"] == candidate_sha &&
          values["MEELNI_PREVIEW_SHADOW_CONTROL_PLANE_URL"] == control_plane_url)
      }
    ' "$secrets_snapshot"; then
    echo "Preview-shadow LiveKit runtime secrets file is invalid." >&2
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
fi

if [[ "$environment" == "production" || "$preview_shadow_deploy" == "true" ]]; then
  if ! lk_path="$(command -v lk 2>/dev/null)" || \
    ! lk_path="$(realpath "$lk_path" 2>/dev/null)" || \
    [[ ! -f "$lk_path" ]] || \
    [[ ! -x "$lk_path" ]]; then
    echo "$environment LiveKit deploy requires an installed LiveKit CLI." >&2
    exit 1
  fi
  if ! lk_deploy_help="$("$lk_path" agent deploy --help 2>&1)" || \
    [[ "$lk_deploy_help" != *"--no-default-attributes"* ]] || \
    [[ "$lk_deploy_help" != *"--attribute"* ]]; then
    echo "$environment LiveKit CLI must support explicit source attributes." >&2
    exit 1
  fi
  unset lk_deploy_help
fi

if [[ "$environment" == "production" ]]; then
  authorization_receipt="$snapshot_dir/authorization-receipt.json"
  /usr/bin/env -u NODE_OPTIONS -u NODE_PATH \
    "$production_node" "$repo_root/scripts/consume-production-action-authorization.mjs" \
    --action livekit-production-interview-deploy \
    --provider livekit \
    --configuration-file "$config_snapshot" \
    --target-material "livekit:production:interview:$target_url:$expected_agent_id:runtime-secrets-sha256:$(/usr/bin/shasum -a 256 "$secrets_snapshot" | /usr/bin/awk '{print $1}')" \
    > "$authorization_receipt"
  chmod 600 "$authorization_receipt"

  source_snapshot_dir="$snapshot_dir/source"
  candidate_sha="$(/usr/bin/env -u NODE_OPTIONS -u NODE_PATH \
    "$production_node" "$repo_root/scripts/prepare-livekit-production-deploy-source.mjs" \
    --receipt-file "$authorization_receipt" \
    --output-directory "$source_snapshot_dir")"
  if [[ ! "$candidate_sha" =~ ^[a-f0-9]{40}$ ]]; then
    echo "Production LiveKit deploy source identity is invalid." >&2
    exit 1
  fi
  deploy_agent_dir="$source_snapshot_dir/agent"
elif [[ "$preview_shadow_deploy" == "true" ]]; then
  if ! existing_secrets="$($lk_path --config "$config_snapshot" agent secrets --json 2>/dev/null)" || \
    ! /usr/bin/python3 -c '
import json, sys
value = json.load(sys.stdin)
def names(candidate):
    if isinstance(candidate, dict):
        for key, item in candidate.items():
            if key.lower() == "name" and isinstance(item, str):
                yield item
            yield from names(item)
    elif isinstance(candidate, list):
        for item in candidate:
            yield from names(item)
sys.exit(0 if "OPENAI_API_KEY" in set(names(value)) else 1)
' <<<"$existing_secrets"; then
    unset existing_secrets
    echo "Preview-shadow LiveKit deploy requires the existing OpenAI secret." >&2
    exit 1
  fi
  unset existing_secrets
  source_snapshot_dir="$snapshot_dir/source"
  mkdir -m 700 "$source_snapshot_dir"
  archive_path="$snapshot_dir/agent-source.tar"
  /usr/bin/git -C "$repo_root" archive \
    --format=tar \
    --output="$archive_path" \
    "$candidate_sha" \
    agent
  /usr/bin/tar -xf "$archive_path" -C "$source_snapshot_dir"
  deploy_agent_dir="$source_snapshot_dir/agent"
  if [[ ! -f "$deploy_agent_dir/Dockerfile" ]] || \
    [[ -L "$deploy_agent_dir/Dockerfile" ]] || \
    [[ ! -f "$deploy_agent_dir/interview/agent.py" ]] || \
    [[ -L "$deploy_agent_dir/interview/agent.py" ]]; then
    echo "Preview-shadow LiveKit source snapshot is invalid." >&2
    exit 1
  fi
else
  deploy_agent_dir="$agent_dir"
fi

config_argument="$(/usr/bin/python3 -c 'import os, sys; print(os.path.relpath(sys.argv[1], sys.argv[2]))' "$config_snapshot" "$deploy_agent_dir")"
cd "$deploy_agent_dir"
if [[ "$environment" == "production" || "$preview_shadow_deploy" == "true" ]]; then
  secrets_argument="$(/usr/bin/python3 -c 'import os, sys; print(os.path.relpath(sys.argv[1], sys.argv[2]))' "$secrets_snapshot" "$deploy_agent_dir")"
  "$lk_path" --config "$config_argument" agent deploy \
    --no-default-attributes \
    --attribute "meelni.source_sha=$candidate_sha" \
    --secrets-file "$secrets_argument" \
    .
else
  lk --config "$config_argument" agent deploy .
fi
