# Agent Deployment Guide

This directory contains two separate LiveKit agents:

1. **Demo Agent** - Quick 60-second demos on the landing page
2. **Main Interview Agent** - Full interview sessions

## Quick Deployment

### Deploy Demo Agent

```bash
./demo/deploy.sh preview # or production
```

### Deploy Main Interview Agent

```bash
./interview/deploy.sh preview # or production
```

## How It Works

Each agent has its own:

- **Dockerfile**: `Dockerfile.demo` and `Dockerfile.main`
- **Dockerignore**: `.dockerignore.demo` and `.dockerignore.main`
- **Deployment Script**: `demo/deploy.sh` and `interview/deploy.sh`

The deployment scripts:

1. Copy the correct `.dockerignore` file to `.dockerignore`
2. Copy the correct `Dockerfile` to `Dockerfile`
3. Run `lk agent deploy .`
4. Clean up temporary `Dockerfile`

## Dispatch Names

- **Demo Agent**: `LIVEKIT_DEMO_AGENT_NAME`
- **Main Interview Agent**: `LIVEKIT_INTERVIEW_AGENT_NAME`

The historical `CA_*` IDs from the previous account should not be reused for
the reboot. Create/deploy agents in the new LiveKit account and set the matching
dispatch names in app and agent environments.

## Manual Deployment

Direct `lk agent deploy` is not an approved operator path. Use the target-bound
wrappers above. Production consumes an exact signed owner authorization before
`lk` can run; Preview remains available with its explicit external config,
URL anchor, and agent ID.

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
- Check the agent name in the output matches your expectations

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

- `LIVEKIT_INTERVIEW_AGENT_NAME` - Required by the interview worker
- `LIVEKIT_DEMO_AGENT_NAME` - Required by the demo worker
- `OPENAI_API_KEY` - Required for GPT models
- `DEEPGRAM_API_KEY` - Required for STT

Automatically provided by LiveKit Cloud:

- `LIVEKIT_URL`
- `LIVEKIT_API_KEY`
- `LIVEKIT_API_SECRET`
