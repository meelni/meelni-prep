#!/bin/bash
# Deploy Demo Agent to LiveKit Cloud
set -e

echo "🚀 Deploying Demo Agent to LiveKit Cloud..."

# Deploy from demo directory
# Dockerfile references shared modules via ../shared/
lk agent deploy .

echo "✅ Demo Agent deployed successfully!"
echo "Agent ID: CA_Wp8bi3bRroE2"
