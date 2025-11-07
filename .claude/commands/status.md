---
description: Get current project status overview
---

# Project Status

Quick overview of project status: what's working, what's next, current branch.

## Instructions

Provide a concise status report covering:

### 1. Git Status
```bash
git branch --show-current
git status --short
git log --oneline -3
```

### 2. Dev Server Status
- Check if dev server is running
- Check for any build errors
- Report port (usually 3000)

### 3. Recent Changes
- Summarize uncommitted changes if any
- Show last commit

### 4. MVP Checklist
From CLAUDE.md, report on:
- ✅ Completed features
- 🔨 In progress
- ⏳ Pending

### 5. Next Steps
Based on current state, suggest 2-3 next actions

### Output Format

```
🔀 Branch: saviii/question-bank-feature
📝 Status: Clean / 2 files modified
🚀 Dev Server: Running on :3000
📊 Database: 2,879 questions, 18 sessions

✅ MVP Complete:
   - Authentication
   - Question bank
   - Transcript saving
   - Feedback engine
   - RLS policies

💡 Next Steps:
   1. Merge to main
   2. Deploy to production
   3. Add feedback display UI
```

## Example:

**User:** "status"

**Assistant:** [Provides concise overview as shown above]
