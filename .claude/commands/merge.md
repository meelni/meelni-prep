---
description: Merge current branch to main and push
---

# Merge to Main

Merge the current branch to main, handling any conflicts, and push to remote.

## Instructions

1. Check current branch and status:
```bash
git branch --show-current
git status
```

2. Ensure working tree is clean (commit any changes first)

3. Checkout main and update:
```bash
git checkout main
git pull origin main
```

4. Merge current branch:
```bash
git merge <branch-name>
```

5. If conflicts occur:
   - Show conflicted files
   - Ask user how to proceed (manual resolution or abort)

6. Push to main:
```bash
git push origin main
```

7. Confirm:
   - Show merge commit SHA
   - Confirm main is up to date
   - Ask if user wants to delete the feature branch

## Example:

**User:** "merge to main"

**Assistant:**
1. Checks current branch: `saviii/question-bank-feature`
2. Switches to main, pulls latest
3. Merges feature branch
4. Pushes to origin/main
5. Confirms: "✅ Merged to main (commit abc1234)"
