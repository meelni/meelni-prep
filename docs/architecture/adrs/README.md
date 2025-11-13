# Architecture Decision Records (ADRs)

This directory contains all architecture decision records for the Meelni project. ADRs document significant architectural and technical decisions made during the project's development.

## ADR Index

### Core Infrastructure (001-009)
- [ADR-001: Workspace in Conductor/Almaty](./ADR-001-workspace-conductor-almaty.md) - Documentation workspace organization
- [ADR-002: PRD Location](./ADR-002-prd-location.md) - Product requirements document location
- [ADR-003: Tech Stack Finalization](./ADR-003-tech-stack-finalization.md) - Next.js, Supabase, Drizzle, LiveKit Agents stack selection
- [ADR-004: Background Jobs with Inngest](./ADR-004-background-jobs-inngest.md) - Async evaluation processing
- [ADR-005: Documentation Location Update](./ADR-005-documentation-location-update.md) - Move docs to .claude/
- [ADR-006: Database Schema Deployed](./ADR-006-database-schema-deployed.md) - Supabase schema deployment
- [ADR-007: LiveKit Voice Interview Integration](./ADR-007-livekit-voice-interview.md) - Real-time voice pipeline architecture
- [ADR-008: GPT-4o-mini for Dialogue LLM](./ADR-008-gpt4o-mini-dialogue.md) - Cost-effective dialogue model selection
- [ADR-009: LiveKit AgentSession API Pattern](./ADR-009-livekit-agent-session-api.md) - Agent orchestration pattern

### UI/UX Design (014-016)
- [ADR-014: UI Redesign with Linear/Notion Aesthetic](./ADR-014-ui-redesign-linear-notion.md) - Design system overhaul
- [ADR-015: Model Upgrade to Deepgram Nova-3, GPT-4.1-mini, Cartesia Sonic 3](./ADR-015-model-upgrade.md) - Voice pipeline model upgrades
- [ADR-016: Cartesia Voice Library and Tessa Voice Selection](./ADR-016-cartesia-voice-tessa.md) - TTS voice selection

### Landing Page & Demo (017-019)
- [ADR-017: Marketing Landing Page Architecture](./ADR-017-landing-page-architecture.md) - Component-based landing page
- [ADR-018: Demo Modal with LiveKit Cloud Agent](./ADR-018-demo-modal-livekit-cloud.md) - Demo agent deployment strategy
- [ADR-019: Explicit Agent Dispatch Pattern](./ADR-019-explicit-agent-dispatch.md) - Agent dispatch control mechanism

### Authentication & Dashboard (020-022)
- [ADR-020: Google OAuth Authentication Implementation](./ADR-020-google-oauth-authentication.md) - OAuth authentication flow
- [ADR-021: Tactical Dashboard UI Migration](./ADR-021-tactical-dashboard-ui.md) - Dashboard redesign with sidebar navigation
- [ADR-022: Main Interview Agent Deployed to LiveKit Cloud](./ADR-022-main-interview-agent-cloud.md) - Production agent deployment
- [ADR-026: Email/Password Authentication Implementation](./ADR-026-email-password-authentication.md) - Traditional auth alongside OAuth

### Agent Improvements (023-025)
- [ADR-023: Enhanced Prompt System with Difficulty-Aware Coaching](./ADR-023-enhanced-prompt-system.md) - Personalized coaching prompts
- [ADR-024: LiveKit Cloud Debugging Best Practices](./ADR-024-livekit-cloud-debugging.md) - Debugging workflow for Cloud agents
- [ADR-025: Agent State Debouncing for Smooth Transitions](./ADR-025-agent-state-debouncing.md) - UI flickering prevention

### API & Performance (036+)
- [ADR-036: Insights API Caching](./ADR-036-insights-api-caching.md) - API caching strategy

## ADR Template

When creating a new ADR, follow this structure:

```markdown
### ADR-XXX: [Title]
- **Date**: YYYY-MM-DD
- **Status**: [Proposed | Accepted | Deprecated | Superseded by ADR-YYY]
- **Decision**: Clear statement of the decision
- **Rationale**: Why this decision was made
  - Bullet point 1
  - Bullet point 2
- **Consequences**:
  - Positive consequences
  - Negative consequences
  - Future implications
```

## Creating a New ADR

1. Determine the next available ADR number
2. Create a new file: `ADR-XXX-descriptive-title.md`
3. Follow the template above
4. Update this README with a link to the new ADR
5. Update `.claude/CLAUDE.md` if it's a major architectural decision
