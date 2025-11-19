---
description: Create a new sprint folder with template files
---

Create a new sprint for feature development using our standardized template.

**Sprint Name**: [REQUIRED - User will provide]

## Your Task

**CRITICAL: Check if sprint already exists first!**

1. **Check for existing sprint**:
   ```bash
   # Check if sprint folder already exists
   ls -la .claude/sprints/

   # Check archive for completed sprints with similar name
   ls -la .claude/archive/sprints/ | grep -i [feature-name]
   ```

   **If sprint exists:**
   - **In `.claude/sprints/`** → Tell user "Sprint already exists at `.claude/sprints/[name]/`. Continue working on this sprint?"
   - **In `.claude/archive/sprints/`** → Tell user "Sprint was previously completed and archived. Create new sprint with different name or reopen archived sprint?"
   - **DO NOT create duplicate sprint folders**

2. **Only if sprint does NOT exist, create sprint folder**:
   - Folder name format: `[feature-name]-YYYY-MM`
   - Example: `email-notifications-2025-11`
   - Location: `.claude/sprints/[feature-name]-YYYY-MM/`

3. **Copy all template files**:
   ```bash
   cp -r docs/templates/SPRINT_TEMPLATE/* .claude/sprints/[feature-name]-YYYY-MM/
   ```

3. **Pre-fill templates** with sprint-specific information:

   **In README.md**:
   - Replace `[Sprint Name]` with actual feature name
   - Set creation date to today (YYYY-MM-DD)
   - Set status to "Planning"
   - Set target completion (+10 working days from today)

   **In PLAN.md**:
   - Add sprint name
   - Set creation date

   **In PROGRESS.md**:
   - Add sprint name
   - Add Day 1 entry with planning focus

   **In DECISIONS.md, TESTING.md, COMPLETION.md**:
   - Add sprint name

4. **Update sprint index**:
   - Add entry to `.claude/sprints/README.md` under "Current Active Sprints"
   - Format:
     ```markdown
     ### [Feature Name] (YYYY-MM)
     **Status**: Planning
     **Created**: YYYY-MM-DD
     **Target**: YYYY-MM-DD
     **Folder**: `.claude/sprints/[feature-name-YYYY-MM]/`
     ```

5. **Inform user** of created sprint structure and next steps:
   - Sprint folder created at: `.claude/sprints/[name]/`
   - Files pre-filled with dates and names
   - Next step: Fill in README.md goals
   - Next step: Write PLAN.md technical approach

## Example

If user says "Create sprint for email notifications":

1. Create: `.claude/sprints/email-notifications-2025-11/`
2. Copy template files
3. Update all dates to 2025-11-18 (today)
4. Set target to 2025-11-28 (+10 days)
5. Update sprint index
6. Tell user: "Sprint created! Fill in `.claude/sprints/email-notifications-2025-11/README.md` with your goals"

## Template Files to Create

After copying, these files should exist:
- `.claude/sprints/[name]/README.md` (pre-filled with dates)
- `.claude/sprints/[name]/PLAN.md` (pre-filled with dates)
- `.claude/sprints/[name]/PROGRESS.md` (Day 1 entry added)
- `.claude/sprints/[name]/DECISIONS.md` (sprint name added)
- `.claude/sprints/[name]/TESTING.md` (sprint name added)
- `.claude/sprints/[name]/COMPLETION.md` (sprint name added, leave empty)
- `.claude/sprints/[name]/QUICK_START_FOR_AGENTS.md` (copied from template)

## Important Notes

- Use kebab-case for feature names
- Always include YYYY-MM suffix
- Update sprint index immediately
- Pre-fill all date fields with current date
- Set target completion to +10 working days
- Create Day 1 PROGRESS.md entry focused on "Planning"

## Reference

See `.claude/sprints/README.md` for sprint documentation guidelines.
