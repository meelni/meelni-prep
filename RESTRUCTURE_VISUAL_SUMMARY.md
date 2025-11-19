# Documentation Restructure - Visual Summary

## 📊 Current State vs. Proposed State

### Current Directory Structure (Simplified)

```
meelni-prep/.conductor/dhaka/
├── ANALYTICS_EVENTS.md                    ❌ Wrong location
├── INNGEST_DEBUG.md                       ❌ Wrong location
├── STRIPE_QUICK_REFERENCE.md              ❌ Wrong location
├── STRIPE_TEST_PLAN.md                    ❌ Wrong location
├── START_INNGEST.md                       ❌ Wrong location
├── README.md                              ✅ Correct
│
├── .claude/                               📁 69 files (too many!)
│   ├── CLAUDE.md                          ✅ Keep
│   ├── PRD.md                             ✅ Keep
│   ├── DATABASE.md                        ✅ Keep
│   ├── LIVEKIT.md                         ✅ Keep
│   ├── TROUBLESHOOTING.md                 ✅ Keep
│   ├── CONTRIBUTING.md                    ✅ Keep
│   ├── DEPLOYMENT.md                      ✅ Keep
│   │
│   ├── ANALYTICS_DASHBOARD_GUIDE.md       ⚠️  Move to archive (PostHog sprint done)
│   ├── ANALYTICS_DATA_DICTIONARY.md       ⚠️  Move to archive
│   ├── ANALYTICS_EVENT_CATALOG.md         ⚠️  Move to archive
│   ├── ANALYTICS_PRIVACY_GUIDE.md         ⚠️  Move to archive
│   ├── POSTHOG_IMPLEMENTATION_SUMMARY.md  ⚠️  Move to archive
│   ├── POSTHOG_TESTING_GUIDE.md           ⚠️  Move to archive
│   ├── SPRINT_POSTHOG_ANALYTICS.md        ⚠️  Move to archive
│   ├── VERIFICATION_PLAN.md               ⚠️  Move to archive
│   ├── ... (8 more PostHog files)
│   │
│   ├── PHASE2_P1_COMPLETE_SUMMARY.md      ⚠️  Move to archive (Phase 2 done)
│   ├── PHASE2_P1_PERFORMANCE_SUMMARY.md   ⚠️  Move to archive
│   ├── PHASE2_TRANSCRIPT_CAPTURE.md       ⚠️  Move to archive
│   │
│   ├── CLAUDE.md.backup                   ❌ Delete (redundant)
│   ├── CLAUDE.md.pre-rebrand.backup       ❌ Delete (redundant)
│   ├── CLAUDE.md.v0.8.0.backup            ❌ Delete (redundant)
│   ├── PRD.md.pre-rebrand.backup          ❌ Delete (redundant)
│   ├── MASTER_PLAN.md                     ❌ Delete (obsolete)
│   │
│   ├── pricing/                           ⚠️  Move to archive (sprint complete)
│   ├── dashboard-redesign/                ⚠️  Move to archive (sprint complete)
│   ├── feedback-insights-sprint/          ⚠️  Move to archive (sprint complete)
│   │
│   ├── agents/                            ✅ Keep (active configs)
│   └── commands/                          ✅ Keep (slash commands)
│
└── docs/                                  📁 Well organized
    ├── integrations/
    │   └── (need to add: posthog, inngest, stripe)
    └── templates/
        └── (need to add: SPRINT_TEMPLATE)
```

---

## 🎯 Proposed Directory Structure

```
meelni-prep/.conductor/dhaka/
├── README.md                              ✅ Project README
│
├── .claude/                               📁 Clean & organized (7 core + 2 folders)
│   ├── CLAUDE.md                          📄 Main operational doc
│   ├── PRD.md                             📄 Product requirements
│   ├── DATABASE.md                        📄 Schema reference
│   ├── LIVEKIT.md                         📄 LiveKit patterns
│   ├── TROUBLESHOOTING.md                 📄 Common issues
│   ├── CONTRIBUTING.md                    📄 Contributing guide
│   ├── DEPLOYMENT.md                      📄 Deployment overview
│   │
│   ├── sprints/                           📁 Active sprints only
│   │   ├── README.md                      📋 Sprint index
│   │   └── [future-sprint-name-YYYY-MM]/ 📁 New sprints go here
│   │       ├── README.md                  📋 Sprint overview
│   │       ├── PLAN.md                    📋 Implementation plan
│   │       ├── PROGRESS.md                📋 Daily updates
│   │       ├── DECISIONS.md               📋 Key decisions
│   │       ├── TESTING.md                 📋 Test plan
│   │       └── COMPLETION.md              📋 Final summary
│   │
│   ├── archive/
│   │   └── sprints/                       📁 Completed sprints
│   │       ├── posthog-analytics-2025-11/
│   │       ├── pricing-2025-11/
│   │       ├── dashboard-redesign-2025-11/
│   │       ├── feedback-insights-2025-11/
│   │       └── phase2-transcript-capture-2025-11/
│   │
│   ├── agents/                            📁 Agent configurations
│   └── commands/                          📁 Slash commands
│
└── docs/                                  📁 Technical documentation
    ├── integrations/
    │   ├── posthog/                       📁 NEW: PostHog docs
    │   │   ├── README.md
    │   │   ├── setup.md
    │   │   ├── events.md
    │   │   └── testing.md
    │   ├── inngest/                       📁 NEW: Inngest docs
    │   │   ├── README.md
    │   │   ├── setup.md
    │   │   └── debugging.md
    │   └── stripe/                        📁 NEW: Stripe docs
    │       ├── README.md
    │       ├── quick-reference.md
    │       └── test-plan.md
    │
    └── templates/
        └── SPRINT_TEMPLATE/               📁 NEW: Sprint template
            ├── README.md
            ├── PLAN.md
            ├── PROGRESS.md
            ├── DECISIONS.md
            ├── TESTING.md
            └── COMPLETION.md
```

---

## 📈 File Count Comparison

| Location | Before | After | Change |
|----------|--------|-------|--------|
| Root `*.md` | 6 | 1 | -5 (moved to docs) |
| `.claude/*.md` | 24 | 7 | -17 (archived) |
| `.claude/*/` folders | 5 | 2 | -3 (archived) |
| Backup files | 4 | 0 | -4 (deleted) |
| **Total clutter** | **39** | **10** | **-29 files** |

---

## 🔄 Sprint Lifecycle Visualization

```
┌─────────────────────────────────────────────────────────────────┐
│                     NEW FEATURE REQUEST                          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Step 1: Create Sprint Folder                                   │
│  .claude/sprints/[feature-name-YYYY-MM]/                        │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Step 2: Copy Sprint Template                                   │
│  docs/templates/SPRINT_TEMPLATE/* → sprint folder               │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Step 3: Planning Phase                                         │
│  - Fill in README.md (goals, timeline)                          │
│  - Write PLAN.md (technical approach)                           │
│  - Create DECISIONS.md (key decisions)                          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Step 4: Implementation Phase (Daily)                           │
│  - Update PROGRESS.md with daily work                           │
│  - Log decisions in DECISIONS.md                                │
│  - Track tests in TESTING.md                                    │
│  - Update README.md progress checklist                          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Step 5: Testing Phase                                          │
│  - Complete TESTING.md with results                             │
│  - Verify all acceptance criteria                               │
│  - Test in production-like environment                          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Step 6: Completion                                             │
│  - Write COMPLETION.md summary                                  │
│  - Link to deployed features                                    │
│  - Document lessons learned                                     │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Step 7: Archive                                                │
│  Move .claude/sprints/[name]/ → .claude/archive/sprints/[name]/ │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Step 8: Permanent Documentation                                │
│  - Create ADRs in docs/architecture/adrs/                       │
│  - Add API docs to docs/api/                                    │
│  - Update feature docs in docs/features/                        │
│  - Update integration guides in docs/integrations/              │
└─────────────────────────────────────────────────────────────────┘
```

---

## 📝 Sprint Documentation Flow

```
┌──────────────────────┐
│  Temporary Docs      │  During Development
│  (Sprint Folder)     │
│                      │
│  - README.md         │  ← Overview & index
│  - PLAN.md           │  ← Technical plan
│  - PROGRESS.md       │  ← Daily updates
│  - DECISIONS.md      │  ← Why we chose X
│  - TESTING.md        │  ← Test results
│  - COMPLETION.md     │  ← Final summary
└──────────────────────┘
         │
         │ On Completion
         ▼
┌──────────────────────┐
│  Permanent Docs      │  After Deployment
│  (docs/ folder)      │
│                      │
│  - ADRs              │  ← Architecture decisions
│  - API docs          │  ← Endpoint documentation
│  - Feature docs      │  ← Feature guides
│  - Integration docs  │  ← Setup guides
└──────────────────────┘
```

---

## 🎯 Key Benefits

### For AI Agents
- ✅ Clear structure to follow
- ✅ Standardized template
- ✅ No guessing where to put docs
- ✅ Easy to find active work
- ✅ Historical context preserved

### For Developers
- ✅ Quick onboarding
- ✅ Clear sprint progress
- ✅ Easy to find documentation
- ✅ Reduced clutter
- ✅ Consistent patterns

### For Project Maintenance
- ✅ Clean separation: active vs archived
- ✅ Easy to audit completed work
- ✅ Searchable sprint history
- ✅ Scalable structure
- ✅ Low maintenance overhead

---

## 🔍 Example: How to Start a New Sprint

```bash
# 1. Create sprint folder
mkdir -p .claude/sprints/email-notifications-2025-11

# 2. Copy template
cp -r docs/templates/SPRINT_TEMPLATE/* .claude/sprints/email-notifications-2025-11/

# 3. Fill in README.md
# Sprint Name: Email Notifications System
# Goals:
#   1. Send interview completion emails
#   2. Weekly digest emails
#   3. Reminder emails for abandoned sessions

# 4. Create PLAN.md
# Implementation approach:
#   - Use Resend for email delivery
#   - Create email templates with React Email
#   - Add cron jobs for scheduled emails

# 5. Work daily, update PROGRESS.md
# 2025-11-18:
#   - Integrated Resend SDK
#   - Created email templates
#   - Next: Test email delivery

# 6. On completion, create COMPLETION.md
# Summary: Email system deployed
# Links:
#   - ADR-029: Email provider choice
#   - docs/integrations/resend/setup.md

# 7. Archive
mv .claude/sprints/email-notifications-2025-11 .claude/archive/sprints/
```

---

**Ready to proceed?** Review the full proposal in `DOCUMENTATION_RESTRUCTURE_PROPOSAL.md`
