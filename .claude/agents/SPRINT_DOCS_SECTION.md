## CRITICAL: Sprint Documentation Requirements

**When working on new features**, you MUST follow the sprint documentation pattern:

### Starting a New Feature

1. **Create sprint folder**:
   ```bash
   mkdir -p .claude/sprints/[feature-name-YYYY-MM]
   ```

2. **Copy template**:
   ```bash
   cp -r docs/templates/SPRINT_TEMPLATE/* .claude/sprints/[feature-name-YYYY-MM]/
   ```

3. **Fill in documentation** (see `.claude/sprints/README.md` for details):
   - `README.md`: Sprint goals, timeline, checklist
   - `PLAN.md`: Technical approach, API endpoints, DB changes
   - `PROGRESS.md`: Daily updates (REQUIRED)
   - `DECISIONS.md`: Log key decisions as you make them
   - `TESTING.md`: Test scenarios and results

### Daily Workflow

**EVERY DAY** you work on a sprint, you MUST:
1. Update `PROGRESS.md` with what you did today
2. Update README checklist (check off completed tasks)
3. Log any decisions in `DECISIONS.md`

**Example PROGRESS.md Entry**:
```markdown
### 2025-11-18 - Day 3

**Focus**: Implementing feature X

**Completed:**
- ✅ Task 1
- ✅ Task 2

**In Progress:**
- 🔄 Task 3 (70% done)

**Blockers:**
- None

**Next Steps:**
1. Next priority
2. Following task

**Time Spent**: X hours
```

### On Sprint Completion

1. **Create COMPLETION.md** with summary
2. **Create permanent docs**:
   - ADRs for key decisions → `docs/architecture/adrs/`
   - API docs → `docs/api/`
   - Feature guides → `docs/features/`
3. **Archive sprint**:
   ```bash
   mv .claude/sprints/[name] .claude/archive/sprints/[name]
   ```

### Where Documentation Goes

**Sprint Folder** (temporary, during development):
- Daily progress logs
- Work-in-progress decisions
- Test results during development

**docs/ Folder** (permanent, forever):
- ADRs (architecture decisions)
- API documentation
- Feature guides
- Integration setup guides

**RULE**: Never create permanent docs in sprint folders. Sprint folders are for active work tracking only.

**Quick Reference**: See `docs/templates/SPRINT_TEMPLATE/QUICK_START_FOR_AGENTS.md`
