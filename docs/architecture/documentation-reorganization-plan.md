# Documentation Reorganization Plan

**Date**: 2025-11-12
**Status**: Analysis Complete - Ready for Implementation

---

## Executive Summary

The Meelni project has accumulated **50+ markdown files at the root level**, scattered documentation across multiple directories, and no clear organizational structure. This reorganization will:

1. Consolidate all documentation into a structured `docs/` folder
2. Remove duplicate and obsolete files
3. Establish clear documentation standards
4. Create templates for future documentation

---

## Current State Analysis

### Documentation Inventory

#### Active Documentation (Keep & Organize)

- **Core Documentation** (`.claude/` directory - 15 files):
  - `CLAUDE.md` (2,538 lines) - Main living document ✅
  - `PRD.md` - Product requirements
  - `LIVEKIT.md` - LiveKit integration patterns
  - `DATABASE.md` - Database schema reference
  - `CONTRIBUTING.md` - Developer workflow (placeholder)
  - `TROUBLESHOOTING.md` - Common issues
  - `DEPLOYMENT.md` - Deployment guide (placeholder)

- **API Documentation** (`docs/api/` - 5 files):
  - `README.md` - API overview
  - `authentication.md` - Auth flows
  - `feedback-polling-examples.md` - Feedback API examples
  - `insights-endpoint.md` - Insights API specs
  - `feedback-polling-curl-examples.sh` - Test scripts

- **Development Docs** (`docs/development/` - 1 file):
  - `testing.md` - Testing guidelines

- **Architecture Decisions** (`docs/adr/` - 1 file):
  - `ADR-036-insights-api-caching.md` - Recent ADR

- **Other Active Docs** (`docs/` root - 3 files):
  - `LIVEKIT_DEBUGGING.md` - LiveKit troubleshooting
  - `google-sheets-cron-setup.md` - Cron setup guide
  - `cron-jobs-quick-reference.md` - Quick reference
  - `openapi.yaml` - OpenAPI specification

#### Duplicate/Redundant Files (Remove/Archive)

**Root-level duplicates** (50 files total):

1. **Deployment Guides** (multiple versions):
   - `DEPLOYMENT.md` (root) - Duplicate of `.claude/DEPLOYMENT.md`
   - `DEPLOY-NOW.md` - Quick deploy guide
   - `VERCEL-SETUP-SUMMARY.md` - Vercel setup
   - `QUICKSTART-DEPLOY.md` - Another deploy guide

2. **Implementation Summaries** (obsolete after feature completion):
   - `IMPLEMENTATION_COMPLETE.md`
   - `IMPLEMENTATION_GUIDE.md`
   - `DATABASE_INTEGRATION_SUMMARY.md`
   - `QUESTION_BANK_IMPLEMENTATION.md`
   - `QUESTION_POOL_INTEGRATION_SUMMARY.md`
   - `TRANSCRIPT_FIX_REPORT.md`
   - `AGENT_GREETING_SUMMARY.md`
   - `AGENT_GREETING_IMPLEMENTATION.md`
   - `AGENT_GREETING_DEPLOYMENT.md`
   - `AGENT_GREETING_FIX.md`
   - `SETUP_SUMMARY.md`
   - `SETTINGS_PAGE_SUMMARY.md`
   - `TEAM_COMPLETION_REPORT.md`
   - `P1-005-COMPLETION-REPORT.md`

3. **Investigation/Debug Reports** (obsolete):
   - `INVESTIGATION_REPORT.md`
   - `INVESTIGATION_SUMMARY.md`
   - `ROOT_CAUSE_ANALYSIS.md`
   - `SIDEBAR_DEBUG_REPORT.md`
   - `debug_sidebar.md`
   - `README_INVESTIGATION.md`
   - `BACKEND_INTEGRATION_TEST_REPORT.md`
   - `UX_REVIEW_REPORT.md`
   - `ISSUES_SUMMARY.md`
   - `SOLUTION_SUMMARY.md`
   - `BEFORE_AFTER_COMPARISON.md`

4. **Setup/Configuration Guides** (consolidate):
   - `GOOGLE_SHEETS_SETUP.md`
   - `INNGEST_SETUP.md`
   - `CRON_SETUP_SUMMARY.md`
   - `SYNC_SETUP_SUMMARY.md`
   - `ALTERNATIVE_SETUP.md`
   - `SIMPLIFIED_SETUP_PROPOSAL.md`
   - `CLEANUP_SERVICE_ACCOUNTS.md`

5. **Testing Documentation** (consolidate):
   - `TEST_SUMMARY.md`
   - `TEST_INSTRUCTIONS.md`
   - `test_sidebar_navigation.md`

6. **Quick Fixes** (obsolete):
   - `QUICK_FIX_API_KEY.md`
   - `QUICK_FIX_GUIDE.md`

7. **Miscellaneous** (evaluate):
   - `SUMMARY.md` - Generic summary
   - `INDEX.md` - Archive index
   - `DOCUMENTATION_CONSOLIDATION_SUMMARY.md` - Previous consolidation attempt
   - `DOCUMENTATION_CONSOLIDATION_ANALYSIS.md` - Previous analysis
   - `EXPANDED_MAPPINGS.md`
   - `APPLY_RLS_POLICIES.md`

#### Archive Directory (`archive/2025-11/`)

Contains historical implementation logs and checkpoints - **keep but don't modify**

#### Agent Documentation (`agent/`)

- `README.md` - Agent setup
- `DEPLOY_DEMO.md` - Demo agent deployment
- `DEPLOYMENT.md` - Main agent deployment
- `DEPLOYMENT_SUMMARY.md` - Deployment summary
- `QUESTION_BANK_INTEGRATION.md` - Q&A integration

---

## Proposed New Structure

```
/
├── .claude/                          # Core living documentation (primary source of truth)
│   ├── CLAUDE.md                     # Main operational document (KEEP - already correct location)
│   ├── PRD.md                        # Product requirements (KEEP)
│   ├── LIVEKIT.md                    # LiveKit patterns (KEEP)
│   ├── DATABASE.md                   # Database reference (KEEP)
│   ├── CONTRIBUTING.md               # Enhanced with doc standards (UPDATE)
│   ├── TROUBLESHOOTING.md            # Common issues (KEEP)
│   └── DEPLOYMENT.md                 # High-level deployment (UPDATE)
│
├── docs/                             # Structured documentation by domain
│   ├── README.md                     # Documentation index (NEW)
│   │
│   ├── architecture/                 # Architecture & design decisions
│   │   ├── README.md                 # Architecture overview (NEW)
│   │   ├── system-design.md          # System architecture diagrams (NEW)
│   │   ├── data-flow.md              # Data flow patterns (NEW)
│   │   └── adrs/                     # Architecture Decision Records
│   │       ├── README.md             # ADR index (NEW)
│   │       ├── ADR-001-to-026.md     # Extract from CLAUDE.md (NEW)
│   │       └── ADR-036-insights-api-caching.md (MOVE from docs/adr/)
│   │
│   ├── api/                          # API specifications
│   │   ├── README.md                 # KEEP & ENHANCE (add endpoint listing)
│   │   ├── authentication.md         # KEEP
│   │   ├── feedback-polling-examples.md  # KEEP
│   │   ├── insights-endpoint.md      # KEEP
│   │   ├── openapi.yaml              # MOVE from docs/
│   │   └── scripts/                  # NEW subfolder
│   │       └── feedback-polling-curl-examples.sh  # MOVE
│   │
│   ├── development/                  # Developer guides
│   │   ├── README.md                 # Dev guide index (NEW)
│   │   ├── setup.md                  # Complete setup guide (CONSOLIDATE)
│   │   ├── testing.md                # KEEP & ENHANCE
│   │   ├── debugging.md              # NEW (LiveKit debugging + general patterns)
│   │   └── workflows.md              # NEW (git workflow, deployment workflow)
│   │
│   ├── deployment/                   # Deployment guides (NEW FOLDER)
│   │   ├── README.md                 # Deployment overview (NEW)
│   │   ├── vercel.md                 # Vercel deployment (CONSOLIDATE)
│   │   ├── livekit-agents.md         # Agent deployment (CONSOLIDATE)
│   │   ├── environment-variables.md  # Env var reference (NEW)
│   │   └── quickstart.md             # Quick deploy checklist (CONSOLIDATE)
│   │
│   ├── features/                     # Feature-specific docs (NEW FOLDER)
│   │   ├── README.md                 # Features index (NEW)
│   │   ├── authentication.md         # Auth feature deep dive (NEW)
│   │   ├── interview-session.md      # Interview flow (NEW)
│   │   ├── feedback-engine.md        # Feedback system (NEW)
│   │   ├── question-bank.md          # Question bank (NEW)
│   │   └── dashboard.md              # Dashboard features (NEW)
│   │
│   ├── integrations/                 # Third-party integrations (NEW FOLDER)
│   │   ├── README.md                 # Integrations overview (NEW)
│   │   ├── livekit.md                # MOVE from .claude/LIVEKIT.md
│   │   ├── supabase.md               # Supabase integration (NEW)
│   │   ├── google-sheets.md          # CONSOLIDATE from root
│   │   ├── inngest.md                # CONSOLIDATE from root
│   │   └── cron-jobs.md              # CONSOLIDATE from docs/
│   │
│   └── templates/                    # Documentation templates (NEW FOLDER)
│       ├── README.md                 # Template usage guide (NEW)
│       ├── FEATURE_TEMPLATE.md       # Feature documentation template (NEW)
│       ├── ADR_TEMPLATE.md           # ADR template (NEW)
│       ├── API_ENDPOINT_TEMPLATE.md  # API doc template (NEW)
│       └── TROUBLESHOOTING_TEMPLATE.md  # Troubleshooting template (NEW)
│
├── agent/                            # Agent-specific docs (KEEP AS-IS)
│   ├── README.md                     # Agent overview
│   ├── DEPLOY_DEMO.md                # Demo deployment
│   └── DEPLOYMENT.md                 # Main deployment
│
├── archive/                          # Historical docs (KEEP AS-IS)
│   ├── 2025-11/                      # Month-based archive
│   │   ├── implementation-logs/      # Implementation summaries
│   │   ├── checkpoints/              # Project checkpoints
│   │   └── workstreams/              # Workstream completion docs
│   └── INDEX.md                      # Archive index
│
└── README.md                         # Project README (KEEP & ENHANCE)
```

---

## Critical Issues Addressed

### Issue 1: No CLAUDE.md at Root

**Status**: ✅ CORRECT - CLAUDE.md should stay in `.claude/`

- According to ADR-005, CLAUDE.md was intentionally moved from root to `.claude/`
- The context shows both CLAUDE.md files, but only one exists (in `.claude/`)
- **Action**: No changes needed - `.claude/CLAUDE.md` is the single source of truth

### Issue 2: 26 ADRs Buried in CLAUDE.md

**Problem**: Architecture decisions (ADR-001 through ADR-026) are embedded in CLAUDE.md
**Solution**:

- Extract all ADRs into individual files in `docs/architecture/adrs/`
- Keep ADR summary/index in CLAUDE.md with links
- Benefits: easier to reference, link to, and track changes

### Issue 3: 50+ Root-Level Files

**Problem**: No clear structure for temporary/implementation docs
**Solution**:

- Move completed feature docs to `archive/2025-11/implementation-logs/`
- Consolidate setup guides into `docs/development/` and `docs/deployment/`
- Remove duplicate deployment guides (keep one consolidated version)

### Issue 4: Scattered Integration Docs

**Problem**: LiveKit, Supabase, Google Sheets docs in different locations
**Solution**: Create `docs/integrations/` with standardized structure

### Issue 5: No Documentation Templates

**Problem**: No guidance on where/how to document new features
**Solution**: Create `docs/templates/` with clear templates and usage guide

---

## Implementation Plan

### Phase 1: Create New Structure (Low Risk)

1. Create new folder structure in `docs/`
2. Create README.md files for each new folder
3. Create documentation templates
4. **No deletions yet** - just setup

### Phase 2: Move Active Documentation (Medium Risk)

1. Move API docs into organized structure
2. Move development docs
3. Consolidate deployment guides
4. Extract ADRs from CLAUDE.md
5. Update all cross-references

### Phase 3: Archive Obsolete Files (Reversible)

1. Move completed implementation summaries to archive
2. Move investigation reports to archive
3. Archive quick fixes and debug reports
4. Update archive INDEX.md

### Phase 4: Update Core Files (Critical)

1. Update CLAUDE.md with new documentation map
2. Enhance CONTRIBUTING.md with documentation standards
3. Update README.md with new structure
4. Create docs/README.md as documentation hub

### Phase 5: Validation (Quality Check)

1. Verify all links work
2. Check no broken references
3. Ensure CLAUDE.md accurately reflects new structure
4. Test that all critical docs are accessible

---

## Files to Remove Permanently

**After archiving, these files can be deleted** (post-archive validation):

1. Duplicate deployment guides (keep consolidated version)
2. "QUICK*FIX*\*.md" files (solved issues)
3. Old backup files (`.backup` suffix)
4. Empty or placeholder files

**DO NOT DELETE**:

- Archive directory contents
- Active agent documentation
- Any file referenced in CLAUDE.md
- Component READMEs (they're feature-specific)

---

## Documentation Standards (for CONTRIBUTING.md)

### Where to Put Documentation

| Documentation Type     | Location                                  | Example                       |
| ---------------------- | ----------------------------------------- | ----------------------------- |
| Architecture decisions | `docs/architecture/adrs/ADR-XXX-title.md` | ADR-027-websocket-strategy.md |
| API endpoints          | `docs/api/`                               | feedback-polling-examples.md  |
| Feature deep dives     | `docs/features/`                          | authentication.md             |
| Setup/dev guides       | `docs/development/`                       | setup.md, testing.md          |
| Deployment guides      | `docs/deployment/`                        | vercel.md, quickstart.md      |
| Integration guides     | `docs/integrations/`                      | livekit.md, supabase.md       |
| Troubleshooting        | `.claude/TROUBLESHOOTING.md`              | (append to existing)          |
| Temporary/WIP docs     | `docs/wip/` (create if needed)            | feature-xyz-notes.md          |

### When to Update Documentation

**Always update when**:

- Adding new architecture decisions → Create ADR
- Adding new API endpoints → Update `docs/api/README.md` + endpoint doc
- Changing system architecture → Update `docs/architecture/system-design.md`
- Completing a phase → Update CLAUDE.md iteration log

**Consider updating when**:

- Fixing bugs → Add to TROUBLESHOOTING.md if issue is non-obvious
- Refactoring → Update relevant feature doc if behavior changes
- Optimizing → Update ADR if architectural implications

### Documentation Lifecycle

1. **Planning**: Create design doc in `docs/wip/`
2. **Implementation**: Update relevant docs as you build
3. **Completion**: Move WIP to appropriate permanent location
4. **Iteration Log**: Add summary to CLAUDE.md
5. **Archive**: Move implementation summaries to `archive/YYYY-MM/`

---

## Migration Checklist

### Pre-Migration

- [ ] Review this plan with team
- [ ] Backup current state (git commit)
- [ ] Create new folder structure
- [ ] Create all README.md files

### Migration

- [ ] Phase 1: Create structure
- [ ] Phase 2: Move active docs
- [ ] Phase 3: Archive obsolete files
- [ ] Phase 4: Update core files
- [ ] Phase 5: Validation

### Post-Migration

- [ ] Update CLAUDE.md with new doc map
- [ ] Update CONTRIBUTING.md with standards
- [ ] Create templates in `docs/templates/`
- [ ] Test all links and cross-references
- [ ] Commit changes with detailed message

---

## Success Criteria

✅ **Organizational Success**:

- All docs have clear, logical locations
- No duplicate documentation
- Clear templates for future documentation
- Less than 10 files at project root (excluding config files)

✅ **Usability Success**:

- New developer can find setup guide in <30 seconds
- API documentation is centralized and comprehensive
- ADRs are easily browsable and linkable
- CLAUDE.md remains under 3,000 lines (extract content to separate docs)

✅ **Maintainability Success**:

- Clear standards in CONTRIBUTING.md
- Templates guide consistent documentation
- Archive prevents clutter without losing history
- Documentation map in CLAUDE.md stays current

---

## Risks & Mitigations

| Risk                        | Impact | Mitigation                                       |
| --------------------------- | ------ | ------------------------------------------------ |
| Breaking links in CLAUDE.md | High   | Update all references before moving files        |
| Losing important context    | Medium | Archive, don't delete; review before archiving   |
| Confusion during transition | Medium | Create docs/README.md first as navigation hub    |
| References from code        | Low    | Search codebase for doc references before moving |

---

## Next Steps

1. **Review this plan** - Ensure alignment with project needs
2. **Create branch** - `docs-reorganization`
3. **Execute Phase 1** - Low-risk structure creation
4. **Validate incrementally** - Test after each phase
5. **Update CLAUDE.md** - Final step to reflect new structure

---

**Estimated Time**: 3-4 hours for complete reorganization
**Reversibility**: High (all changes are moves, not deletions)
**Risk Level**: Low-Medium (careful validation at each step)
