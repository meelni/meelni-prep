# CONTRIBUTING.md: Developer Workflow & Standards

**Last Updated**: 2025-11-06
**Status**: Placeholder (to be populated when onboarding team)

## Purpose
Guidelines for contributing to the Meelni codebase.

## Local Development Setup

1. **Clone the repository**:
   ```bash
   git clone <repo-url>
   cd meelni-prep
   ```

2. **Install dependencies**:
   ```bash
   npm install
   cd agent && python3 -m venv venv && source venv/bin/activate && pip install -r requirements.txt
   ```

3. **Configure environment**:
   ```bash
   cp .env.example .env.local
   # Fill in: DATABASE_URL, LIVEKIT_*, OPENAI_API_KEY, DEEPGRAM_API_KEY, NEXT_PUBLIC_SUPABASE_*
   ```

4. **Run development servers**:
   ```bash
   # Terminal 1: Next.js
   npm run dev

   # Terminal 2: Agent
   cd agent && source venv/bin/activate && python agent.py dev
   ```

## Branch Naming

- Use descriptive, concrete names (<30 characters)
- No prefixes (e.g., `feature/`, `fix/`)
- Examples: `add-user-auth`, `fix-session-latency`, `refactor-dashboard-ui`
- User branches: Use `{username}/` prefix (e.g., `saviii/dashboard-redesign`)

## Commit Message Standards

- Use clear, concise present-tense descriptions
- Include context and rationale for non-obvious changes
- Co-author with Claude when applicable:
  ```
  feat: add Google OAuth authentication

  Implemented full OAuth flow with Supabase Auth, protected routes with middleware,
  and personalized dashboard experience.

  🤖 Generated with [Claude Code](https://claude.com/claude-code)

  Co-Authored-By: Claude <noreply@anthropic.com>
  ```

## Code Review Checklist (Planned)

- [ ] All tests passing
- [ ] TypeScript types correct (no `any` without justification)
- [ ] CLAUDE.md updated if architectural changes made
- [ ] Environment variables documented in .env.example
- [ ] No hardcoded secrets or API keys
- [ ] Component follows design system conventions
- [ ] Responsive design tested (mobile, tablet, desktop)

## Testing Requirements (Planned)

- Unit tests for utilities and complex logic
- Integration tests for API routes
- E2E tests for critical user flows
- Manual testing checklist for UI changes

---

**For code style details, see**: CLAUDE.md "Code Style & Conventions" section
