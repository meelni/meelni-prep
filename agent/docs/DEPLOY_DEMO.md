# Deploy Demo Agent to LiveKit Cloud

## Prerequisites

1. **LiveKit CLI installed**: https://docs.livekit.io/home/cli.md
2. **Authenticated with LiveKit Cloud**: Run `lk cloud auth`
3. **Environment variables ready**: OPENAI_API_KEY, DEEPGRAM_API_KEY

## Step 1: Configure LiveKit Cloud

Configure provider credentials and `LIVEKIT_DEMO_AGENT_NAME` as LiveKit Cloud
secrets. Keep them out of source, shell history, and deployment documentation.
The runtime uses LiveKit Inference for ElevenLabs, so no Cartesia credential is
required.

## Step 2: Verify the Image

From `agent/`, build the exact checked-in image before deployment:

```bash
docker build -f demo/Dockerfile .
```

## Step 3: Deploy to LiveKit Cloud

```bash
# Make sure you're in the agent directory
cd agent

./demo/deploy.sh
```

This will:

1. Upload your demo agent code
2. Build a Docker image
3. Deploy it to LiveKit Cloud
4. Update the agent referenced by `demo/livekit.toml`

## Step 4: Save the Agent ID

After deployment, you'll see output like:

```
Created agent: CA_xxxxxxxxxxxx
```

Save this ID as deployment metadata for LiveKit operations. The web app uses
the configured dispatch name, not a hard-coded account ID.

The agent ID is also saved in `livekit.toml`:

```toml
[project]
  subdomain = "your-project"

[agent]
  id = "CA_xxxxxxxxxxxx"
```

## Step 5: Configure the Dispatch Name

Set `LIVEKIT_DEMO_AGENT_NAME` in the LiveKit agent environment and the matching
server-side web environment. The API dispatches through the shared LiveKit
adapter; do not embed an account-specific agent ID or provider credentials in
frontend source.

## Step 6: Test

1. Run the local stack with `npm run dev:local`
2. Enable the relaunch gate only in the local development override
3. Click "Try a 2-minute voice preview"
4. Verify the agent-ready signal, takeaway, and hard room deletion

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

When you change `demo/agent.py` or `demo/runtime.py`, deploy through the checked-in helper:

```bash
./demo/deploy.sh
```

This does a **rolling deployment** - old instances stay active for up to 1 hour to complete sessions.

## Rollback

If something goes wrong:

```bash
lk agent rollback
```

## Delete Demo Agent

To remove the demo agent from LiveKit Cloud:

```bash
lk agent delete
```

## Troubleshooting

### "No Dockerfile found"

```bash
docker build -f demo/Dockerfile .
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

Use the LiveKit Cloud secret manager, then redeploy through
`./demo/deploy.sh`. Do not place secret values in commands saved to history.

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
Atomically reserve a server-derived demo room
    ↓
Dispatch the configured voice-preview agent once
    ↓
LiveKit Cloud spins up demo agent instance
    ↓
Agent joins the room and conducts a two-minute voice preview
    ↓
Agent instance scales down after session
```

**Benefits**:

- No local agent needed for demos
- Automatic scaling
- No competition with self-hosted agents
- Cloud agent ONLY handles demo rooms

---

**Next**: Follow `docs/operations/public-voice-preview.md` for the gate-off,
agent-first rollout and launch evidence.
