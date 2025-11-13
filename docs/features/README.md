# Feature Documentation

This directory contains deep-dive documentation for major features in the Meelni application.

## Features Overview

### ✅ Implemented Features

#### [Authentication System](./authentication.md)
- Google OAuth authentication
- Email/Password authentication with verification
- Password reset flow
- Session management with Supabase Auth
- Protected routes with Next.js middleware
- Related ADRs: [ADR-020](../architecture/adrs/ADR-020-google-oauth-authentication.md), [ADR-026](../architecture/adrs/ADR-026-email-password-authentication.md)

#### [Interview Session](./interview-session.md)
- Real-time voice conversation with LiveKit
- Question bank integration (2,879 PM questions)
- Transcript capture and persistence
- Agent dispatch and room management
- Related ADRs: [ADR-007](../architecture/adrs/ADR-007-livekit-voice-interview.md), [ADR-018](../architecture/adrs/ADR-018-demo-modal-livekit-cloud.md), [ADR-022](../architecture/adrs/ADR-022-main-interview-agent-cloud.md)

#### [Feedback Engine](./feedback-engine.md)
- AI-powered evaluation with GPT-4 Turbo
- Difficulty-aware coaching (Junior/Intermediate/Senior)
- Framework-based scoring (Product Sense, Analytical, Leadership, Strategy)
- Post-session feedback generation
- Related ADRs: [ADR-023](../architecture/adrs/ADR-023-enhanced-prompt-system.md)

#### [Question Bank](./question-bank.md)
- 2,879 curated PM interview questions
- Recency filtering (Current Trends / Broader Practice / All Questions)
- Google Sheets sync via cron jobs
- Question randomization and selection
- See: `docs/integrations/google-sheets.md`

#### [Dashboard](./dashboard.md)
- Tactical command-interface design
- Sidebar navigation with 5 sections
- Interview history with session details
- Performance analytics (planned)
- Settings management (planned)
- Related ADR: [ADR-021](../architecture/adrs/ADR-021-tactical-dashboard-ui.md)

### 🚧 Planned Features

- Real-time nudges during interviews
- Advanced analytics and insights
- Custom company interview loops
- Coding/whiteboard IDE integration
- Live human interview marketplace

## Feature Documentation Template

When documenting a new feature, include:

1. **Overview** - What the feature does and why it exists
2. **User Flow** - Step-by-step user journey
3. **Technical Architecture** - Components, APIs, data flow
4. **Configuration** - Environment variables, settings
5. **Testing** - How to test the feature
6. **Known Issues** - Current limitations
7. **Future Enhancements** - Planned improvements

See `docs/templates/FEATURE_TEMPLATE.md` for the full template.

## Cross-Feature Dependencies

```
Authentication
    ↓
Dashboard → Interview Session → Feedback Engine
               ↓                      ↓
         Question Bank         Transcript Storage
```

## Related Documentation

- **API Endpoints**: See `docs/api/README.md`
- **Database Schema**: See `.claude/DATABASE.md`
- **Architecture Decisions**: See `docs/architecture/adrs/README.md`

---

**Last Updated**: 2025-11-12
