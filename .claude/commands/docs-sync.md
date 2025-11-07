---
allowed-tools: Read,Write,Edit,Glob,Grep,Bash
description: Update all documentation to reflect recent code changes
---

You are synchronizing documentation with the current state of the codebase.

**Context**: After implementing features or making significant changes, documentation can drift out of sync. This command ensures all docs accurately reflect reality.

## Your Task:

### 1. **Analyze Recent Changes**

First, understand what changed:
```bash
# Get list of recently modified files
git diff --name-only HEAD~5..HEAD

# Get commit messages for context
git log --oneline -10
```

Identify affected documentation areas:
- `.claude/CLAUDE.md` - Main living document
- `README.md` - Setup instructions, quick start
- `.claude/PRD.md` - Product requirements (if features changed)
- API documentation (if endpoints changed)
- Database schema docs (if schema changed)

### 2. **Update CLAUDE.md**

This is the primary documentation file. Update these sections as needed:

**Project Status Section:**
- Update "Current Phase" if milestone completed
- Update feature completion checklist
- Update "Next Milestone"

**Tech Stack Section:**
- Add new dependencies if introduced
- Update version numbers if upgraded

**Project Structure Section:**
- Add new directories/files if created
- Update structure diagram if architecture changed

**Architecture Decisions (ADRs):**
- Add new ADR entries for significant decisions
- Format: `### ADR-XXX: [Title]`
- Include: Date, Decision, Rationale, Consequences

**File Boundaries Section:**
- Add new file documentation for created files
- Update existing file docs if responsibilities changed

**API Endpoints Section:**
- Add new endpoints if created
- Update existing endpoint docs if changed

**Database Schema Section:**
- Update if tables/columns added/modified
- Update migration strategy notes

**Known Issues & Technical Debt:**
- Move resolved issues to "Resolved Issues" section
- Add new known issues if discovered

**Iteration Log:**
- Add new entry with date and summary of changes

### 3. **Update README.md**

Check if these need updates:
- Installation steps (new dependencies?)
- Environment variables (new .env vars?)
- Setup commands (new scripts?)
- Project description (new features to highlight?)

### 4. **Update API Documentation**

If API endpoints changed:
- Update request/response schemas
- Update example requests
- Update error codes
- Add new endpoint documentation

### 5. **Update Database Schema Documentation**

If schema changed:
- Update table diagrams
- Update column descriptions
- Update relationship documentation
- Document migration steps

### 6. **Verify Documentation Accuracy**

Cross-check documentation against code:
```bash
# Verify files mentioned in docs exist
# Check if documented API endpoints exist
# Verify environment variables are accurate
```

### 7. **Create Documentation Commit**

Stage and commit documentation changes:
```bash
git add .claude/ README.md docs/
git commit -m "docs: sync documentation with recent changes

Updated:
- CLAUDE.md: [What was updated]
- README.md: [What was updated]
- API docs: [What was updated]

Reflects changes from: [commit range or feature name]"
```

## Output Format:

Provide a summary of documentation updates:

```markdown
## 📚 Documentation Synchronized

**Files Updated**:
- ✅ `.claude/CLAUDE.md` - [Summary of changes]
- ✅ `README.md` - [Summary of changes]
- ✅ API docs - [Summary of changes]
- ✅ Database schema - [Summary of changes]

**Key Updates**:
1. [Most important update]
2. [Second most important update]
3. [Third most important update]

**ADRs Added**:
- ADR-XXX: [Decision title]

**Verification**:
- ✅ All documented files exist
- ✅ All documented APIs exist
- ✅ All environment variables accurate
- ✅ No broken internal links

**Commit**: [commit hash] docs: sync documentation with recent changes
```

## Best Practices:

1. **Be thorough but concise**: Update what matters, don't add fluff
2. **Keep format consistent**: Follow existing documentation patterns
3. **Link related docs**: Add cross-references where helpful
4. **Date everything**: Always include dates in ADRs and iteration log
5. **Verify accuracy**: Don't just update blindly, check against actual code

## When to Run This Command:

- After completing a feature (`/feature` runs this automatically)
- After a major refactoring
- Before a release
- When documentation feels stale
- After fixing critical bugs that need documentation

## Usage Examples:

```bash
# After implementing a feature
/docs-sync

# Before a release
/docs-sync

# When you notice docs are outdated
/docs-sync
```

## Reference:
- `.claude/CLAUDE.md` - Main documentation structure
- Existing ADR format - Follow same pattern
- Conventional commits - Use `docs:` prefix
