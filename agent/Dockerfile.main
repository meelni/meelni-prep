# Dockerfile for Meelni Main Interview Agent
FROM python:3.12-slim

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy agent code and prompts
COPY agent.py .
COPY prompts.py .
COPY config.py .
COPY utils/ ./utils/

# LiveKit Cloud automatically provides these environment variables:
# - LIVEKIT_URL
# - LIVEKIT_API_KEY
# - LIVEKIT_API_SECRET
# You need to provide via secrets:
# - OPENAI_API_KEY
# - DEEPGRAM_API_KEY
# (ElevenLabs available via LiveKit Inference - no API key needed!)

# Run the main interview agent
CMD ["python", "agent.py", "start"]
