# Quick Start Guide for AI Agents

**Purpose**: Fast onboarding for agents working on sprint-based features

---

## ⚡ TL;DR - Starting a New Sprint

```bash
# 1. Create sprint folder
mkdir -p .claude/sprints/[feature-name-YYYY-MM]

# 2. Copy template
cp -r docs/templates/SPRINT_TEMPLATE/* .claude/sprints/[feature-name-YYYY-MM]/

# 3. Fill in README.md (goals, timeline, checklist)

# 4. Create PLAN.md (technical approach)

# 5. Work daily, update PROGRESS.md

# 6. On completion:
#    - Create COMPLETION.md
#    - Move to .claude/archive/sprints/

# 7. Create permanent docs in docs/
```

---

## 📋 File-by-File Guide

### README.md - Sprint Overview (15 min)

**Purpose**: Index and overview of the sprint

**Fill in:**
- Sprint name, dates, owner
- 3-5 concrete goals
- Success criteria (checkboxes)
- Links to related ADRs/docs
- Progress tracking checklist

**Update frequency**: Daily (check off completed tasks)

**Example:**
```markdown
# Email Notifications System

**Created**: 2025-11-18
**Status**: In Progress
**Target**: 2025-11-25

## Goals
1. ✅ Send interview completion emails
2. 🔄 Weekly digest emails (80% done)
3. ⏳ Reminder emails (not started)
```

---

### PLAN.md - Implementation Plan (30-60 min)

**Purpose**: Technical approach and architecture

**Fill in:**
- High-level architecture diagram
- Database schema changes (DDL)
- API endpoint specifications
- UI/UX flow
- Testing strategy
- Deployment plan

**Update frequency**: During planning phase, then reference only

**Example sections:**
- Database Changes: Show CREATE TABLE statements
- API Endpoints: Request/response schemas
- Component Hierarchy: React component tree
- Data Flow: User action → Backend → DB

---

### PROGRESS.md - Daily Log (5-10 min/day)

**Purpose**: Track daily work and blockers

**Fill in (daily):**
```markdown
### 2025-11-18 - Day 3

**Focus**: Implementing email templates

**Completed:**
- ✅ Created React Email templates
- ✅ Integrated Resend SDK
- ✅ Tested email delivery

**In Progress:**
- 🔄 Cron job setup (50% done)

**Blockers:**
- ❌ Need API key from Resend support

**Next Steps:**
1. Finish cron job
2. Test scheduled emails
3. Deploy to staging

**Time Spent**: 4 hours
```

**Update frequency**: Daily (end of work session)

**Pro tip**: Copy yesterday's "Next Steps" as today's starting point

---

### DECISIONS.md - Key Decisions (10 min/decision)

**Purpose**: Document why we chose X over Y

**Fill in (when making important decisions):**
```markdown
### Decision #003 - Use Resend vs SendGrid

**Date**: 2025-11-18
**Impact**: Medium

**Options:**
- Resend: $10/month, 50k emails
- SendGrid: $20/month, 100k emails

**Decision**: Resend

**Rationale**:
- Better DX with React Email
- Cheaper for our volume
- Easier setup

**Trade-offs**:
- Lower email limit (acceptable for MVP)
```

**Update frequency**: As needed (not daily)

**When to document:**
- Architecture choices
- Library selections
- Data model designs
- UX decisions
- Process changes

---

### TESTING.md - Test Plan & Results (ongoing)

**Purpose**: Track testing scenarios and results

**Fill in:**
1. **Test Scenarios** (during planning):
   - Happy path
   - Error cases
   - Edge cases

2. **Test Results** (during testing phase):
   - Manual test outcomes
   - Unit/integration test stats
   - Performance benchmarks
   - Bug log

**Update frequency**: Daily during testing phase

**Example:**
```markdown
### Scenario 1: Send Email on Interview Complete

**Steps:**
1. Complete interview
2. Check inbox

**Expected**: Email received within 1 min
**Actual**: ✅ Email received in 23 seconds
**Test Date**: 2025-11-18
```

---

### COMPLETION.md - Final Summary (30-60 min)

**Purpose**: Sprint retrospective and handoff

**Fill in (at end of sprint):**
- What we built (features, APIs, DB changes)
- Code changes (files, lines, tests)
- Key decisions (link to DECISIONS.md entries)
- Testing results (coverage, metrics)
- Deployment info (date, status, monitoring)
- Lessons learned (good, bad, improve)
- Known limitations (tech debt, future work)

**Update frequency**: Once, at sprint completion

**Example structure:**
```markdown
# Email Notifications - Complete

**Completed**: 2025-11-25
**Duration**: 7 days

## What We Built
- 3 email types (completion, digest, reminder)
- POST /api/email/send endpoint
- 5 React Email templates

## Results
- 95% test coverage
- P95 latency: 234ms
- 0 production errors

## Lessons Learned
✅ React Email was great choice
⚠️ Underestimated cron setup time
```

---

## 🎯 Daily Workflow

### Morning Routine (5 min)

1. **Open sprint README**
   - Check today's goals
   - Review progress checklist

2. **Read PROGRESS.md**
   - What was done yesterday?
   - What blockers exist?
   - What's next?

3. **Check PLAN.md**
   - Refresh on technical approach
   - Verify you're building right thing

### During Work (ongoing)

1. **Make decisions?** → Log in DECISIONS.md
2. **Write code?** → Update progress checklist in README
3. **Hit blocker?** → Note in PROGRESS.md

### End of Day (10 min)

1. **Update PROGRESS.md**
   - What did I complete today?
   - What's in progress?
   - Any blockers?
   - What's tomorrow's plan?
   - How much time spent?

2. **Update README checklist**
   - Check off completed tasks
   - Add new tasks if needed

3. **Commit code**
   - Reference sprint in commit message
   - Link to relevant decision numbers

---

## 🚀 Completion Workflow (30 min)

### When Sprint is Done

1. **Create COMPLETION.md** (30 min)
   - Copy template structure
   - Fill in all sections
   - Link to deployed features
   - Document lessons learned

2. **Create Permanent Docs** (60 min)
   - Create ADRs for key decisions
   - Add API docs to `docs/api/`
   - Create feature guide in `docs/features/`
   - Update integration docs if needed

3. **Archive Sprint** (2 min)
   ```bash
   mv .claude/sprints/[name] .claude/archive/sprints/[name]
   ```

4. **Update CLAUDE.md** (10 min)
   - Add to iteration log
   - Update project status
   - Remove from active work

---

## ❌ Common Mistakes to Avoid

### ❌ Don't:

1. **Skip daily PROGRESS.md updates**
   - You'll forget what you did
   - Lose track of blockers
   - Can't resume work easily

2. **Put permanent docs in sprint folder**
   - API docs → `docs/api/`
   - ADRs → `docs/architecture/adrs/`
   - Feature guides → `docs/features/`

3. **Forget to update README checklist**
   - Checklist gets stale
   - Can't see progress at a glance

4. **Skip DECISIONS.md**
   - Future you won't remember why
   - Other agents will repeat same debates
   - No rationale for choices

5. **Write COMPLETION.md too early**
   - Wait until fully deployed
   - Include production metrics
   - Document actual results, not plans

### ✅ Do:

1. **Update PROGRESS.md every day**
   - 5-10 min investment
   - Huge payoff for continuity

2. **Document decisions as you make them**
   - Fresh in your mind
   - Captures context

3. **Keep README checklist current**
   - Quick visual progress
   - Easy to resume work

4. **Create ADRs for big decisions**
   - Don't just use DECISIONS.md
   - ADRs are permanent, searchable

5. **Test before marking complete**
   - Verify in production
   - Check monitoring
   - Get user feedback

---

## 📚 Where Things Go

### Temporary (Sprint Folder)

**Goes in sprint folder** (while working):
- Daily progress logs
- Work-in-progress decisions
- Test results during development
- Planning notes
- Implementation details

**Stays in sprint folder** (after archiving):
- All of the above
- COMPLETION.md (final summary)

### Permanent (docs/ Folder)

**Goes in `docs/`** (permanent reference):
- ADRs (architecture decisions)
- API documentation
- Feature guides
- Integration setup guides
- Deployment procedures
- Testing guidelines

### Code Comments

**Goes in code** (inline docs):
- Complex algorithm explanations
- Why we did X (not what)
- Edge case handling
- Performance considerations

---

## 🔍 Finding Information

### I need to know...

**"What's the technical approach for this sprint?"**
→ Read `PLAN.md`

**"What was done yesterday?"**
→ Read last entry in `PROGRESS.md`

**"Why did we choose X over Y?"**
→ Search `DECISIONS.md`

**"What's left to do?"**
→ Check README checklist

**"How do I test this?"**
→ Read `TESTING.md`

**"What did we learn?"**
→ Read `COMPLETION.md` (if complete)

---

## 💡 Pro Tips

### Tip 1: Link Everything
```markdown
See [Decision #003](./DECISIONS.md#decision-003)
See [ADR-028](../../docs/architecture/adrs/ADR-028.md)
```

### Tip 2: Use Checklists
```markdown
- [x] Task done
- [ ] Task pending
```

### Tip 3: Date Everything
```markdown
### 2025-11-18 - Day 3
**Test Date**: 2025-11-18
**Deployed**: 2025-11-25
```

### Tip 4: Be Specific
```markdown
❌ "Made progress on API"
✅ "Implemented POST /api/email/send endpoint,
    handles validation, returns 201 on success"
```

### Tip 5: Include Metrics
```markdown
✅ "Added email feature"
Better: "Added email feature, 93% test coverage,
         P95 latency 234ms, 0 errors in 24h"
```

---

## 🎓 Example Sprint Timeline

### Day 1: Planning
- Create sprint folder
- Fill in README (goals, checklist)
- Write PLAN.md (architecture, DB, APIs)
- Start DECISIONS.md (initial choices)
- Update PROGRESS.md (Day 1 entry)

### Day 2-5: Development
- Write code
- Update PROGRESS.md daily
- Log decisions in DECISIONS.md
- Check off tasks in README
- Update TESTING.md with test scenarios

### Day 6-7: Testing
- Run all tests
- Update TESTING.md with results
- Fix bugs, log in TESTING.md
- Manual testing
- Update PROGRESS.md daily

### Day 8: Deployment
- Deploy to production
- Monitor metrics
- Verify functionality
- Update PROGRESS.md

### Day 9: Completion
- Write COMPLETION.md
- Create permanent docs
- Create ADRs
- Archive sprint folder

---

**Questions?** See main templates for detailed examples.
