# Feedback & Insights Dependency Map

This document shows which tickets can be worked on in parallel and which have dependencies.

---

## **Visual Dependency Graph**

```
PHASE 1: FOUNDATION (Weeks 1-2)
================================

P1-001 (Schema Updates) ──┬──> P1-002 (Validation Utils) ──┬──> P1-004 (Session End API)
                          │                                 │
                          └──> P1-003 (Inngest Setup) ─────┤
                          │                                 │
                          └──> P1-005 (Feedback Polling API)│
                                                            │
                                                            ├──> P1-006 (Loading UI)
                                                            │
                                                            └──> P1-007 (Edge Case UIs)

PARALLELIZATION STRATEGY:
- Start: P1-001 (blocker for everything)
- Wave 2: P1-002, P1-003, P1-005 (can run in parallel after P1-001)
- Wave 3: P1-004, P1-006, P1-007 (can run in parallel after Wave 2)


PHASE 2: INSIGHTS MVP (Weeks 3-4)
==================================

P2-001 (User Insights Schema) ──┬──> P2-002 (Aggregation Engine) ──┬──> P2-003 (Inngest Worker)
                                 │                                   │
                                 └──> P2-004 (Insights API) ─────────┤
                                                                     │
                                                                     └──> P2-005 (Dashboard UI)

PARALLELIZATION STRATEGY:
- Start: P2-001 (blocker)
- Wave 2: P2-002, P2-004 (can run in parallel)
- Wave 3: P2-003, P2-005 (can run in parallel after Wave 2)


PHASE 3: SMART RECOMMENDATIONS (Weeks 5-6)
===========================================

P2-002 ──> P3-001 (Recommendation Engine) ──┬──> P3-002 (Action Plan UI)
                                             │                │
P2-001 ──> P3-003 (Streak Tracking) ────────┼────────────────┤
                                             │                │
                                             └────────────────┴──> P3-004 (Dashboard Integration)

PARALLELIZATION STRATEGY:
- Wave 1: P3-001, P3-003 (can run in parallel, different dependencies)
- Wave 2: P3-002 (depends on P3-001)
- Wave 3: P3-004 (integrates both, waits for all)


PHASE 4: ADVANCED FEATURES (Weeks 7-8)
=======================================

P2-005 ──┬──> P4-001 (Advanced Analytics Tab)
         │
         ├──> P4-002 (Export & Share)
         │
         └──> P4-003 (Performance Optimization)

ALL PHASES ──> P4-004 (Error Handling & Monitoring)

PARALLELIZATION STRATEGY:
- P4-001, P4-002, P4-003 can all run in parallel (independent features)
- P4-004 should be last (wraps up all error handling)


CROSS-CUTTING TASKS
====================

M-001 (Data Backfill) ──> Requires: P2-001, P2-002 ──> Run before P2 launch

Q-001 (E2E Testing) ──> Requires: All Phase 1-2 tickets ──> Run before Phase 2 launch

D-001 (CLAUDE.md Update) ──> Requires: All Phase 1-2 tickets ──> Run at end of each phase

D-002 (API Docs) ──> Requires: All API tickets ──> Run at end of Phase 1 & 2
```

---

## **Parallel Workstreams for Maximum Velocity**

### **Workstream A: Backend Core**
**Agent Type**: Developer (Backend focus)
**Tickets**:
1. P1-001 → P1-002 → P1-003 → P1-004 → P2-001 → P2-002 → P2-003 → P3-001 → P4-003

**Duration**: ~6 weeks
**Priority**: Critical path

---

### **Workstream B: API Layer**
**Agent Type**: Developer (API focus)
**Tickets**:
1. P1-005 (can start after P1-001) → P2-004 → P4-002 (CSV export)

**Duration**: ~3 weeks
**Priority**: High (parallel to Workstream A)

---

### **Workstream C: UI/UX**
**Agent Type**: Developer (Frontend focus)
**Tickets**:
1. P1-006, P1-007 (can start after P1-004/P1-005) → P2-005 → P3-002 → P3-004 → P4-001

**Duration**: ~5 weeks
**Priority**: High (parallel to Workstream A)

---

### **Workstream D: Features & Polish**
**Agent Type**: Developer (Full-stack)
**Tickets**:
1. P3-003 (Streak Tracking) → P4-004 (Error Handling)

**Duration**: ~2 weeks
**Priority**: Medium (can fill gaps)

---

### **Workstream E: QA & Documentation**
**Agent Type**: QA/Technical Writer
**Tickets**:
1. M-001 (Data Backfill) - Week 3
2. Q-001 (E2E Tests) - Week 4
3. D-001, D-002 (Docs) - Ongoing

**Duration**: ~2 weeks
**Priority**: Medium (runs in parallel with Phase 3-4)

---

## **Weekly Execution Plan**

### **Week 1: Foundation Start**
| Workstream | Tickets | Agent |
|------------|---------|-------|
| A (Backend) | P1-001 | Developer |
| B (API) | Wait for P1-001 | - |
| C (UI) | Wait for P1-004 | - |

**Blockers**: P1-001 must complete first
**Deliverable**: Database schema updated

---

### **Week 2: Foundation Complete**
| Workstream | Tickets | Agent |
|------------|---------|-------|
| A (Backend) | P1-002, P1-003, P1-004 | Developer |
| B (API) | P1-005 | Developer |
| C (UI) | P1-006, P1-007 | Developer (UI) |

**Parallelization**: 3 agents can work simultaneously
**Deliverable**: Session end API, feedback polling, loading UIs

---

### **Week 3: Insights MVP Start**
| Workstream | Tickets | Agent |
|------------|---------|-------|
| A (Backend) | P2-001, P2-002 | Developer |
| B (API) | P2-004 | Developer |
| C (UI) | Wait for P2-004 | - |
| E (QA) | M-001 (Backfill) | Developer |

**Parallelization**: 3 agents
**Deliverable**: User insights schema, aggregation engine, backfill

---

### **Week 4: Insights MVP Complete**
| Workstream | Tickets | Agent |
|------------|---------|-------|
| A (Backend) | P2-003 | Developer |
| C (UI) | P2-005 | Developer (UI) |
| E (QA) | Q-001 | QA Engineer |

**Parallelization**: 3 agents
**Deliverable**: Insights dashboard live, E2E tests

---

### **Week 5: Smart Recommendations**
| Workstream | Tickets | Agent |
|------------|---------|-------|
| A (Backend) | P3-001 | Developer |
| C (UI) | P3-002 | Developer (UI) |
| D (Features) | P3-003 | Developer |

**Parallelization**: 3 agents
**Deliverable**: Recommendation engine, action plan UI, streak tracking

---

### **Week 6: Recommendations Complete**
| Workstream | Tickets | Agent |
|------------|---------|-------|
| C (UI) | P3-004 | Developer (UI) |
| E (Docs) | D-001, D-002 | Technical Writer |

**Parallelization**: 2 agents
**Deliverable**: Dashboard integration, updated docs

---

### **Week 7: Advanced Features**
| Workstream | Tickets | Agent |
|------------|---------|-------|
| C (UI) | P4-001 | Developer (UI) |
| B (API) | P4-002 | Developer |
| A (Backend) | P4-003 | Developer |

**Parallelization**: 3 agents (all independent)
**Deliverable**: Advanced analytics, export, performance optimization

---

### **Week 8: Polish & Launch**
| Workstream | Tickets | Agent |
|------------|---------|-------|
| D (Features) | P4-004 | Developer |
| E (QA) | Final E2E tests | QA Engineer |
| E (Docs) | Final doc updates | Technical Writer |

**Parallelization**: 3 agents
**Deliverable**: Production-ready system

---

## **Critical Path Analysis**

**Longest Path** (Critical Path):
```
P1-001 → P1-002 → P1-003 → P1-004 → P2-001 → P2-002 → P2-003 → P2-005 → P3-001 → P3-004 → P4-001 → P4-004
```

**Duration**: 8 weeks (matches sprint timeline)

**Fastest Possible** (with perfect parallelization):
- Week 1: P1-001
- Week 2: P1-002, P1-003, P1-004, P1-005, P1-006, P1-007 (6 agents)
- Week 3: P2-001, P2-002, P2-004, M-001 (4 agents)
- Week 4: P2-003, P2-005, Q-001 (3 agents)
- Week 5: P3-001, P3-002, P3-003 (3 agents)
- Week 6: P3-004, D-001, D-002 (3 agents)
- Week 7: P4-001, P4-002, P4-003 (3 agents)
- Week 8: P4-004, Final QA, Final Docs (3 agents)

**Result**: 8 weeks (unchanged, but with 3-6 agents working in parallel)

---

## **Agent Assignment Recommendations**

### **Phase 1 (Weeks 1-2)**
- **3 Developers** (1 backend, 1 API, 1 UI)
- **Total**: 3 agents

### **Phase 2 (Weeks 3-4)**
- **3 Developers** (1 backend, 1 API, 1 UI)
- **1 QA Engineer** (backfill & E2E tests)
- **Total**: 4 agents

### **Phase 3 (Weeks 5-6)**
- **3 Developers** (1 backend, 2 UI)
- **1 Technical Writer** (docs)
- **Total**: 4 agents

### **Phase 4 (Weeks 7-8)**
- **3 Developers** (1 backend, 1 API, 1 UI)
- **1 QA Engineer** (final testing)
- **1 Technical Writer** (final docs)
- **Total**: 5 agents

---

## **Risk Mitigation**

**Blockers to Watch**:
1. **P1-001** (Week 1): If schema migration fails, entire project delayed
   - Mitigation: Test in dev first, have rollback plan
2. **P2-002** (Week 3): Complex aggregation logic, potential performance issues
   - Mitigation: Benchmark early, optimize queries before UI work
3. **M-001** (Week 3): Backfill may fail for edge cases
   - Mitigation: Test on subset of users first, have manual fallback
4. **Q-001** (Week 4): E2E tests may be flaky
   - Mitigation: Write robust selectors, retry logic, mock slow APIs

**Dependencies to Manage**:
- Inngest setup (P1-003) blocks feedback generation (P1-004)
- User insights schema (P2-001) blocks everything in Phase 2
- Recommendation engine (P3-001) blocks action plan UI (P3-002)

**Coordination Points**:
- Week 2: Backend & API teams sync on session validation logic
- Week 4: Backend & UI teams sync on insights API contract
- Week 6: All teams sync for dashboard integration (P3-004)

---

## **Success Metrics per Phase**

### **Phase 1 Success**
- ✅ 0% sessions with valid transcripts have "no feedback" error
- ✅ <5% users abandon feedback loading page
- ✅ 92%+ session-to-feedback conversion rate

### **Phase 2 Success**
- ✅ Insights dashboard loads in <500ms
- ✅ 65% of multi-session users view Insights tab within 30 days
- ✅ 20%+ click-through on Focus Area drills

### **Phase 3 Success**
- ✅ 30% of users follow at least 1 recommendation
- ✅ Users with visible "Improving" trend have 35% higher return rate

### **Phase 4 Success**
- ✅ 60% of 10+ session users unlock Advanced tab
- ✅ 10% of power users export or share progress
- ✅ P95 API response time <500ms for all endpoints

---

## **Summary**

**Total Tickets**: 25 (7 Phase 1, 5 Phase 2, 4 Phase 3, 4 Phase 4, 5 cross-cutting)

**Total Effort**: 111 story points (~14 weeks for 1 developer, ~8 weeks with 3-5 developers)

**Recommended Team Size**:
- **Minimum**: 3 developers (backend, API, UI) - 8 weeks
- **Optimal**: 4 developers + 1 QA - 7 weeks
- **Maximum**: 5 developers + 1 QA + 1 writer - 6 weeks

**Critical Path**: 8 weeks (cannot be shortened due to sequential dependencies)

**Maximum Parallelization**: Up to 6 agents in Week 2, then 3-5 agents per week

**Suggested Execution**: Run 3-4 parallel workstreams (Backend, API, UI, QA/Docs) with weekly sync points
