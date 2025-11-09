#!/bin/bash
set -e  # Exit on any error

echo "🚀 Setting up Meelni workspace..."

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

# Determine the root path (Conductor sets CONDUCTOR_ROOT_PATH, otherwise use parent dir)
ROOT_PATH="${CONDUCTOR_ROOT_PATH:-$(cd "$(dirname "$0")/../.." && pwd)}"

if [ -f "$ROOT_PATH/.env" ]; then
    ln -sf "$ROOT_PATH/.env" .env.local
    echo "✅ Linked .env from root to .env.local"
else
    echo "⚠️  Warning: .env not found at $ROOT_PATH/.env. You'll need to create it manually."
fi

# Verify required environment variables
# NOTE: DEEPGRAM_API_KEY and CARTESIA_API_KEY are NOT required when using LiveKit Inference
# LiveKit Cloud provides these services through its Inference API using LIVEKIT_API_KEY/SECRET
if [ -f "$ROOT_PATH/.env" ]; then
    # Load .env variables safely without executing unquoted values
    # This prevents exit 127 errors from lines like: GOOGLE_SHEET_NAME=Form Responses 1
    while IFS='=' read -r key value; do
        # Skip comments and empty lines
        [[ "$key" =~ ^#.*$ ]] && continue
        [[ -z "$key" ]] && continue
        # Export the variable (handles unquoted values safely)
        export "$key=$value"
    done < "$ROOT_PATH/.env"
fi
REQUIRED_VARS=("DATABASE_URL" "LIVEKIT_API_KEY" "LIVEKIT_API_SECRET" "OPENAI_API_KEY")
MISSING_VARS=()

for var in "${REQUIRED_VARS[@]}"; do
    if [ -z "${!var}" ]; then
        MISSING_VARS+=("$var")
    fi
done

if [ ${#MISSING_VARS[@]} -ne 0 ]; then
    echo "❌ Error: Missing required environment variables:"
    printf '   - %s\n' "${MISSING_VARS[@]}"
    echo "Please add these to $ROOT_PATH/.env"
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
