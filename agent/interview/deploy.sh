#!/bin/bash
# Deploy Main Interview Agent to LiveKit Cloud
set -e

echo "🚀 Deploying Main Interview Agent to LiveKit Cloud..."
echo "Using LiveKit interview agent name: ${LIVEKIT_INTERVIEW_AGENT_NAME:-not set}"

# Deploy from parent directory (agent/) with interview-specific Dockerfile
# This allows the Dockerfile to access both shared/ and interview/ directories
cd "$(dirname "$0")/.."  # Go to agent/ directory
lk --config interview/livekit.toml agent deploy .

echo "✅ Main Interview Agent deployed successfully!"
echo "Agent name: ${LIVEKIT_INTERVIEW_AGENT_NAME:-set in LiveKit Cloud secrets}"
