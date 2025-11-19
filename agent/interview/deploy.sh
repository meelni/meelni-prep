#!/bin/bash
# Deploy Main Interview Agent to LiveKit Cloud
set -e

echo "🚀 Deploying Main Interview Agent to LiveKit Cloud..."

# Deploy from interview directory
# Dockerfile references shared modules via ../shared/
lk agent deploy .

echo "✅ Main Interview Agent deployed successfully!"
echo "Agent ID: CA_yawKG67rCMG4"
