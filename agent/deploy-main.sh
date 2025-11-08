#!/bin/bash
# Deploy Main Interview Agent to LiveKit Cloud
set -e

echo "🚀 Deploying Main Interview Agent to LiveKit Cloud..."

# Use main-specific dockerignore
cp .dockerignore.main .dockerignore

# Use main Dockerfile
cp Dockerfile.main Dockerfile

# Deploy
lk agent deploy .

# Cleanup
rm Dockerfile

echo "✅ Main Interview Agent deployed successfully!"
echo "Agent ID: CA_yawKG67rCMG4"
