# RALPH.md - Autonomous Coding Agent System

**Project**: Meelni - Real-Time AI Mock Interviews
**System**: Ralph Wiggum - Autonomous Development Loop
**Version**: 1.0.0
**Last Updated**: 2026-01-16

---

## Overview

Ralph is an autonomous coding agent loop that implements features story-by-story. It uses Claude Code to read a PRD (Product Requirements Document), implement user stories, run quality checks, and commit working code.

**Key Principle**: Each iteration is a fresh context. Memory persists only through:
- Git commits (code changes)
- `progress.txt` (learnings and patterns)
- `prd.json` (task status)
- `AGENTS.md` (reusable patterns)

---

## How It Works

```
┌─────────────────────────────────────────────────────────────┐
│                    Ralph Loop                                │
│                                                              │
│   ┌──────────┐    ┌──────────┐    ┌──────────┐             │
│   │  Read    │───▶│ Implement│───▶│  Test    │             │
│   │  PRD     │    │  Story   │    │  & Lint  │             │
│   └──────────┘    └──────────┘    └────┬─────┘             │
│                                        │                     │
│                   ┌────────────────────┼────────────────┐   │
│                   │                    ▼                │   │
│              ┌────┴───┐          ┌──────────┐           │   │
│              │ Retry  │◀─────────│  FAIL?   │           │   │
│              └────────┘          └────┬─────┘           │   │
│                                       │ PASS            │   │
│                                       ▼                 │   │
│                                 ┌──────────┐            │   │
│                                 │  Commit  │            │   │
│                                 └────┬─────┘            │   │
│                                      │                  │   │
│                                      ▼                  │   │
│   ┌──────────┐    ┌──────────┐    ┌──────────┐         │   │
│   │  Update  │◀───│  Update  │◀───│  Mark    │         │   │
│   │ progress │    │ AGENTS   │    │  Done    │         │   │
│   └──────────┘    └──────────┘    └──────────┘         │   │
│                                                          │   │
│   ┌──────────────────────────────────────────────────┐  │   │
│   │            All stories done?                      │  │   │
│   │  YES ──▶ Output <promise>COMPLETE</promise>       │  │   │
│   │  NO  ──▶ Next iteration                           │  │   │
│   └──────────────────────────────────────────────────┘  │   │
└─────────────────────────────────────────────────────────────┘
```

---

## File Structure

```
scripts/ralph/
├── ralph.sh           # Main bash loop (entry point)
├── prompt.md          # Instructions for each Claude iteration
├── prd.json           # Current PRD with user stories
├── prd.json.example   # Template for creating new PRDs
├── progress.txt       # Cumulative learnings across iterations
├── AGENTS.md          # Reusable patterns for future iterations
├── .last-branch       # Tracks previous branch for archiving
└── archive/           # Archived previous runs
    └── YYYY-MM-DD-branch-name/
        ├── progress.txt
        └── prd.json
```

---

## Quick Start

### 1. Create Your PRD

Copy the example and customize:

```bash
cp scripts/ralph/prd.json.example scripts/ralph/prd.json
```

Edit `prd.json` with your feature stories:

```json
{
  "name": "My Feature",
  "description": "What this feature does",
  "branchName": "ralph/my-feature",
  "userStories": [
    {
      "id": "US-001",
      "title": "First step",
      "description": "Detailed description",
      "acceptanceCriteria": [
        "Specific requirement 1",
        "Specific requirement 2",
        "npm run typecheck passes"
      ],
      "priority": 1,
      "passes": false,
      "notes": ""
    }
  ]
}
```

### 2. Run Ralph

```bash
# Make executable (first time only)
chmod +x scripts/ralph/ralph.sh

# Run with default 10 iterations
./scripts/ralph/ralph.sh

# Run with custom iteration limit
./scripts/ralph/ralph.sh 25
```

### 3. Monitor Progress

```bash
# Watch story status
cat scripts/ralph/prd.json | jq '.userStories[] | {id, passes}'

# View learnings
cat scripts/ralph/progress.txt

# Check commits
git log --oneline -10
```

---

## Writing Effective PRDs

### Story Sizing

Stories must fit in one Claude context window. Break large features into small, focused stories.

```
❌ TOO BIG:
"Build entire authentication system"

✅ RIGHT SIZE:
"Add password reset request form"
"Create password reset API endpoint"
"Add email template for password reset"
"Implement password reset confirmation page"
```

### Acceptance Criteria

Be explicit and testable:

```
❌ VAGUE:
"Users can update their profile"

✅ EXPLICIT:
- Form shows current name and email
- Name field is editable
- Save button calls PUT /api/user/profile
- Success shows toast notification
- Error shows error message
- npm run typecheck passes
- npm run build passes
```

### Priority Order

- `priority: 1` = Do first (usually database/schema)
- `priority: 2` = Do second (usually API routes)
- `priority: 3` = Do third (usually components)
- `priority: 4+` = Later (integration, polish)

---

## PRD Fields Reference

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Feature name |
| `description` | string | Feature overview |
| `branchName` | string | Git branch for this feature |
| `userStories` | array | List of stories |
| `userStories[].id` | string | Unique story ID (e.g., US-001) |
| `userStories[].title` | string | Short story title |
| `userStories[].description` | string | Detailed description |
| `userStories[].acceptanceCriteria` | array | Specific requirements (strings) |
| `userStories[].priority` | number | Order (lower = first) |
| `userStories[].passes` | boolean | Completion status |
| `userStories[].notes` | string | Implementation notes |

---

## Best Practices

### 1. Always Include Quality Gates

Every story should include:
```json
"acceptanceCriteria": [
  "... your requirements ...",
  "npm run typecheck passes",
  "npm run lint passes"
]
```

### 2. Test Incrementally

For UI stories, include browser verification:
```json
"acceptanceCriteria": [
  "Component renders at localhost:3000/path",
  "Visual matches design",
  "Interactive elements work"
]
```

### 3. Document Dependencies

If stories depend on each other, note it:
```json
{
  "id": "US-003",
  "description": "Depends on US-001 (database) and US-002 (API)"
}
```

### 4. Keep Notes Updated

Ralph will update the `notes` field with implementation details:
```json
{
  "passes": true,
  "notes": "Used existing Button component, added new variant 'danger'"
}
```

---

## Troubleshooting

### Ralph stops without completing

**Check**: Story might be too large or unclear.
**Fix**: Break into smaller stories with explicit criteria.

### Quality checks fail repeatedly

**Check**: Run checks manually to see errors.
**Fix**: Ensure acceptance criteria are achievable in one iteration.

### Ralph makes wrong changes

**Check**: `progress.txt` and `AGENTS.md` for context.
**Fix**: Add clearer patterns to `prompt.md`.

### Branch issues

**Check**: Ensure `branchName` in prd.json is valid.
**Fix**: Ralph auto-creates branches, but ensure no conflicts.

---

## Integration with Meelni Development

### When to Use Ralph

✅ **Good for:**
- Adding new database tables
- Creating API endpoints
- Building UI components
- Implementing well-defined features
- Repetitive tasks with clear patterns

❌ **Not for:**
- Exploratory work or research
- Major architectural decisions
- Security-critical code
- Debugging complex issues
- Code requiring human judgment

### Workflow Integration

1. **Plan**: Write PRD in `prd.json`
2. **Execute**: Run `./scripts/ralph/ralph.sh`
3. **Review**: Check commits, test functionality
4. **Merge**: PR to main branch
5. **Document**: Update CLAUDE.md if needed

---

## npm Scripts

Add to `package.json`:

```json
{
  "scripts": {
    "ralph": "./scripts/ralph/ralph.sh",
    "ralph:status": "cat scripts/ralph/prd.json | jq '.userStories[] | {id, title, passes}'",
    "ralph:progress": "cat scripts/ralph/progress.txt"
  }
}
```

---

## Example PRDs

### Database Migration Feature

```json
{
  "name": "User Preferences",
  "branchName": "ralph/user-preferences",
  "userStories": [
    {
      "id": "PREF-001",
      "title": "Add preferences table",
      "acceptanceCriteria": [
        "Create user_preferences table in /lib/db/schema.ts",
        "Include: id, userId (FK), darkMode (boolean), emailNotifications (boolean)",
        "Add timestamps (createdAt, updatedAt)",
        "npm run db:push succeeds",
        "npm run typecheck passes"
      ],
      "priority": 1,
      "passes": false
    },
    {
      "id": "PREF-002",
      "title": "Create preferences API",
      "acceptanceCriteria": [
        "GET /api/user/preferences returns current preferences",
        "PUT /api/user/preferences updates preferences",
        "Both require authentication",
        "Return 401 if not authenticated",
        "npm run typecheck passes"
      ],
      "priority": 2,
      "passes": false
    }
  ]
}
```

### UI Component Feature

```json
{
  "name": "Settings Page",
  "branchName": "ralph/settings-page",
  "userStories": [
    {
      "id": "SET-001",
      "title": "Create settings layout",
      "acceptanceCriteria": [
        "Create /app/dashboard/settings/page.tsx",
        "Use DashboardLayout component",
        "Add sidebar navigation for settings sections",
        "npm run build passes"
      ],
      "priority": 1,
      "passes": false
    },
    {
      "id": "SET-002",
      "title": "Add preferences section",
      "acceptanceCriteria": [
        "Create PreferencesSection component",
        "Toggle for dark mode",
        "Toggle for email notifications",
        "Save button calls API",
        "Shows success/error feedback",
        "npm run typecheck passes"
      ],
      "priority": 2,
      "passes": false
    }
  ]
}
```

---

## Credits

Ralph is adapted from [snarktank/ralph](https://github.com/snarktank/ralph) for use with Claude Code in the Meelni project.

---

## Changelog

### v1.0.0 (2026-01-16)
- Initial setup for Meelni
- Adapted for Claude Code (from Amp)
- Added Meelni-specific patterns and commands
- Created comprehensive prompt.md for tech stack
- Added progress.txt with codebase patterns

---

**End of Document**
