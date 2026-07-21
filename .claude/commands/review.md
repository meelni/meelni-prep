---
allowed-tools: Task,Read,Glob,Grep,Bash
description: Run comprehensive code review before merging
---

You are conducting a thorough code review to ensure quality and catch issues before they reach production.

**Context**: This command runs automated quality checks using specialized review agents, similar to a senior engineer reviewing your PR.

## Your Task:

### 1. **Identify Changed Files**

Get the list of files that will be merged:

```bash
# Compare with main branch
git diff --name-only origin/main...HEAD

# Get full diff for context
git diff origin/main...HEAD --stat
```

Categorize changes:

- Frontend code (React components, pages)
- Backend code (API routes, services)
- Database (schema, migrations)
- Configuration (env, package.json)
- Documentation

### 2. **Architectural Review**

Delegate to **architect-reviewer** agent:

```
Use the Task tool with subagent_type="architect-reviewer"

Prompt: "Review these changes for architectural consistency:

Changed files:
[LIST FILES]

Check for:
1. Consistency with existing patterns (check CLAUDE.md)
2. Proper separation of concerns
3. Component/module boundaries respected
4. New patterns that should be documented
5. Breaking changes or API modifications
6. Impact on system architecture

Review the actual code changes and provide:
- ✅ Passes / ❌ Needs work
- List of architectural issues (if any)
- Recommendations for improvements"
```

### 3. **Quality & Security Review**

Delegate to **quality-reviewer** agent:

```
Use the Task tool with subagent_type="quality-reviewer"

Prompt: "Review these changes for real issues:

Changed files:
[LIST FILES]

Focus on:
1. Security vulnerabilities:
   - SQL injection risks
   - XSS vulnerabilities
   - Auth/authorization bypasses
   - Exposed secrets or keys
   - Insecure dependencies

2. Data loss risks:
   - Missing database transactions
   - Race conditions
   - Unhandled edge cases
   - Data validation gaps

3. Performance issues:
   - N+1 query problems
   - Missing database indexes
   - Inefficient algorithms
   - Memory leaks

4. Error handling:
   - Unhandled promise rejections
   - Missing try-catch blocks
   - Poor error messages
   - Missing logging

Review the actual code and provide:
- Critical issues (must fix before merge)
- Major issues (should fix before merge)
- Minor issues (nice to fix)
- Overall assessment: Ready / Needs Work / Blocked"
```

### 4. **Test Coverage Check**

Verify testing:

```bash
# Check if tests exist for new code
find . -name "*.test.ts" -o -name "*.test.tsx" -o -name "*.spec.ts"

# Run tests if they exist
npm run test 2>&1 || echo "No test suite configured"

# Type check
npm run type-check 2>&1
```

### 5. **Documentation Check**

Verify documentation updated:

```bash
# Check if CLAUDE.md was updated
git diff origin/main...HEAD .claude/CLAUDE.md

# Check if new files are documented
# Check if new APIs are documented
```

### 6. **Dependency Check**

Check for new dependencies:

```bash
# Check package.json changes
git diff origin/main...HEAD package.json

# If dependencies added, verify:
# - Necessary and appropriate
# - No security vulnerabilities (npm audit)
# - License compatible
```

## Output Format:

Provide a comprehensive review summary:

```markdown
## 🔍 Code Review Complete

### Summary

- **Branch**: [branch-name]
- **Changed Files**: [count] files
- **Lines Changed**: +[added] -[removed]

### Architectural Review

**Status**: ✅ Pass / ⚠️ Concerns / ❌ Issues

[Architect agent findings]

**Issues**:

- [ ] [Issue 1 if any]
- [ ] [Issue 2 if any]

### Quality & Security Review

**Status**: ✅ Pass / ⚠️ Concerns / ❌ Critical Issues

**Critical Issues** (must fix):

- [ ] [Critical issue 1]

**Major Issues** (should fix):

- [ ] [Major issue 1]

**Minor Issues** (nice to fix):

- [Minor issue 1]

### Test Coverage

- ✅ / ❌ Tests exist for new functionality
- ✅ / ❌ All tests passing
- ✅ / ❌ Type check passing

### Documentation

- ✅ / ❌ CLAUDE.md updated
- ✅ / ❌ New files documented
- ✅ / ❌ API changes documented

### Dependencies

- ✅ / ❌ No new dependencies OR new dependencies justified
- ✅ / ❌ No security vulnerabilities

---

### Overall Assessment

**Recommendation**: 🟢 Ready to Merge / 🟡 Needs Work / 🔴 Blocked

**Confidence**: High / Medium / Low

**Next Steps**:

1. [Action item 1]
2. [Action item 2]

**To merge**: Use GitHub's native protected pull-request merge when all issues
are resolved and required checks pass.
```

## Review Criteria:

### 🟢 Ready to Merge

- No critical issues
- Architecture consistent with codebase
- Tests passing (or N/A)
- Documentation updated
- Minor issues acceptable

### 🟡 Needs Work

- 1-3 major issues found
- Documentation incomplete
- Tests missing but not critical
- Should fix before merge but not blocking

### 🔴 Blocked

- Critical security vulnerabilities
- Data loss risks
- Breaking changes without migration plan
- Architectural violations
- Must fix before merge

## Best Practices:

1. **Run review before every merge**: Make this a habit
2. **Fix critical issues immediately**: Don't merge with red flags
3. **Document decisions**: If you skip a recommendation, document why
4. **Learn from reviews**: Patterns that get flagged should be avoided
5. **Update review criteria**: As project matures, add project-specific checks

## When to Run:

- Before using GitHub's native protected pull-request merge
- After completing a feature
- Before creating a PR
- When unsure about code quality
- Before major releases

## Usage Examples:

```bash
# Standard pre-merge review
/review

# Review specific branch
git checkout feature-branch
/review
```

## Integration with Other Commands:

- `/feature` should call `/review` automatically before creating PR
- `/review` should suggest running `/docs-sync` if docs outdated
- After `/review` passes and required checks succeed, complete the process in
  GitHub's native protected pull-request merge experience

## Reference:

- `.claude/CLAUDE.md` - Architectural patterns and standards
- OWASP Top 10 - Security vulnerability checklist
- Project coding standards
