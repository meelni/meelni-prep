#!/bin/bash
# Deploy Demo Agent to LiveKit Cloud
set -e

echo "🚀 Deploying Demo Agent to LiveKit Cloud..."

# Deploy from parent directory (agent/) with demo-specific Dockerfile
# This allows the Dockerfile to access both shared/ and demo/ directories
cd "$(dirname "$0")/.."  # Go to agent/ directory
lk agent deploy --dockerfile demo/Dockerfile .

echo "✅ Demo Agent deployed successfully!"
echo "Agent ID: CA_Wp8bi3bRroE2"
