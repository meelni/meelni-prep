# Opik Observability Setup

## Account And Project

1. Use the Comet workspace `savi-singh` for Meelni telemetry.
2. Use the Opik project `meelni`
   (`019fd58a-ac4d-70be-967f-fa30459c6c29`).
3. Create an API key with only the access needed for trace ingestion. Enter it
   directly in the relevant secret manager; never paste it into chat or commit
   it to the repository.

Hosted Opik uses `https://www.comet.com/opik/api`. Leave
`OPIK_URL_OVERRIDE` unset for that target.

## Codex MCP

Use the hosted MCP server as the primary agent operations interface. It uses
browser OAuth and does not store an Opik API key in Codex configuration:

```bash
codex mcp add opik --url https://www.comet.com/opik/api/v1/mcp
codex mcp login opik
codex mcp get opik
```

The global Codex config keeps writes approval-gated while allowing routine
read-only investigation without repeated prompts:

```toml
[mcp_servers.opik]
url = "https://www.comet.com/opik/api/v1/mcp"
default_tools_approval_mode = "prompt"

[mcp_servers.opik.tools.list]
approval_mode = "approve"

[mcp_servers.opik.tools.read]
approval_mode = "approve"

[mcp_servers.opik.tools.schema]
approval_mode = "approve"
```

Restart Codex after adding or reauthenticating the server. Verify by asking it
to list Opik projects; the result should contain the canonical `meelni` project.
Keep `write`, `ask_ollie`, and `run_experiment` approval-gated. Ollie may perform
workspace writes during a single investigative call.

Remove the local connection without changing Opik data with:

```bash
codex mcp logout opik
codex mcp remove opik
```

## Local Configuration

Add these values to the gitignored `.env.local`:

```dotenv
OPIK_TRACING_ENABLED=true
OPIK_API_KEY=<secret>
OPIK_WORKSPACE=savi-singh
OPIK_PROJECT_NAME=meelni
OPIK_CAPTURE_CONTENT=false
```

Set `OPIK_CAPTURE_CONTENT=true` only when prompt, transcript, and response
content should be sent. The integration still removes identities, room names,
provider request IDs, raw errors, and secrets.

Run the normal local stack with `npm run dev:local`. Generate one synthetic or
owned test interview and feedback result, then confirm Opik shows:

- a `feedback-generation` trace with an `openai.chat.completions` span;
- a `meelni-demo-agent` or `meelni-interview-agent` OpenTelemetry trace;
- model, usage, duration, and outcome fields;
- the root `job_entrypoint` trace and its `agent_session` span contain the
  ordered user/interviewer conversation in Input and the last interviewer
  message in Output;
- preserved `agent_turn` spans whose Input contains the candidate turn and
  whose Output contains the interviewer response;
- `user_turn` transcript and TTS text in their Opik Input fields;
- content only when the explicit content switch is true;
- no identity, room, provider-request, exception-body, or secret fields.

The worker logs one content-free startup line showing whether Opik tracing and
content capture initialized. Use that line to distinguish disabled or invalid
configuration from a provider-side display problem; it never includes an API
key, transcript, prompt, response, room, or participant identifier.

Meelni sends no observability-specific trace deletion request after successful
ingestion. Content remains governed by the Opik workspace's configured
retention and access policy until Opik removes it. Verify that provider policy
before enabling content capture and after any workspace-plan change.

## Preview

Configure the same six variable names in the Vercel `staging`/Preview target
and in both LiveKit Preview agent environments. Use a Preview-only API key or
project when the Comet account supports that isolation. Redeploy the web and
both voice agents after changing their environments.

Run `npm run env:pull:preview` to refresh local Vercel configuration. The pull
preserves a usable local `OPIK_API_KEY` when Vercel returns the encrypted value
as blank.

## Production Guardrails

Do not enable Opik in Production as part of ordinary setup. First:

1. approve the Comet/Opik provider disclosure and content-processing posture;
2. configure retention, workspace membership, and least-privilege API keys;
3. use the guarded LiveKit Production runtime-secrets contracts for the
   interview and demo agents; each agent requires its own signed deploy action;
4. rehearse metadata-only and content-enabled payloads in isolated Preview;
5. obtain the normal owner authorization for each Production deployment.

Rollback is `OPIK_TRACING_ENABLED=false` in each affected runtime followed by
redeployment. Disabling export does not alter interview, transcript, feedback,
or billing state.

Vercel Production receives the five hosted-Opik variables without
`OPIK_URL_OVERRIDE`. Environment changes apply only to the next Production
deployment. The LiveKit interview runtime-secrets file additionally retains
`MEELNI_TRANSCRIPT_INGEST_SECRET`; the demo file contains only the five Opik
variables. Never use `lk agent update-secrets` as a Production shortcut.
