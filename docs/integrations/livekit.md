# LiveKit Integration

LiveKit powers Meelni's real-time PM interview rooms and Python voice agents.
The rebooted integration should treat LiveKit account details as environment-owned
configuration, not source-owned constants.

## Current Shape

- Full interviews start through `POST /api/session/start`.
- The route authenticates with Supabase, validates LiveKit env, calls
  `startInterviewSessionWorkflow`, creates the room, explicitly dispatches the
  interview agent, and returns the participant token.
- Public demos start through `POST /api/livekit/demo-token`.
- The generic `POST /api/livekit/token` endpoint is compatibility-only and must
  not be used to start paid/full interview sessions.
- Python workers live under `agent/interview` and `agent/demo`.
- Shared room metadata and transcript event contracts live in `packages/agent`.
- LiveKit room/token/dispatch helpers live in `packages/integrations`.

## Environment

Set these in local `.env.local` / agent env files and in Vercel or LiveKit Cloud
as appropriate:

```bash
LIVEKIT_API_KEY=...
LIVEKIT_API_SECRET=...
NEXT_PUBLIC_LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_INTERVIEW_AGENT_NAME=...
LIVEKIT_DEMO_AGENT_NAME=...
```

For LiveKit Cloud agents, also set provider secrets required by the selected
LiveKit Inference models, such as `OPENAI_API_KEY`. Do not paste secrets into
chat; use Vercel env pull scripts or the provider dashboards.

## New Account Setup

1. Create or select the new LiveKit Cloud project.
2. Create a server API key and secret for room, token, and dispatch APIs.
3. Configure `NEXT_PUBLIC_LIVEKIT_URL` from the project WebSocket URL.
4. Update `agent/livekit.toml`, `agent/interview/livekit.toml`, and
   `agent/demo/livekit.toml` with the new project subdomain and agent IDs.
5. Deploy the interview and demo agents from `agent/interview` and `agent/demo`.
6. Set `LIVEKIT_INTERVIEW_AGENT_NAME` and `LIVEKIT_DEMO_AGENT_NAME` to the names
   used by those deployed agents.
7. In Vercel, set the same LiveKit server env vars for Preview and Production.
8. In LiveKit Cloud agent secrets, set the agent-name env var that matches each
   worker plus model provider keys.
9. Run validation:

```bash
npm run test:integrations
npm run test:agent
npm run test:workflows
npm run test:python-agent
npm run typecheck
```

## Operational Rules

- Keep explicit dispatch. Demo and full interview agents should not compete for
  the same room jobs.
- Keep browser participant grants minimal: room join, publish, subscribe.
- Do not expose model/provider strings as end-user controls unless product
  strategy accepts it.
- Preserve correlation across session ID, room name, selected question,
  transcript turns, and feedback.
- Treat room creation, dispatch, and token minting as one start operation for
  full interviews; failed dispatch should not consume a usable session.
- Publish transcript events over the `transcript` data topic using the contract
  in `docs/contracts/livekit-room-metadata.md`.

## References

- LiveKit explicit dispatch: https://docs.livekit.io/agents/worker/agent-dispatch/
- LiveKit authentication: https://docs.livekit.io/home/server/generating-tokens/
- LiveKit Agents sessions: https://docs.livekit.io/agents/
