### ADR-003: Tech Stack Finalization

- **Date**: 2025-11-05
- **Updated**: 2025-11-05 (GPT-4o-mini decision)
- **Decision**: Use Next.js 14+, Supabase (Postgres + Auth), Drizzle ORM, LiveKit Agents (with Deepgram ASR + Cartesia TTS + **GPT-4o-mini**), Hedra for avatars (post-MVP)
- **Rationale**:
  - Next.js: Fast MVP development, unified frontend/backend, scales to 1K users easily
  - Supabase Auth: Free, integrated with database RLS, flexible vs Clerk's cost at scale
  - Drizzle: Lightweight, type-safe, serverless-friendly vs Prisma's bundle size
  - LiveKit Agents: Integrated ASR/TTS/LLM orchestration with provider flexibility vs OpenAI Realtime's lock-in
  - Deepgram: Low latency, cost-effective ASR ($0.0043/min)
  - Cartesia: Better cost/quality than OpenAI TTS
  - **GPT-4o-mini**: Cost-effective dialogue model, works with LiveKit gateway, sufficient quality for MVP
- **Consequences**:
  - Need to deploy LiveKit Agents separately (Railway/Render/Fly.io)
  - More control over AI stack, easier to optimize costs
  - Learning curve for LiveKit Agents framework (completed in Phase 0)
  - Model format: `"provider/model-name"` (e.g., `"openai/gpt-4o-mini"`)
