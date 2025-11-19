# Agent Deployment Guide

This directory contains two separate LiveKit agents:
1. **Demo Agent** - Quick 60-second demos on the landing page
2. **Main Interview Agent** - Full interview sessions

## Quick Deployment

### Deploy Demo Agent
```bash
./deploy-demo.sh
```

### Deploy Main Interview Agent
```bash
./deploy-main.sh
```

## How It Works

Each agent has its own:
- **Dockerfile**: `Dockerfile.demo` and `Dockerfile.main`
- **Dockerignore**: `.dockerignore.demo` and `.dockerignore.main`
- **Deployment Script**: `deploy-demo.sh` and `deploy-main.sh`

The deployment scripts:
1. Copy the correct `.dockerignore` file to `.dockerignore`
2. Copy the correct `Dockerfile` to `Dockerfile`
3. Run `lk agent deploy .`
4. Clean up temporary `Dockerfile`

## Agent IDs

- **Demo Agent**: `CA_Wp8bi3bRroE2`
- **Main Interview Agent**: `CA_yawKG67rCMG4`

## Manual Deployment

If you prefer to deploy manually:

### Demo Agent
```bash
cp .dockerignore.demo .dockerignore
cp Dockerfile.demo Dockerfile
lk agent deploy .
rm Dockerfile
```

### Main Interview Agent
```bash
cp .dockerignore.main .dockerignore
cp Dockerfile.main Dockerfile
lk agent deploy .
rm Dockerfile
```

## File Exclusions

### Demo Agent (.dockerignore.demo)
Excludes:
- Main agent files (`agent.py`, `prompts.py`, `config.py`, `utils/`)
- Test files
- `Dockerfile.main`

### Main Interview Agent (.dockerignore.main)
Excludes:
- Demo agent files (`demo_agent.py`, `Dockerfile.demo`)
- Test files

Both exclude:
- Python cache files
- Virtual environments
- Environment files (`.env`, `.env.local`, `.env.demo`)
- Development tools
- Git files

## Troubleshooting

### Issue: Files not found during build
- Make sure you're using the correct `.dockerignore` file
- Check that required files aren't excluded in the `.dockerignore`

### Issue: Wrong agent deployed
- Verify you're using the correct deployment script
- Check the agent ID in the output matches your expectations

### Issue: Build fails
```bash
# View build logs
lk agent logs --log-type=build

# View runtime logs
lk agent logs

# Check agent status
lk agent status
```

## Monitoring

```bash
# View runtime logs (agent activity)
lk agent logs

# View deployment logs
lk agent logs --log-type=deploy

# View build logs
lk agent logs --log-type=build

# Check agent status
lk agent status
```

## Rollback

```bash
lk agent rollback
```

## Environment Variables

Set via LiveKit Cloud secrets:
- `OPENAI_API_KEY` - Required for GPT models
- `DEEPGRAM_API_KEY` - Required for STT

Automatically provided by LiveKit Cloud:
- `LIVEKIT_URL`
- `LIVEKIT_API_KEY`
- `LIVEKIT_API_SECRET`
