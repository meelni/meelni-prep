# Dockerfile for MockMate Main Interview Agent
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

# Copy main agent code and dependencies
COPY agent.py .
COPY config.py .
COPY prompts.py .
COPY utils/ ./utils/

# LiveKit Cloud automatically provides these environment variables:
# - LIVEKIT_URL
# - LIVEKIT_API_KEY
# - LIVEKIT_API_SECRET
# You need to provide via secrets:
# - OPENAI_API_KEY
# - DEEPGRAM_API_KEY
# (CARTESIA_API_KEY not needed when using LiveKit Inference)

# Run the main interview agent
CMD ["python", "agent.py", "start"]
