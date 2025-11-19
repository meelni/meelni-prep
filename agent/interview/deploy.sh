#!/bin/bash
# Deploy Main Interview Agent to LiveKit Cloud
set -e

echo "🚀 Deploying Main Interview Agent to LiveKit Cloud..."

# Deploy from parent directory (agent/) with interview-specific Dockerfile
# This allows the Dockerfile to access both shared/ and interview/ directories
cd "$(dirname "$0")/.."  # Go to agent/ directory
lk agent deploy --dockerfile interview/Dockerfile .

echo "✅ Main Interview Agent deployed successfully!"
echo "Agent ID: CA_yawKG67rCMG4"
