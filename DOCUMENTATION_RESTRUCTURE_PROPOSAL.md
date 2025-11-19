# Documentation Restructure Proposal

**Created**: 2025-11-18
**Status**: Awaiting Approval
**Purpose**: Organize scattered documentation, archive completed work, and establish sprint-based structure

---

## 🎯 Executive Summary

**Problems Identified:**
1. **69 markdown files in `.claude/`** - Many are completed sprints/features
2. **6 markdown files in root** - Should be in proper locations
3. **Duplicate CLAUDE.md** in root (redundant, we have one in `.claude/`)
4. **Completed features not properly archived** - PostHog, Pricing, Dashboard redesign docs still in active `.claude/` folder
5. **No standardized sprint documentation structure** - Current sprint folders (`pricing`, `dashboard-redesign`, `feedback-insights-sprint`) have inconsistent formats
6. **CLAUDE.md roadmap section outdated** - Lists features already implemented

**Proposed Solution:**
- Clean up root-level documentation (6 files → organized locations)
- Archive 40+ completed sprint/feature docs from `.claude/`
- Establish sprint template in `.claude/sprints/` with README index
- Update CLAUDE.md to remove outdated roadmap
- Create clear guidelines for future feature documentation

---

## 📁 Current State Analysis

### Root Directory (`/`)
```
ANALYTICS_EVENTS.md          → Move to docs/integrations/posthog/
INNGEST_DEBUG.md             → Move to docs/integrations/inngest/
START_INNGEST.md             → Move to docs/integrations/inngest/
STRIPE_QUICK_REFERENCE.md    → Move to docs/integrations/stripe/
STRIPE_TEST_PLAN.md          → Move to docs/integrations/stripe/
README.md                    → Keep (project README)
```

### `.claude/` Directory (24 non-core files to reorganize)
**Core Files (Keep):**
- ✅ CLAUDE.md (operational doc)
- ✅ PRD.md (product requirements)
- ✅ DATABASE.md (schema reference)
- ✅ LIVEKIT.md (LiveKit patterns)
- ✅ TROUBLESHOOTING.md
- ✅ CONTRIBUTING.md
- ✅ DEPLOYMENT.md

**Completed Sprint Documentation (Archive → `.claude/archive/sprints/`):**

**PostHog Analytics Sprint (8 files):**
- ANALYTICS_DASHBOARD_GUIDE.md
- ANALYTICS_DATA_DICTIONARY.md
- ANALYTICS_EVENT_CATALOG.md
- ANALYTICS_PRIVACY_GUIDE.md
- ARCHITECTURE_REVIEW_POSTHOG.md
- POSTHOG_IMPLEMENTATION_SUMMARY.md
- POSTHOG_TESTING_GUIDE.md
- PROGRESS_POSTHOG.md
- SPRINT_POSTHOG_ANALYTICS.md
- VERIFICATION_PLAN.md
- VERIFICATION_RESULTS.md

**Phase 2 Transcript Capture (3 files):**
- PHASE2_P1_COMPLETE_SUMMARY.md
- PHASE2_P1_PERFORMANCE_SUMMARY.md
- PHASE2_TRANSCRIPT_CAPTURE.md

**Other Completed Work (2 files):**
- AUTH_FLOW_ANALYSIS.md (auth is complete)
- MASTER_PLAN.md (obsolete planning doc)
- QA_REPORT.md (specific testing session)

**Active Sprint Folders (Reorganize):**
- `pricing/` → Move to `.claude/archive/sprints/pricing-2025-11/`
- `dashboard-redesign/` → Move to `.claude/archive/sprints/dashboard-redesign-2025-11/`
- `feedback-insights-sprint/` → Move to `.claude/archive/sprints/feedback-insights-2025-11/`

**Keep Active:**
- `agents/` (ongoing agent configs)
- `commands/` (slash commands)

---

## 🏗️ Proposed Structure

### New Sprint Documentation Pattern

```
.claude/
├── CLAUDE.md                          # Core operational doc (cleaned up)
├── PRD.md                             # Product requirements
├── DATABASE.md                        # Schema reference
├── LIVEKIT.md                         # LiveKit patterns
├── TROUBLESHOOTING.md
├── CONTRIBUTING.md
├── DEPLOYMENT.md
│
├── sprints/                           # Active sprints only
│   ├── README.md                      # Sprint index (auto-updated)
│   └── [sprint-name-YYYY-MM]/        # Current sprint folder
│       ├── README.md                  # Sprint overview (from template)
│       ├── PLAN.md                    # Implementation plan
│       ├── PROGRESS.md                # Daily progress log
│       ├── DECISIONS.md               # Key decisions & ADRs
│       ├── TESTING.md                 # Test plan & results
│       └── COMPLETION.md              # Final summary
│
├── archive/
│   └── sprints/                       # Completed sprints
│       ├── posthog-analytics-2025-11/
│       ├── pricing-2025-11/
│       ├── dashboard-redesign-2025-11/
│       ├── feedback-insights-2025-11/
│       └── phase2-transcript-capture-2025-11/
│
├── agents/                            # Agent configurations (keep)
└── commands/                          # Slash commands (keep)
```

### Integration Documentation

```
docs/
├── integrations/
│   ├── posthog/
│   │   ├── README.md                  # Overview
│   │   ├── setup.md                   # Setup guide
│   │   ├── events.md                  # Event catalog
│   │   └── testing.md                 # Testing guide
│   ├── inngest/
│   │   ├── README.md
│   │   ├── setup.md
│   │   └── debugging.md
│   └── stripe/
│       ├── README.md
│       ├── quick-reference.md
│       └── test-plan.md
```

---

## 📝 Sprint Template

When starting a new feature/sprint, agents will:

1. Create folder: `.claude/sprints/[feature-name-YYYY-MM]/`
2. Copy template from `docs/templates/SPRINT_TEMPLATE/`
3. Fill in README.md with sprint overview
4. Track work in PROGRESS.md (daily updates)
5. Document decisions in DECISIONS.md
6. On completion, create COMPLETION.md summary
7. Move entire folder to `.claude/archive/sprints/`

### Sprint README Template Structure

```markdown
# [Sprint Name]

**Created**: YYYY-MM-DD
**Status**: [Planning | In Progress | Blocked | Complete]
**Target Completion**: YYYY-MM-DD
**Owner**: [Team/Person]

## 🎯 Sprint Goals

1. Goal 1
2. Goal 2
3. Goal 3

## 📚 Documentation Index

- **[PLAN.md](./PLAN.md)** - Implementation plan & timeline
- **[PROGRESS.md](./PROGRESS.md)** - Daily progress log
- **[DECISIONS.md](./DECISIONS.md)** - Key decisions & ADRs
- **[TESTING.md](./TESTING.md)** - Test plan & results
- **[COMPLETION.md](./COMPLETION.md)** - Final summary (when complete)

## 🔗 Related Resources

- **ADRs**: [ADR-XXX](../../docs/architecture/adrs/ADR-XXX.md)
- **API Docs**: [docs/api/endpoint.md](../../docs/api/endpoint.md)
- **Feature Docs**: [docs/features/feature.md](../../docs/features/feature.md)

## 📊 Progress Tracking

- [ ] Task 1
- [ ] Task 2
- [ ] Task 3

## 🚀 Quick Start for Agents

**To work on this sprint:**
1. Read PLAN.md for implementation details
2. Check PROGRESS.md for current status
3. Update PROGRESS.md with daily work
4. Document decisions in DECISIONS.md
5. Log test results in TESTING.md
```

---

## 🗑️ Files to Delete

**Redundant/Obsolete:**
- ❌ `/CLAUDE.md` (root) - **Duplicate**, keep only `.claude/CLAUDE.md`
- ❌ `.claude/CLAUDE.md.backup` (3 backup files)
- ❌ `.claude/PRD.md.pre-rebrand.backup`
- ❌ `.claude/MASTER_PLAN.md` (obsolete planning doc)

---

## 📋 Migration Plan

### Phase 1: Clean Root Directory (5 min)
```bash
# Move integration docs
mkdir -p docs/integrations/{posthog,inngest,stripe}
mv ANALYTICS_EVENTS.md docs/integrations/posthog/events.md
mv INNGEST_DEBUG.md docs/integrations/inngest/debugging.md
mv START_INNGEST.md docs/integrations/inngest/setup.md
mv STRIPE_QUICK_REFERENCE.md docs/integrations/stripe/quick-reference.md
mv STRIPE_TEST_PLAN.md docs/integrations/stripe/test-plan.md

# Delete redundant CLAUDE.md in root (if exists)
rm -f /CLAUDE.md
```

### Phase 2: Archive Completed Sprints (10 min)
```bash
# Create archive structure
mkdir -p .claude/archive/sprints

# Move PostHog sprint
mkdir -p .claude/archive/sprints/posthog-analytics-2025-11
mv .claude/ANALYTICS_*.md .claude/archive/sprints/posthog-analytics-2025-11/
mv .claude/POSTHOG_*.md .claude/archive/sprints/posthog-analytics-2025-11/
mv .claude/SPRINT_POSTHOG_ANALYTICS.md .claude/archive/sprints/posthog-analytics-2025-11/
mv .claude/VERIFICATION_*.md .claude/archive/sprints/posthog-analytics-2025-11/
mv .claude/ARCHITECTURE_REVIEW_POSTHOG.md .claude/archive/sprints/posthog-analytics-2025-11/
mv .claude/PROGRESS_POSTHOG.md .claude/archive/sprints/posthog-analytics-2025-11/

# Move Phase 2 Transcript Capture
mkdir -p .claude/archive/sprints/phase2-transcript-capture-2025-11
mv .claude/PHASE2_*.md .claude/archive/sprints/phase2-transcript-capture-2025-11/

# Move other completed docs
mv .claude/AUTH_FLOW_ANALYSIS.md .claude/archive/sprints/
mv .claude/QA_REPORT.md .claude/archive/sprints/

# Move active sprint folders to archive
mv .claude/pricing .claude/archive/sprints/pricing-2025-11
mv .claude/dashboard-redesign .claude/archive/sprints/dashboard-redesign-2025-11
mv .claude/feedback-insights-sprint .claude/archive/sprints/feedback-insights-2025-11
```

### Phase 3: Create Sprint Template (5 min)
```bash
# Create sprint template directory
mkdir -p docs/templates/SPRINT_TEMPLATE

# Create template files (agents will populate these)
touch docs/templates/SPRINT_TEMPLATE/{README.md,PLAN.md,PROGRESS.md,DECISIONS.md,TESTING.md,COMPLETION.md}
```

### Phase 4: Create Sprint Index (5 min)
```bash
# Create active sprint folder with README
mkdir -p .claude/sprints
# Create sprint index (will list active sprints)
```

### Phase 5: Update CLAUDE.md (10 min)
- Remove outdated roadmap section (lines referencing incomplete features that are now done)
- Update "Known Issues & Technical Debt" section
- Add reference to sprint documentation structure
- Update "Documentation Map" to include sprint pattern

### Phase 6: Delete Backup Files (1 min)
```bash
rm -f .claude/CLAUDE.md.backup
rm -f .claude/CLAUDE.md.pre-rebrand.backup
rm -f .claude/CLAUDE.md.v0.8.0.backup
rm -f .claude/PRD.md.pre-rebrand.backup
rm -f .claude/MASTER_PLAN.md
```

---

## 🎓 Agent Guidelines for Future Sprints

### When Starting a New Feature/Sprint:

1. **Create Sprint Folder**
   ```bash
   mkdir -p .claude/sprints/[feature-name-YYYY-MM]
   ```

2. **Copy Template**
   ```bash
   cp -r docs/templates/SPRINT_TEMPLATE/* .claude/sprints/[feature-name-YYYY-MM]/
   ```

3. **Fill in README.md**
   - Sprint name, goals, timeline
   - Link to related ADRs
   - Progress checklist

4. **Create PLAN.md**
   - Implementation approach
   - Technical decisions
   - Database changes
   - API endpoints
   - Testing strategy

5. **Daily Updates in PROGRESS.md**
   - Date-based entries
   - What was done
   - Blockers
   - Next steps

6. **Document Decisions in DECISIONS.md**
   - Why we chose approach X over Y
   - Link to created ADRs
   - Trade-offs considered

7. **Track Testing in TESTING.md**
   - Test scenarios
   - Manual test results
   - Edge cases covered
   - Production validation

8. **On Completion**
   - Create COMPLETION.md with summary
   - Link to deployed features
   - Move to `.claude/archive/sprints/`
   - Update sprint index

### What NOT to Document in Sprints:

- ❌ Permanent API documentation → use `docs/api/`
- ❌ Architecture decisions → create ADRs in `docs/architecture/adrs/`
- ❌ Integration guides → use `docs/integrations/`
- ❌ Feature documentation → use `docs/features/`
- ❌ Deployment procedures → use `docs/deployment/`

Sprints are for **temporary working documentation** during development. Permanent docs go in `docs/`.

---

## 📊 Impact Summary

### Before
- 69 markdown files in `.claude/` (cluttered)
- 6 files in root (disorganized)
- Completed sprints mixed with active work
- No clear sprint pattern
- Outdated roadmap in CLAUDE.md

### After
- 7 core files in `.claude/` (clean)
- 0 extra files in root (organized)
- Clear separation: active vs archived sprints
- Standardized sprint template
- Up-to-date CLAUDE.md
- Easy for agents to follow pattern

### Benefits
1. **Agents can easily find active work** - Only current sprints in `.claude/sprints/`
2. **Clear sprint lifecycle** - Template → Work → Archive pattern
3. **Historical context preserved** - Archived sprints available for reference
4. **Reduced clutter** - 60+ files archived, 7 core files remain
5. **Consistent structure** - New features follow same documentation pattern
6. **Better discoverability** - Sprint index shows all active work

---

## ✅ Approval Checklist

Before proceeding, please confirm:

- [ ] Root directory cleanup (move 6 files, delete duplicates)
- [ ] Archive 40+ completed sprint docs from `.claude/`
- [ ] Move 3 active sprint folders to archive
- [ ] Create sprint template structure
- [ ] Update CLAUDE.md (remove roadmap, add sprint pattern)
- [ ] Delete backup files (4 files)
- [ ] Create sprint index README

**Estimated Time**: 35-40 minutes
**Risk**: Low (all moves, no deletions of active work)
**Reversibility**: High (can restore from archive if needed)

---

## 🚀 Next Steps (After Approval)

1. Execute migration plan (phases 1-6)
2. Create sprint template with all files
3. Update CLAUDE.md
4. Create sprint index README
5. Commit with message: "docs: restructure documentation and establish sprint pattern"
6. Update this proposal with final results

---

**Questions?** Review this proposal and let me know if you'd like any adjustments before I proceed.
