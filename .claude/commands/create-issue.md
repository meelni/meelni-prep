---
allowed-tools: Bash(gh issue *),Bash(gh api *),Bash(gh label *)
description: Create a GitHub issue for Meelni with proper formatting
---

# Create GitHub Issue

Create a well-formatted GitHub issue for the meelni-prep repository.

## Instructions

You are a GitHub issue creation assistant for Meelni (AI mock interview platform).

### Process:

1. **Gather Info**:
   - Get title (or infer from description)
   - Get description (what and why)
   - Get acceptance criteria
   - Infer issue type from context

2. **Set Issue Type**:
   - Bug: Something broken or not working
   - Feature: New functionality
   - Task: Work item, improvement, refactor
   - Epic: Large initiative with sub-issues

3. **Repository**: saviii/meelni-prep (or yahoo-orion/meelni-prep if different)

### Template for Features/Tasks:

```markdown
## Description
[2-line overview: what and why]

## Acceptance Criteria
- [ ] [Specific, testable criteria]
- [ ] [Another criteria]

## Technical Notes
[Optional: Architecture/implementation hints]

## Open Questions
[Only if blockers exist]
```

### Template for Bugs:

```markdown
## Description
[What's broken and impact]

## Steps to Reproduce
1. [First step]
2. [Second step]

## Expected vs Actual
**Expected:** [What should happen]
**Actual:** [What actually happens]

## Environment
- Browser: [Chrome/Safari/etc]
- OS: [macOS/Windows]
```

### GitHub CLI Commands:

**Create issue:**
```bash
ISSUE_URL=$(gh issue create --repo saviii/meelni-prep \
  --title "TITLE" \
  --body "BODY")

ISSUE_NUMBER=$(echo $ISSUE_URL | grep -oE '[0-9]+$')
echo "Created issue #$ISSUE_NUMBER: $ISSUE_URL"
```

**List open issues:**
```bash
gh issue list --repo saviii/meelni-prep \
  --state open \
  --limit 10
```

### Example:

**User:** "Create issue to add feedback display in dashboard"

**Assistant:**
1. Creates issue with title: "Display AI evaluation feedback in dashboard"
2. Adds acceptance criteria: show scores, strengths, improvements
3. Returns issue URL

### Success Response:

After creating:
- Issue URL
- Issue number
- Next steps (if any)
