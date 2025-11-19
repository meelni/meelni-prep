#!/bin/bash

# PostHog Analytics PR Creation Script
# This script creates a GitHub PR for the analytics integration

set -e

echo "🚀 Creating PostHog Analytics Pull Request..."
echo ""

# Check if gh CLI is installed
if ! command -v gh &> /dev/null; then
    echo "❌ GitHub CLI (gh) not found. Please install it first:"
    echo "   brew install gh"
    exit 1
fi

# Check if authenticated
if ! gh auth status &> /dev/null; then
    echo "❌ Not authenticated with GitHub CLI. Please run:"
    echo "   gh auth login"
    exit 1
fi

# Ensure we're on the correct branch
CURRENT_BRANCH=$(git branch --show-current)
if [ "$CURRENT_BRANCH" != "posthog-analytics-integration" ]; then
    echo "❌ Not on posthog-analytics-integration branch"
    echo "   Current branch: $CURRENT_BRANCH"
    exit 1
fi

# Push branch to remote
echo "📤 Pushing branch to remote..."
git push -u origin posthog-analytics-integration

echo ""
echo "📝 Creating pull request..."
echo ""

# Create PR using the template
gh pr create \
  --title "PostHog Analytics Integration - Production Ready" \
  --body-file .github/PR_TEMPLATE_ANALYTICS.md \
  --base main \
  --head posthog-analytics-integration \
  --label "analytics" \
  --label "enhancement" \
  --label "documentation"

echo ""
echo "✅ Pull request created successfully!"
echo ""
echo "Next steps:"
echo "1. Review the PR in GitHub"
echo "2. Request reviews from team members"
echo "3. Configure PostHog dashboards after merge"
echo "4. Set up alerts for critical metrics"
echo ""
