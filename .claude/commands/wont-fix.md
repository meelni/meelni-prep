---
allowed-tools: Bash(gh issue *),Bash(gh label *)
description: Close an issue as "won't fix" with explanation
---

You are closing a GitHub issue as "won't fix" because it's not planned for implementation.

**Context**: This command is used when an issue represents work that won't be done due to:
- Out of scope for the product
- Technical limitations or constraints
- Better alternatives exist
- Low priority with no plans to implement
- Duplicate of another approach

**Your Task:**

1. **Get issue details**: Use `gh issue view $1 --json title,number,labels` to understand the issue

2. **Post closing comment** with clear reasoning:
```markdown
## 🚫 Won't Fix

**Decision**: This issue will not be implemented.

**Reasoning**:
[Provide clear, specific explanation for why this won't be implemented]

**Alternatives**:
[If applicable, suggest alternative approaches or existing features that address the need]

**Future Consideration**:
[If applicable, explain what would need to change for this to be reconsidered]

---
🤖 Closed as won't fix by workflow automation
```

3. **Add "wontfix" label** (create if doesn't exist):
```bash
gh label create "wontfix" --description "This will not be worked on" --color "ffffff" || true
gh issue edit $1 --add-label "wontfix"
```

4. **Close the issue**:
```bash
gh issue close $1 --reason "not planned"
```

**Usage Examples:**
```bash
# Close as out of scope
/wont-fix 123

# Close as duplicate approach
/wont-fix 456
```

**Important:**
- Always provide clear reasoning
- Be respectful in the explanation
- Suggest alternatives when possible
- Leave door open for future reconsideration if applicable

**Reference Documentation:**
- GitHub CLI: https://cli.github.com/manual/gh_issue_close
