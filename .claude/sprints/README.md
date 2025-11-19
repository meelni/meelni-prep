# Active Sprints Index

**Last Updated**: 2025-11-18
**Purpose**: Track all active feature development sprints

---

## 📋 Current Active Sprints

> **Note**: When sprints are complete, they are moved to `.claude/archive/sprints/`

**Currently**: No active sprints

---

## 🚀 Starting a New Sprint

### Quick Start

```bash
# 1. Create sprint folder with date
mkdir -p .claude/sprints/[feature-name-YYYY-MM]

# 2. Copy template
cp -r docs/templates/SPRINT_TEMPLATE/* .claude/sprints/[feature-name-YYYY-MM]/

# 3. Fill in the template files
# - README.md: Goals, timeline, checklist
# - PLAN.md: Technical approach
# - PROGRESS.md: Daily updates (start Day 1 entry)
# - DECISIONS.md: Document key decisions as you make them
# - TESTING.md: Test scenarios and results
# - COMPLETION.md: Fill in at the end

# 4. Update this index file (add entry below)
```

### Or Use the Slash Command

```bash
# From your terminal/Claude Code
/new-sprint [feature-name]
```

This will:
- Create the sprint folder with current date
- Copy all template files
- Pre-fill sprint name and dates
- Add entry to this index

---

## 📁 Sprint Lifecycle

```
Planning → Development → Testing → Deployment → Completion → Archive
   1d         3-5d         2-3d        1d          1d          →
```

### Phase 1: Planning (Day 1)
- Create sprint folder from template
- Fill in README.md (goals, checklist)
- Write PLAN.md (architecture, APIs, DB)
- Add entry to this index

### Phase 2: Development (Days 2-6)
- Implement features
- Update PROGRESS.md daily
- Log decisions in DECISIONS.md
- Check off tasks in README

### Phase 3: Testing (Days 7-8)
- Write and run tests
- Document results in TESTING.md
- Fix bugs, update bug log

### Phase 4: Deployment (Day 9)
- Deploy to production
- Monitor metrics
- Verify functionality

### Phase 5: Completion (Day 10)
- Write COMPLETION.md summary
- Create permanent docs in `docs/`
- Create ADRs for key decisions

### Phase 6: Archive
```bash
mv .claude/sprints/[name] .claude/archive/sprints/[name]
```

---

## 📚 Archived Sprints

See `.claude/archive/sprints/` for completed sprints:

- **posthog-analytics-2025-11** - PostHog analytics integration
- **phase2-transcript-capture-2025-11** - Real-time transcript persistence
- **pricing-2025-11** - Pricing & billing system
- **dashboard-redesign-2025-11** - Tactical dashboard UI
- **feedback-insights-2025-11** - AI feedback engine

---

## 📖 Documentation Guidelines

### Temporary Docs (Sprint Folder)

**Lives in sprint folder during development:**
- Daily progress logs (PROGRESS.md)
- Work-in-progress decisions (DECISIONS.md)
- Test results during development (TESTING.md)
- Planning notes (PLAN.md)
- Sprint summary (COMPLETION.md)

**Purpose**: Track active work, communicate progress, document decisions in context

### Permanent Docs (docs/ Folder)

**Lives in `docs/` forever:**
- Architecture Decision Records (ADRs) → `docs/architecture/adrs/`
- API documentation → `docs/api/`
- Feature guides → `docs/features/`
- Integration setup → `docs/integrations/`
- Deployment procedures → `docs/deployment/`

**Purpose**: Long-term reference, onboarding, architecture history

### Rule of Thumb

**Sprint folder** = "How we built it, what we learned, why we made choices"
**docs/ folder** = "How to use it, how it works, how to maintain it"

---

## 🤖 For AI Agents

### Before Starting Work

1. Check this index for active sprints
2. If starting new feature → create new sprint
3. If continuing work → find sprint folder, read PROGRESS.md

### During Work

1. **Daily**: Update PROGRESS.md (what done, what's next, blockers)
2. **As needed**: Log decisions in DECISIONS.md
3. **Ongoing**: Update README checklist
4. **Testing phase**: Document in TESTING.md

### On Completion

1. Write COMPLETION.md summary
2. Create permanent docs in `docs/`
3. Move sprint to archive
4. Remove from this index

### Quick Reference

| File | When to Update | How Often |
|------|---------------|-----------|
| README.md | Tasks complete | Daily |
| PLAN.md | Planning phase | Once |
| PROGRESS.md | End of work session | Daily |
| DECISIONS.md | Make important decision | As needed |
| TESTING.md | Testing phase | Daily during testing |
| COMPLETION.md | Sprint complete | Once |

---

## 🔍 Finding Sprints

### By Status
- **Active sprints**: `.claude/sprints/`
- **Archived sprints**: `.claude/archive/sprints/`

### By Feature
Search sprint folder names:
```bash
find .claude -type d -name "*feature-name*"
```

### By Date
```bash
ls -lt .claude/sprints/  # Most recent first
```

---

## 📝 Naming Conventions

**Sprint folder name format:**
```
[feature-name-YYYY-MM]
```

**Examples:**
- `email-notifications-2025-11`
- `video-interviews-2025-12`
- `stripe-integration-2025-11`
- `dashboard-v2-2025-12`

**Rules:**
- Use kebab-case (lowercase, hyphens)
- Be specific and descriptive
- Include year-month (YYYY-MM)
- Max 30 characters (excluding date)

---

**Need help?** See `docs/templates/SPRINT_TEMPLATE/QUICK_START_FOR_AGENTS.md`
