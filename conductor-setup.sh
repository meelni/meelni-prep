#!/bin/bash
set -e  # Exit on any error

echo "🚀 Setting up MockMate workspace..."

# Verify package managers exist
if ! command -v npm &> /dev/null; then
    echo "❌ Error: npm is not installed. Please install Node.js first."
    exit 1
fi

if ! command -v python3 &> /dev/null; then
    echo "❌ Error: python3 is not installed. Please install Python 3 first."
    exit 1
fi

# Step 1: Copy environment variables
echo "📋 Setting up environment variables..."
if [ -f "$CONDUCTOR_ROOT_PATH/.env" ]; then
    ln -sf "$CONDUCTOR_ROOT_PATH/.env" .env.local
    echo "✅ Linked .env from root to .env.local"
else
    echo "⚠️  Warning: .env not found in root. You'll need to create it manually."
fi

# Verify required environment variables
source "$CONDUCTOR_ROOT_PATH/.env" 2>/dev/null || true
REQUIRED_VARS=("DATABASE_URL" "LIVEKIT_API_KEY" "LIVEKIT_API_SECRET" "OPENAI_API_KEY" "DEEPGRAM_API_KEY" "CARTESIA_API_KEY")
MISSING_VARS=()

for var in "${REQUIRED_VARS[@]}"; do
    if [ -z "${!var}" ]; then
        MISSING_VARS+=("$var")
    fi
done

if [ ${#MISSING_VARS[@]} -ne 0 ]; then
    echo "❌ Error: Missing required environment variables:"
    printf '   - %s\n' "${MISSING_VARS[@]}"
    echo "Please add these to $CONDUCTOR_ROOT_PATH/.env"
    exit 1
fi

# Step 2: Install npm dependencies
echo "📦 Installing npm dependencies..."
npm install

# Step 3: Set up Python virtual environment for agent
echo "🐍 Setting up Python agent environment..."
cd agent

if [ ! -d "venv" ]; then
    python3 -m venv venv
    echo "✅ Created Python virtual environment"
fi

source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
deactivate

cd ..

echo "✅ Setup complete! You can now use the Run button to start both servers."
echo ""
echo "📚 Available commands:"
echo "   - Run button           Start Next.js + Python agent (both)"
echo "   - npm run dev          Start Next.js dev server only"
echo "   - npm run build        Build for production"
echo "   - npm run db:push      Push database schema to Supabase"
