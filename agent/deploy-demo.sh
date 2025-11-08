#!/bin/bash
# Deploy Demo Agent to LiveKit Cloud
set -e

echo "🚀 Deploying Demo Agent to LiveKit Cloud..."

# Use demo-specific dockerignore
cp .dockerignore.demo .dockerignore

# Use demo Dockerfile
cp Dockerfile.demo Dockerfile

# Deploy
lk agent deploy .

# Cleanup
rm Dockerfile

echo "✅ Demo Agent deployed successfully!"
echo "Agent ID: CA_Wp8bi3bRroE2"
