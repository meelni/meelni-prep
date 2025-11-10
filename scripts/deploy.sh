#!/bin/bash

# Meelni Production Deployment Script
# This script helps automate the Vercel deployment process

set -e  # Exit on error

echo "🚀 Meelni Production Deployment"
echo "================================"
echo ""

# Check if Vercel CLI is installed
if ! command -v vercel &> /dev/null; then
    echo "❌ Vercel CLI not found"
    echo "📦 Installing Vercel CLI..."
    npm install -g vercel
fi

# Check if user is logged in
echo "🔐 Checking Vercel authentication..."
if ! vercel whoami &> /dev/null; then
    echo "❌ Not logged in to Vercel"
    echo "🔑 Please log in:"
    vercel login
fi

echo "✅ Authenticated"
echo ""

# Pre-deployment checks
echo "🔍 Running pre-deployment checks..."

# Check if build passes
echo "  → Running build check..."
npm run build
echo "  ✅ Build successful"

# Check if TypeScript compiles
echo "  → Running TypeScript check..."
npm run typecheck
echo "  ✅ TypeScript validation passed"

# Check if linting passes
echo "  → Running linter..."
npm run lint
echo "  ✅ Linting passed"

echo ""
echo "✅ All pre-deployment checks passed!"
echo ""

# Confirm deployment
read -p "🚀 Ready to deploy to production? (y/n) " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ Deployment cancelled"
    exit 1
fi

# Deploy to production
echo ""
echo "📤 Deploying to Vercel production..."
vercel --prod

echo ""
echo "✅ Deployment complete!"
echo ""
echo "📋 Next steps:"
echo "  1. Test the production deployment"
echo "  2. Verify OAuth flow works"
echo "  3. Check LiveKit agent connections"
echo "  4. Monitor Vercel logs: vercel logs --follow"
echo ""
echo "🎉 Happy deploying!"
