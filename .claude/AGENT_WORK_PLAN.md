# Agent Work Plan: Feedback & Insights Implementation

**Created**: 2025-11-08
**Sprint Duration**: 8 weeks (4 phases × 2 weeks each)
**Total Tickets**: 25
**Recommended Team**: 3-5 agents working in parallel

---

## **Quick Start Guide**

### **For You (Project Manager)**

1. **Week 1**: Start with **P1-001** (Database Schema) - This is the blocker for everything
   - Assign to your most experienced backend developer agent
   - Critical path ticket - review and approve quickly

2. **Week 2**: Launch **3 parallel workstreams**:
   - Backend Agent: P1-002, P1-003
   - API Agent: P1-005
   - UI Agent: P1-006, P1-007

3. **Week 3+**: Follow the weekly execution plan in `DEPENDENCY_MAP.md`

### **For Agents**

**To pick up a ticket**:
1. Open `IMPLEMENTATION_TICKETS.md`
2. Find your ticket (e.g., "Ticket P1-001")
3. Check **Dependencies** - ensure all blocker tickets are complete
4. Review **Acceptance Criteria** - these are your done conditions
5. Follow **Implementation** code snippets - these are starter templates
6. Write **Tests** as specified
7. Mark ticket as complete when all acceptance criteria ✅

---

## **Phase-by-Phase Execution**

### **Phase 1: Foundation (Weeks 1-2)**

**Goal**: Eliminate "no feedback" scenarios and handle edge cases

**Start Here**:
```bash
# Ticket P1-001: Database Schema Updates
cd /Users/REDACTED/conductor/meelni-prep/.conductor/vancouver
# Review: IMPLEMENTATION_TICKETS.md lines 10-120
# Agent Type: Developer (Backend)
# Blocking: ALL other tickets
# Est. Time: 2-3 days
```

**Then Parallelize** (Week 2):
- **Backend Agent**: P1-002 (Validation) → P1-003 (Inngest) → P1-004 (Session End API)
- **API Agent**: P1-005 (Feedback Polling)
- **UI Agent**: P1-006 (Loading UI) + P1-007 (Edge Cases)

**Deliverables by Week 2 End**:
- [ ] Session validation logic working
- [ ] Inngest job queue processing feedback
- [ ] Feedback polling API returns correct statuses
- [ ] Enhanced loading screen with progress bar
- [ ] Edge case UIs (too short, partial, error)

**How to Coordinate**:
```bash
# Create a shared Slack/Discord channel or GitHub project
# Daily standup (async):
# - What did you complete yesterday?
# - What are you working on today?
# - Any blockers?

# Example:
# Backend Agent: "Completed P1-001 (schema). Starting P1-002 (validation)."
# API Agent: "Blocked on P1-001. Will start P1-005 once schema is merged."
```

---

### **Phase 2: Insights MVP (Weeks 3-4)**

**Goal**: Provide trend tracking and competency insights for returning users

**Start Here**:
```bash
# Ticket P2-001: User Insights Table Schema
# Review: IMPLEMENTATION_TICKETS.md lines 550-650
# Agent Type: Developer (Backend)
# Blocking: P2-002, P2-003, P2-004, P2-005
# Est. Time: 1-2 days
```

**Then Parallelize** (Week 3-4):
- **Backend Agent**: P2-002 (Aggregation Engine) → P2-003 (Inngest Worker)
- **API Agent**: P2-004 (Insights API)
- **UI Agent**: P2-005 (Dashboard UI)
- **QA Agent**: M-001 (Data Backfill), Q-001 (E2E Tests)

**Deliverables by Week 4 End**:
- [ ] User insights table with pre-aggregated data
- [ ] Insights API returning analytics in <500ms
- [ ] Dashboard showing progress trends and competency heatmap
- [ ] Existing users' data backfilled
- [ ] E2E tests covering feedback → insights flow

---

### **Phase 3: Smart Recommendations (Weeks 5-6)**

**Goal**: Proactive guidance on what to practice next

**Parallelize from Start**:
- **Backend Agent**: P3-001 (Recommendation Engine)
- **UI Agent 1**: P3-002 (Action Plan UI)
- **UI Agent 2**: P3-003 (Streak Tracking)

**Then Integrate**:
- **UI Agent**: P3-004 (Dashboard Integration)

**Deliverables by Week 6 End**:
- [ ] Recommendation engine generating personalized suggestions
- [ ] Action plan component with pre-filled CTAs
- [ ] Streak tracking with badges
- [ ] Recommendations integrated into insights dashboard

---

### **Phase 4: Advanced Features (Weeks 7-8)**

**Goal**: Power user features and performance optimization

**Parallelize (All Independent)**:
- **UI Agent**: P4-001 (Advanced Analytics Tab)
- **API Agent**: P4-002 (Export & Share)
- **Backend Agent**: P4-003 (Performance Optimization)

**Final Polish**:
- **All Agents**: P4-004 (Error Handling & Monitoring)
- **QA Agent**: Q-001 (Final E2E Tests)
- **Writer Agent**: D-001, D-002 (Docs)

**Deliverables by Week 8 End**:
- [ ] Advanced analytics for 10+ session users
- [ ] CSV export and shareable progress images
- [ ] P95 API response time <500ms
- [ ] Comprehensive error handling
- [ ] Complete documentation

---

## **How to Assign Tickets to Agents**

### **Option 1: Use Claude Code Agent System**

```bash
# Example: Assigning P1-001 to a developer agent
# In your workspace:

# 1. Create a new task for the agent
agent-task create \
  --agent developer \
  --ticket P1-001 \
  --description "Database Schema Updates for Session Validation" \
  --files-to-modify "lib/db/schema.ts, drizzle.config.ts" \
  --acceptance-criteria "See IMPLEMENTATION_TICKETS.md lines 10-120"

# 2. Agent works on task autonomously
# 3. Agent reports back with PR or completion status
```

### **Option 2: Manual Assignment**

```bash
# Create GitHub issues from tickets
gh issue create \
  --title "[P1-001] Database Schema Updates" \
  --body "$(cat IMPLEMENTATION_TICKETS.md | sed -n '10,120p')" \
  --assignee <agent-username> \
  --label "phase-1,backend,p0"

# Track progress in GitHub Project board
```

### **Option 3: Conductor Parallel Agents**

Since you're using Conductor, you can launch multiple agents in parallel:

```bash
# Week 1: Start with schema (blocking ticket)
# Launch 1 developer agent

# Week 2: Launch 3 parallel agents once P1-001 is done
# Agent 1 (Backend): P1-002, P1-003, P1-004
# Agent 2 (API): P1-005
# Agent 3 (UI): P1-006, P1-007

# Each agent reads its assigned ticket from IMPLEMENTATION_TICKETS.md
# and executes autonomously
```

---

## **Coordination Checkpoints**

### **Week 1 End: Schema Review**
- **Check**: P1-001 merged and deployed
- **Review**: Database migration ran successfully in dev
- **Decision**: Approve to proceed with Week 2 parallelization

### **Week 2 End: Foundation Review**
- **Check**: All P1-* tickets complete
- **Demo**: End-to-end flow (session end → feedback generation → feedback display)
- **Decision**: Approve to proceed with Phase 2

### **Week 4 End: Insights MVP Review**
- **Check**: All P2-* tickets complete
- **Demo**: Insights dashboard with real data
- **Decision**: Approve backfill for production (M-001)

### **Week 6 End: Recommendations Review**
- **Check**: All P3-* tickets complete
- **Demo**: Personalized recommendations and streak tracking
- **Decision**: Approve to proceed with Phase 4

### **Week 8 End: Final Launch Review**
- **Check**: All tickets complete
- **QA**: Final E2E test suite passing
- **Docs**: API and user documentation complete
- **Decision**: Deploy to production

---

## **Critical Success Factors**

### **1. Clear Dependencies**
- **Before starting any ticket**, check the "Dependencies" section
- Don't start P1-004 until P1-002 and P1-003 are done
- Use the dependency graph in `DEPENDENCY_MAP.md`

### **2. Acceptance Criteria as Definition of Done**
- Each ticket has checkbox acceptance criteria
- ALL checkboxes must be ✅ before marking ticket complete
- Code review should verify all criteria met

### **3. Testing is Mandatory**
- Every ticket specifies required tests
- Unit tests for logic, integration tests for APIs, E2E for flows
- No ticket is "done" without tests

### **4. Documentation as You Go**
- Update CLAUDE.md with new ADRs at end of each phase
- API docs (D-002) should be written as endpoints are built
- Don't leave all docs to the end

### **5. Communication Protocol**
- **Daily async updates** in shared channel
- **Weekly sync meetings** at phase boundaries
- **Blockers escalated immediately** (don't wait days)

---

## **Troubleshooting Guide**

### **Problem: Agent stuck on a ticket**

**Solution**:
1. Check if dependencies are actually complete (often the blocker)
2. Review acceptance criteria - is something unclear?
3. Look at similar patterns in existing codebase
4. Ask product manager for clarification
5. Consider pairing with another agent (mob programming)

### **Problem: Ticket estimates are way off**

**Solution**:
1. Break ticket into smaller subtasks (e.g., P1-003 could be 3 tickets)
2. Adjust sprint timeline if multiple tickets overrun
3. Reassign work to balance load across agents

### **Problem: Tests are failing**

**Solution**:
1. Don't move to next ticket until tests pass (enforce quality gate)
2. Use `IMPLEMENTATION_TICKETS.md` test section for guidance
3. Check existing test patterns in `__tests__/` directories
4. QA agent can help debug flaky tests

### **Problem: Merge conflicts**

**Solution**:
1. Pull latest from main before starting work
2. Coordinate with other agents if working on same file
3. Small, frequent PRs (daily) reduce conflict likelihood
4. Use feature flags to merge incomplete features

---

## **Agent Skill Matrix**

### **Backend Developer Agent**
**Best for**:
- Database schema changes (P1-001, P2-001)
- Business logic (P1-002, P2-002, P3-001)
- Background jobs (P1-003, P2-003)
- Performance optimization (P4-003)

**Required Skills**: TypeScript, Drizzle ORM, PostgreSQL, Inngest

### **API Developer Agent**
**Best for**:
- REST endpoints (P1-004, P1-005, P2-004)
- Request validation (Zod schemas)
- Response formatting
- Rate limiting and caching

**Required Skills**: Next.js API routes, Zod, HTTP status codes

### **UI/UX Developer Agent**
**Best for**:
- React components (P1-006, P1-007, P2-005)
- Framer Motion animations
- Recharts visualizations
- Responsive design

**Required Skills**: React, TypeScript, Tailwind CSS, Recharts, Framer Motion

### **QA Engineer Agent**
**Best for**:
- E2E test suites (Q-001)
- Data backfill scripts (M-001)
- Integration testing
- Load testing

**Required Skills**: Playwright, Jest/Vitest, SQL, shell scripting

### **Technical Writer Agent**
**Best for**:
- CLAUDE.md updates (D-001)
- API documentation (D-002)
- Architecture decision records
- User-facing guides

**Required Skills**: Markdown, API documentation, technical writing

---

## **Success Checklist (Copy to Your Project)**

```markdown
## Phase 1: Foundation ✅
- [ ] P1-001: Database Schema Updates
- [ ] P1-002: Session Validation Utility Functions
- [ ] P1-003: Inngest Setup and Feedback Generation Worker
- [ ] P1-004: Session End API Endpoint
- [ ] P1-005: Feedback Polling API Endpoint
- [ ] P1-006: Enhanced Feedback Loading UI Component
- [ ] P1-007: Edge Case UI Components

## Phase 2: Insights MVP ✅
- [ ] P2-001: User Insights Table Schema
- [ ] P2-002: Insights Aggregation Engine
- [ ] P2-003: Inngest Insights Update Worker
- [ ] P2-004: Insights API Endpoint
- [ ] P2-005: Analytics Dashboard Section - Overview Tab

## Phase 3: Smart Recommendations ✅
- [ ] P3-001: Recommendation Engine Core Logic
- [ ] P3-002: Action Plan Component
- [ ] P3-003: Streak Tracking System
- [ ] P3-004: Integrate Recommendations into Insights Dashboard

## Phase 4: Advanced Features ✅
- [ ] P4-001: Advanced Insights Tab (10+ Sessions)
- [ ] P4-002: Export & Share Functionality
- [ ] P4-003: Performance Optimization - Query Tuning
- [ ] P4-004: Error Handling & Monitoring Setup

## Cross-Cutting ✅
- [ ] M-001: Data Backfill for Existing Users
- [ ] Q-001: End-to-End Testing Suite
- [ ] D-001: Update CLAUDE.md with New Features
- [ ] D-002: API Documentation
```

---

## **Next Steps**

1. **Review all documents**:
   - `IMPLEMENTATION_TICKETS.md` - Detailed ticket specifications
   - `DEPENDENCY_MAP.md` - Visual dependency graph
   - This file (`AGENT_WORK_PLAN.md`) - Execution guide

2. **Set up your team**:
   - Decide on 3-5 agents
   - Assign skill-based roles (backend, API, UI, QA, writer)
   - Create communication channels

3. **Start Week 1**:
   - Assign P1-001 to your best backend developer
   - Set up daily check-ins
   - Plan Week 2 parallelization

4. **Track progress**:
   - Use GitHub Project, Jira, or simple spreadsheet
   - Update completion status daily
   - Review at end of each phase

5. **Ship iteratively**:
   - Deploy Phase 1 to staging after Week 2
   - Deploy Phase 2 to production after Week 4
   - Gather user feedback between phases

---

**Good luck! 🚀**

Questions? Check the troubleshooting section or review the Product Manager's PRD in `IMPLEMENTATION_TICKETS.md` (lines 1-400).
