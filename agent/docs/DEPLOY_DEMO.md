# Deploy Demo Agent to LiveKit Cloud

## Prerequisites

1. **LiveKit CLI installed**: https://docs.livekit.io/home/cli.md
2. **Authenticated with LiveKit Cloud**: Run `lk cloud auth`
3. **Environment variables ready**: OPENAI_API_KEY, DEEPGRAM_API_KEY

## Step 1: Prepare Environment File

Create a `.env.demo` file with your API keys:

```bash
cd agent
cat > .env.demo << EOF
OPENAI_API_KEY=your_openai_key_here
DEEPGRAM_API_KEY=your_deepgram_key_here
EOF
```

**Note**: Don't add CARTESIA_API_KEY - it's not needed when using LiveKit Inference!

## Step 2: Rename Dockerfile

The deployment needs the Dockerfile to be named exactly `Dockerfile`:

```bash
# Temporarily rename for deployment
cp Dockerfile.demo Dockerfile
```

## Step 3: Deploy to LiveKit Cloud

```bash
# Make sure you're in the agent directory
cd agent

# Retired: provision the Preview demo identity through the reviewed LiveKit
# isolation workstream before using ./demo/deploy.sh preview.
```

This will:

1. Upload your demo agent code
2. Build a Docker image
3. Deploy it to LiveKit Cloud
4. Create a `livekit.toml` file with the agent ID

## Step 4: Save the Agent ID

After deployment, you'll see output like:

```
Created agent: CA_xxxxxxxxxxxx
```

**Save this ID!** You'll need it for the frontend.

The agent ID is also saved in `livekit.toml`:

```toml
[project]
  subdomain = "your-project"

[agent]
  id = "CA_xxxxxxxxxxxx"
```

## Step 5: Update Frontend

Update `/app/api/livekit/demo-token/route.ts` to use the Cloud agent ID:

```typescript
// After creating the room, dispatch the Cloud agent
const DEMO_AGENT_ID = "CA_xxxxxxxxxxxx"; // Your Cloud agent ID

await fetch(`${livekit_url.replace("wss://", "https://")}/agent/dispatch`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${apiKey}:${apiSecret}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    room: roomName,
    agentName: DEMO_AGENT_ID,
  }),
});
```

## Step 6: Test

1. Open http://localhost:3001
2. Click "Talk to Meelni"
3. Demo agent should join from LiveKit Cloud!

## Monitoring

### View agent status

```bash
lk agent status
```

### View logs

```bash
lk agent logs
```

### List all agents

```bash
lk agent list
```

## Updating the Demo Agent

When you make changes to `demo_agent.py`:

```bash
# Make sure Dockerfile exists (or copy from Dockerfile.demo)
cp Dockerfile.demo Dockerfile

# Deploy the reviewed Preview target
./demo/deploy.sh preview
```

This does a **rolling deployment** - old instances stay active for up to 1 hour to complete sessions.

## Rollback

There is no approved repository-owned rollback adapter yet. Do not run a raw
provider mutation against whichever LiveKit project happens to be active. Stop
the rollout, preserve the target identity and candidate evidence, and add a
reviewed, target-bound rollback action before attempting a Production rollback.

## Delete Demo Agent

There is no approved repository-owned deletion adapter. Treat agent deletion as
a separately reviewed and owner-authorized Production action; do not delete an
agent with the raw provider CLI.

## Troubleshooting

### "No Dockerfile found"

```bash
cp Dockerfile.demo Dockerfile
```

### "Agent not joining rooms"

Check the logs:

```bash
lk agent logs --log-type deploy
```

### "Build failed"

Check build logs:

```bash
lk agent logs --log-type build
```

### Update secrets

No approved target-bound repository secret-rotation adapter exists. Do not
mutate Production agent secrets with the raw provider CLI.

## Cost Considerations

**LiveKit Cloud Agent Hosting**:

- Free tier: Limited hours/month
- Paid tier: ~$0.10/hour per replica
- Auto-scales based on demand
- Can scale to zero on certain plans

**Self-Hosted vs Cloud**:

- **Self-hosted**: Free (your infrastructure), manual scaling
- **Cloud**: Paid, auto-scaling, no infrastructure management

For a demo that runs occasionally, Cloud is more cost-effective than keeping a server running 24/7.

## Architecture After Deployment

```
Landing Page → Demo Modal
    ↓
POST /api/livekit/demo-token
    ↓
Create room: demo-{timestamp}-{random}
    ↓
Dispatch Cloud Agent: CA_xxxxxxxxxxxx
    ↓
LiveKit Cloud spins up demo agent instance
    ↓
Agent joins room and conducts 60s demo
    ↓
Agent instance scales down after session
```

**Benefits**:

- No local agent needed for demos
- Automatic scaling
- No competition with self-hosted agents
- Cloud agent ONLY handles demo rooms

---

**Next**: After deployment, update the frontend with the agent ID and test!
