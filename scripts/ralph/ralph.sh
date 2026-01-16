#!/bin/bash
# Ralph Wiggum - Autonomous Coding Agent Loop for Meelni
# Adapted for Claude Code from https://github.com/snarktank/ralph
#
# Usage: ./scripts/ralph/ralph.sh [max_iterations]
# Default: 10 iterations

set -e

MAX_ITERATIONS=${1:-10}
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
ARCHIVE_DIR="$SCRIPT_DIR/archive"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m' # No Color

echo -e "${PURPLE}"
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║                    Ralph Wiggum                              ║"
echo "║            Autonomous Coding Agent for Meelni                ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# Check required files exist
if [ ! -f "$SCRIPT_DIR/prd.json" ]; then
    echo -e "${RED}Error: prd.json not found in $SCRIPT_DIR${NC}"
    echo "Create a prd.json file with your user stories first."
    echo "See prd.json.example for the expected format."
    exit 1
fi

if [ ! -f "$SCRIPT_DIR/prompt.md" ]; then
    echo -e "${RED}Error: prompt.md not found in $SCRIPT_DIR${NC}"
    exit 1
fi

# Read branch name from prd.json
BRANCH_NAME=$(cat "$SCRIPT_DIR/prd.json" | grep -o '"branchName"[[:space:]]*:[[:space:]]*"[^"]*"' | cut -d'"' -f4)

if [ -z "$BRANCH_NAME" ]; then
    echo -e "${RED}Error: branchName not found in prd.json${NC}"
    exit 1
fi

# Check if we need to archive previous run (branch changed)
LAST_BRANCH_FILE="$SCRIPT_DIR/.last-branch"
if [ -f "$LAST_BRANCH_FILE" ]; then
    LAST_BRANCH=$(cat "$LAST_BRANCH_FILE")
    if [ "$LAST_BRANCH" != "$BRANCH_NAME" ]; then
        echo -e "${YELLOW}Branch changed from '$LAST_BRANCH' to '$BRANCH_NAME'${NC}"
        echo -e "${BLUE}Archiving previous run...${NC}"

        ARCHIVE_NAME="$(date +%Y-%m-%d)-$LAST_BRANCH"
        mkdir -p "$ARCHIVE_DIR/$ARCHIVE_NAME"

        # Archive files (preserve originals for git history)
        [ -f "$SCRIPT_DIR/progress.txt" ] && cp "$SCRIPT_DIR/progress.txt" "$ARCHIVE_DIR/$ARCHIVE_NAME/"
        [ -f "$SCRIPT_DIR/prd.json.completed" ] && mv "$SCRIPT_DIR/prd.json.completed" "$ARCHIVE_DIR/$ARCHIVE_NAME/prd.json"

        # Reset progress.txt for new run
        cat > "$SCRIPT_DIR/progress.txt" << 'EOF'
# Ralph Progress Log
Started: $(date +%Y-%m-%d)

## Codebase Patterns
(Patterns will be added as Ralph learns)

## Key Files
(Key files will be documented as Ralph works)

---
EOF
        echo -e "${GREEN}Archived to: $ARCHIVE_DIR/$ARCHIVE_NAME${NC}"
    fi
fi

# Save current branch
echo "$BRANCH_NAME" > "$LAST_BRANCH_FILE"

# Change to project root
cd "$PROJECT_ROOT"

# Ensure we're on the correct branch
CURRENT_BRANCH=$(git branch --show-current)
if [ "$CURRENT_BRANCH" != "$BRANCH_NAME" ]; then
    echo -e "${BLUE}Switching to branch: $BRANCH_NAME${NC}"

    # Check if branch exists
    if git show-ref --verify --quiet "refs/heads/$BRANCH_NAME"; then
        git checkout "$BRANCH_NAME"
    else
        echo -e "${YELLOW}Creating new branch: $BRANCH_NAME${NC}"
        git checkout -b "$BRANCH_NAME"
    fi
fi

echo -e "${BLUE}Starting Ralph with max $MAX_ITERATIONS iterations${NC}"
echo -e "${BLUE}Branch: $BRANCH_NAME${NC}"
echo ""

# Function to get story status
get_story_status() {
    if command -v jq &> /dev/null; then
        cat "$SCRIPT_DIR/prd.json" | jq -r '.userStories[] | "\(.id): \(if .passes then "DONE" else "TODO" end)"'
    else
        echo "(Install jq for story status)"
    fi
}

# Main loop
for i in $(seq 1 $MAX_ITERATIONS); do
    echo -e "${PURPLE}═══════════════════════════════════════════════════════════════${NC}"
    echo -e "${PURPLE}                    Iteration $i of $MAX_ITERATIONS${NC}"
    echo -e "${PURPLE}═══════════════════════════════════════════════════════════════${NC}"
    echo ""

    # Show current story status
    echo -e "${BLUE}Story Status:${NC}"
    get_story_status
    echo ""

    # Run Claude Code with the prompt
    # Using --dangerously-skip-permissions to allow autonomous execution
    echo -e "${YELLOW}Running Claude Code...${NC}"
    echo ""

    OUTPUT=$(cat "$SCRIPT_DIR/prompt.md" \
        | claude --dangerously-skip-permissions 2>&1 \
        | tee /dev/stderr) || true

    # Check for completion signal
    if echo "$OUTPUT" | grep -q "<promise>COMPLETE</promise>"; then
        echo ""
        echo -e "${GREEN}╔══════════════════════════════════════════════════════════════╗${NC}"
        echo -e "${GREEN}║                    ALL STORIES COMPLETE                       ║${NC}"
        echo -e "${GREEN}╚══════════════════════════════════════════════════════════════╝${NC}"
        echo ""

        # Archive completed prd.json
        cp "$SCRIPT_DIR/prd.json" "$SCRIPT_DIR/prd.json.completed"

        # Final status
        echo -e "${BLUE}Final Story Status:${NC}"
        get_story_status

        exit 0
    fi

    # Brief pause between iterations
    echo ""
    echo -e "${BLUE}Iteration $i complete. Pausing 2 seconds...${NC}"
    sleep 2
done

echo ""
echo -e "${YELLOW}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${YELLOW}║              Max iterations ($MAX_ITERATIONS) reached                        ║${NC}"
echo -e "${YELLOW}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${BLUE}Final Story Status:${NC}"
get_story_status
echo ""
echo -e "${YELLOW}Run again with: ./scripts/ralph/ralph.sh [more_iterations]${NC}"

exit 1
