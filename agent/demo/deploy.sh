#!/bin/bash
# Deploy Demo Agent to LiveKit Cloud
set -e

echo "🚀 Deploying Demo Agent to LiveKit Cloud..."
echo "Using LiveKit demo agent name: ${LIVEKIT_DEMO_AGENT_NAME:-not set}"

# Deploy from parent directory (agent/) with demo-specific Dockerfile
# This allows the Dockerfile to access both shared/ and demo/ directories
cd "$(dirname "$0")/.."  # Go to agent/ directory

tmp_dockerfile="$(mktemp)"
cp Dockerfile "$tmp_dockerfile"
restore_dockerfile() {
  cp "$tmp_dockerfile" Dockerfile
  rm -f "$tmp_dockerfile"
}
trap restore_dockerfile EXIT

cp demo/Dockerfile Dockerfile
lk --config demo/livekit.toml agent deploy .

echo "✅ Demo Agent deployed successfully!"
echo "Agent name: ${LIVEKIT_DEMO_AGENT_NAME:-set in LiveKit Cloud secrets}"
