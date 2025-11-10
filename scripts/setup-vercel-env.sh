#!/bin/bash

# Vercel Environment Variables Setup Script
# This script helps automate adding environment variables to Vercel

set -e

echo "🔐 Vercel Environment Variables Setup"
echo "======================================"
echo ""

# Check if .env.local exists
if [ ! -f ".env.local" ]; then
    echo "❌ .env.local file not found"
    echo "Please create .env.local with your environment variables first"
    exit 1
fi

echo "📋 This script will help you add environment variables to Vercel"
echo ""
echo "⚠️  IMPORTANT:"
echo "  - You must be logged in to Vercel CLI"
echo "  - This will add variables to PRODUCTION environment"
echo "  - For NEXT_PUBLIC_* variables, also enable Preview and Development"
echo ""

read -p "Continue? (y/n) " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ Setup cancelled"
    exit 1
fi

# Source the .env.local file to get variables
source .env.local

echo ""
echo "🚀 Adding environment variables to Vercel..."
echo ""

# Function to add env var
add_env_var() {
    local var_name=$1
    local var_value=$2

    if [ -n "$var_value" ]; then
        echo "  → Adding $var_name"
        echo "$var_value" | vercel env add "$var_name" production --force
    else
        echo "  ⚠️  Skipping $var_name (not set in .env.local)"
    fi
}

# Database
echo "Database & Supabase:"
add_env_var "DATABASE_URL" "$DATABASE_URL"
add_env_var "NEXT_PUBLIC_SUPABASE_URL" "$NEXT_PUBLIC_SUPABASE_URL"
add_env_var "NEXT_PUBLIC_SUPABASE_ANON_KEY" "$NEXT_PUBLIC_SUPABASE_ANON_KEY"
add_env_var "SUPABASE_SERVICE_ROLE_KEY" "$SUPABASE_SERVICE_ROLE_KEY"

echo ""
echo "LiveKit:"
add_env_var "LIVEKIT_API_KEY" "$LIVEKIT_API_KEY"
add_env_var "LIVEKIT_API_SECRET" "$LIVEKIT_API_SECRET"
add_env_var "NEXT_PUBLIC_LIVEKIT_URL" "$NEXT_PUBLIC_LIVEKIT_URL"
add_env_var "LIVEKIT_URL" "$LIVEKIT_URL"

echo ""
echo "AI Services:"
add_env_var "OPENAI_API_KEY" "$OPENAI_API_KEY"

if [ -n "$DEEPGRAM_API_KEY" ]; then
    add_env_var "DEEPGRAM_API_KEY" "$DEEPGRAM_API_KEY"
fi

if [ -n "$CARTESIA_API_KEY" ]; then
    add_env_var "CARTESIA_API_KEY" "$CARTESIA_API_KEY"
fi

echo ""
echo "Background Jobs:"
add_env_var "INNGEST_EVENT_KEY" "$INNGEST_EVENT_KEY"
add_env_var "INNGEST_SIGNING_KEY" "$INNGEST_SIGNING_KEY"

echo ""
echo "Google Sheets:"
add_env_var "GOOGLE_SHEETS_API_KEY" "$GOOGLE_SHEETS_API_KEY"
add_env_var "GOOGLE_SHEET_ID" "$GOOGLE_SHEET_ID"
add_env_var "GOOGLE_SHEET_NAME" "$GOOGLE_SHEET_NAME"

echo ""
echo "✅ Environment variables added!"
echo ""
echo "⚠️  IMPORTANT NEXT STEPS:"
echo ""
echo "1. Go to Vercel Dashboard → Your Project → Settings → Environment Variables"
echo ""
echo "2. For NEXT_PUBLIC_* variables, enable Preview and Development environments:"
echo "   - NEXT_PUBLIC_SUPABASE_URL"
echo "   - NEXT_PUBLIC_SUPABASE_ANON_KEY"
echo "   - NEXT_PUBLIC_LIVEKIT_URL"
echo ""
echo "3. Verify all variables are set correctly"
echo ""
echo "4. Redeploy your application:"
echo "   vercel --prod"
echo ""
echo "🎉 Setup complete!"
