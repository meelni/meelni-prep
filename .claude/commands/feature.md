---
allowed-tools: Task,Read,Glob,Grep,Write,Edit,Bash,TodoWrite
description: Build a complete feature with architecture, implementation, tests, and docs
---

You are orchestrating complete feature development from request to production-ready code.

**Context**: This command automates the entire feature development lifecycle by coordinating multiple specialized agents.

## Your Task:

### 1. **Understand the Feature Request**

First, clarify what needs to be built:

- Read the user's feature description
- Ask clarifying questions if requirements are ambiguous
- Identify affected systems (frontend, backend, database, agents)

### 2. **Architectural Design Phase**

Delegate to the **architect** agent:

```
Use the Task tool with subagent_type="architect"

Prompt: "Design architecture for: [FEATURE_DESCRIPTION]

Requirements:
- Analyze current codebase structure (read CLAUDE.md first)
- Identify files that need changes
- Design database schema changes (if any)
- Design API endpoints (if any)
- Design UI components (if any)
- Specify dependencies needed
- Create implementation plan with ordered steps
- Document architecture decisions (ADR format)

Return:
- Technical design document
- List of files to create/modify
- Implementation checklist
- Any risks or considerations"
```

### 3. **Implementation Phase**

Delegate to the **developer** agent:

```
Use the Task tool with subagent_type="developer"

Prompt: "Implement the following feature based on this design:

[PASTE ARCHITECTURE DESIGN FROM STEP 2]

Requirements:
- Follow the implementation plan exactly
- Write tests for all new functionality
- Use existing patterns from the codebase
- Handle errors gracefully
- Add proper TypeScript types
- Follow code style from CLAUDE.md

Return:
- Summary of all changes made
- List of files created/modified
- Test results
- Any issues encountered"
```

### 4. **Quality Review Phase**

Delegate to **quality-reviewer** agent:

```
Use the Task tool with subagent_type="quality-reviewer"

Prompt: "Review the feature implementation for:
- Security issues (SQL injection, XSS, auth bypasses)
- Performance problems (N+1 queries, inefficient algorithms)
- Data loss risks (missing transactions, race conditions)
- Error handling gaps

Feature files: [LIST FILES FROM STEP 3]

Return:
- List of critical issues (must fix)
- List of improvements (should fix)
- Overall assessment (ready/needs work)"
```

### 5. **Documentation Phase**

Run the `/docs-sync` command to update documentation automatically.

### 6. **Testing Phase**

Run tests and verify the feature works:

```bash
# Run type check
npm run type-check

# Run tests (if test suite exists)
npm run test

# Start dev server and test manually
# (Provide instructions to user for manual testing)
```

### 7. **Create Pull Request**

If everything passes:

- Stage all changes
- Create conventional commit message
- Push to feature branch
- Create GitHub PR with proper description

## Command Flow Example:

```bash
/feature "Add email notifications when interviews are completed"

# Behind the scenes:
# 1. Architect designs email service integration
# 2. Developer implements Resend API + templates + UI
# 3. Quality reviewer checks for security issues
# 4. Docs updated automatically
# 5. Tests run successfully
# 6. PR created: "feat: add email notifications for completed interviews"
```

## Output Format:

Provide a summary at the end:

```markdown
## ✅ Feature Complete: [FEATURE_NAME]

**Architecture**: [Link to ADR or design doc]

**Implementation**:

- ✅ Backend: [What was built]
- ✅ Frontend: [What was built]
- ✅ Database: [Schema changes]
- ✅ Tests: [Test coverage]

**Quality Review**:

- Critical issues: [Count] (all resolved)
- Improvements: [Count] (addressed or documented)

**Next Steps**:

1. Review the changes in your editor
2. Test manually: [Specific test instructions]
3. When satisfied, use GitHub's native protected pull-request merge after all
   required checks pass.
```

## Important Notes:

- **Break down large features**: If the feature is very complex, suggest breaking it into smaller features
- **Ask for approval**: Before starting implementation, show the architectural design and get user confirmation
- **Parallel agents**: Run architect and documentation agents in parallel when possible for speed
- **Fail fast**: If quality review finds critical issues, stop and fix them before proceeding
- **User visibility**: Use TodoWrite to show progress throughout the process

## Reference Documentation:

- `.claude/CLAUDE.md` - Project standards and patterns
- Current tech stack, coding conventions, file boundaries

**Usage Examples:**

```bash
# Simple feature
/feature "Add pagination to interview history table"

# Complex feature
/feature "Implement real-time collaborative feedback with other coaches"

# Bug fix that needs design
/feature "Fix race condition in transcript saving"
```
