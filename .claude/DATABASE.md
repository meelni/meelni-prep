# DATABASE.md: Database Architecture & Patterns

**Last Updated**: 2025-11-06
**Status**: Placeholder (to be populated in Phase 1)

## Purpose
Document database schema, migrations, RLS policies, and data access patterns.

## Current Schema

See `lib/db/schema.ts` for the complete schema definition. Key tables:

- **app_user**: User accounts (linked to Supabase Auth)
- **interview_session**: Interview metadata (user_id, role, round_type, mode, timestamps)
- **transcript_turn**: Turn-by-turn conversation data (speaker, text, timing, latency)
- **feedback**: AI-generated feedback and scores (structure, clarity, insight, etc.)

## Migration Strategy

Currently using `drizzle-kit push` for schema synchronization (no migration files).

**Planned**: Generate proper migrations when implementing:
- RLS policies
- Indexes for performance
- Additional tables (user_settings, analytics, etc.)

## RLS Policies (Planned)

Row Level Security policies to implement:
- Users can only read/write their own sessions
- Users can only read/write their own feedback
- Transcript data restricted to session owner

## Query Patterns (Planned)

Best practices for:
- Fetching user's interview history
- Aggregating performance metrics
- Real-time transcript writes during sessions

---

**For now, see**: CLAUDE.md "Database Schema" section
