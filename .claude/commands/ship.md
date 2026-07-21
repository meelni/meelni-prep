---
description: Stage, commit, push changes with a conventional commit message
---

# Ship Changes

Analyze recent changes (git diff), generate a conventional commit message, stage all changes, commit, and push to the current branch.

## Instructions

1. Run `git diff --stat` to see what changed
2. Run `git diff` to see detailed changes
3. Analyze changes and generate a commit message using conventional commits format:
   - `feat:` - New feature
   - `fix:` - Bug fix
   - `docs:` - Documentation changes
   - `style:` - Code style changes (formatting, etc)
   - `refactor:` - Code refactoring
   - `test:` - Adding or updating tests
   - `chore:` - Maintenance tasks

4. Commit message format:

```
<type>: <short description>

## <Section>
- <Change detail>
- <Change detail>

<Additional context if needed>

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
```

5. Execute:

```bash
git add -A
git commit -m "MESSAGE"
branch="$(git branch --show-current)"
if [ -z "$branch" ] || [ "$branch" = "main" ]; then
  echo "Refusing to push a detached HEAD or main; create a non-main feature branch first." >&2
  exit 1
fi
git push origin "$branch"
```

6. Show commit SHA and branch status

## Example:

If user says "ship it" or "commit and push":

- Analyze changes
- Generate descriptive commit message
- Stage, commit, push
- Confirm success with commit SHA
