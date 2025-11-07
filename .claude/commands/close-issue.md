---
allowed-tools: Bash(gh issue *),Bash(gh label *)
description: Close an issue with a completion comment
---

You are closing a GitHub issue because the work is complete.

**Context**: This command is used when an issue's work is finished and verified.

**Your Task:**

1. **Get issue details**: Use `gh issue view $1 --json title,number,labels` to understand the issue

2. **Post completion comment**:
```markdown
## ✅ Issue Complete

**Work Summary**: [Brief summary of what was completed]

**Verification**:
- [x] Changes tested locally
- [x] Code committed and pushed
- [x] Documentation updated (if applicable)
- [x] Related issues linked (if applicable)

**Closing**: This issue is complete and verified.

---
🤖 Closed by workflow automation
```

3. **Close the issue**:
```bash
gh issue close $1 --reason completed
```

**Usage Examples:**
```bash
# Close a completed feature
/close-issue 123

# Close after verification
/close-issue 456
```

**Reference Documentation:**
- GitHub CLI: https://cli.github.com/manual/gh_issue_close
