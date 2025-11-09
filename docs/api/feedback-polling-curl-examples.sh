#!/bin/bash
#
# Feedback Polling API - cURL Examples
#
# This script demonstrates how to use the feedback polling API endpoint
# with cURL for testing and debugging.
#
# Prerequisites:
# 1. Set SESSION_ID environment variable
# 2. Set AUTH_TOKEN environment variable (Supabase JWT)
# 3. Start Next.js dev server: npm run dev
#
# Usage:
#   export SESSION_ID="550e8400-e29b-41d4-a716-446655440000"
#   export AUTH_TOKEN="eyJhbGciOiJIUzI1NiIs..."
#   bash docs/api/feedback-polling-curl-examples.sh
#

set -e

# Configuration
API_BASE_URL="${API_BASE_URL:-http://localhost:3000}"
SESSION_ID="${SESSION_ID:-}"
AUTH_TOKEN="${AUTH_TOKEN:-}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check prerequisites
if [ -z "$SESSION_ID" ]; then
  echo -e "${RED}Error: SESSION_ID environment variable not set${NC}"
  echo "Usage: export SESSION_ID='your-session-id'"
  exit 1
fi

if [ -z "$AUTH_TOKEN" ]; then
  echo -e "${RED}Error: AUTH_TOKEN environment variable not set${NC}"
  echo "Usage: export AUTH_TOKEN='your-jwt-token'"
  exit 1
fi

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Feedback Polling API - cURL Examples${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo -e "API Base URL: ${YELLOW}${API_BASE_URL}${NC}"
echo -e "Session ID: ${YELLOW}${SESSION_ID}${NC}"
echo -e "Auth Token: ${YELLOW}${AUTH_TOKEN:0:20}...${NC}"
echo ""

# Example 1: Basic polling request
echo -e "${GREEN}Example 1: Basic Polling Request${NC}"
echo -e "${YELLOW}Command:${NC}"
echo "curl -X GET \\"
echo "  \"${API_BASE_URL}/api/feedback/${SESSION_ID}\" \\"
echo "  -H \"Authorization: Bearer \${AUTH_TOKEN}\" \\"
echo "  -H \"Content-Type: application/json\""
echo ""
echo -e "${YELLOW}Response:${NC}"
curl -X GET \
  "${API_BASE_URL}/api/feedback/${SESSION_ID}" \
  -H "Authorization: Bearer ${AUTH_TOKEN}" \
  -H "Content-Type: application/json" \
  -s | jq '.'
echo ""
echo ""

# Example 2: Verbose request with cache headers
echo -e "${GREEN}Example 2: Verbose Request (showing cache headers)${NC}"
echo -e "${YELLOW}Command:${NC}"
echo "curl -X GET \\"
echo "  \"${API_BASE_URL}/api/feedback/${SESSION_ID}\" \\"
echo "  -H \"Authorization: Bearer \${AUTH_TOKEN}\" \\"
echo "  -H \"Content-Type: application/json\" \\"
echo "  -v"
echo ""
echo -e "${YELLOW}Output (showing headers):${NC}"
curl -X GET \
  "${API_BASE_URL}/api/feedback/${SESSION_ID}" \
  -H "Authorization: Bearer ${AUTH_TOKEN}" \
  -H "Content-Type: application/json" \
  -v 2>&1 | grep -E "(< HTTP|< Cache-Control|< Content-Type)" || echo "Headers not captured"
echo ""
echo ""

# Example 3: Polling loop
echo -e "${GREEN}Example 3: Polling Loop (5 attempts, 3s interval)${NC}"
echo -e "${YELLOW}Command:${NC}"
cat << 'EOF'
for i in {1..5}; do
  echo "Attempt $i/5..."
  curl -X GET \
    "${API_BASE_URL}/api/feedback/${SESSION_ID}" \
    -H "Authorization: Bearer ${AUTH_TOKEN}" \
    -H "Content-Type: application/json" \
    -s | jq '.status, .estimatedTimeRemaining'

  # Check if completed
  STATUS=$(curl -X GET \
    "${API_BASE_URL}/api/feedback/${SESSION_ID}" \
    -H "Authorization: Bearer ${AUTH_TOKEN}" \
    -H "Content-Type: application/json" \
    -s | jq -r '.status')

  if [ "$STATUS" = "completed" ] || [ "$STATUS" = "failed" ] || [ "$STATUS" = "skipped" ]; then
    echo "Terminal status reached: $STATUS"
    break
  fi

  sleep 3
done
EOF
echo ""
echo -e "${YELLOW}Executing polling loop:${NC}"

for i in {1..5}; do
  echo -e "${BLUE}Attempt $i/5...${NC}"

  RESPONSE=$(curl -X GET \
    "${API_BASE_URL}/api/feedback/${SESSION_ID}" \
    -H "Authorization: Bearer ${AUTH_TOKEN}" \
    -H "Content-Type: application/json" \
    -s)

  STATUS=$(echo "$RESPONSE" | jq -r '.status')

  echo -e "Status: ${YELLOW}${STATUS}${NC}"

  if [ "$STATUS" = "pending" ] || [ "$STATUS" = "processing" ]; then
    TIME_REMAINING=$(echo "$RESPONSE" | jq -r '.estimatedTimeRemaining')
    echo -e "Estimated time remaining: ${YELLOW}${TIME_REMAINING}s${NC}"
  fi

  # Check if terminal state
  if [ "$STATUS" = "completed" ] || [ "$STATUS" = "failed" ] || [ "$STATUS" = "skipped" ]; then
    echo -e "${GREEN}Terminal status reached: $STATUS${NC}"
    break
  fi

  if [ $i -lt 5 ]; then
    echo "Waiting 3 seconds..."
    sleep 3
  fi
done

echo ""
echo ""

# Example 4: Extract specific fields
echo -e "${GREEN}Example 4: Extract Specific Fields${NC}"
echo -e "${YELLOW}Command (extract overall score):${NC}"
echo "curl -X GET \\"
echo "  \"${API_BASE_URL}/api/feedback/${SESSION_ID}\" \\"
echo "  -H \"Authorization: Bearer \${AUTH_TOKEN}\" \\"
echo "  -s | jq '.feedback.overallScore'"
echo ""
echo -e "${YELLOW}Output:${NC}"
curl -X GET \
  "${API_BASE_URL}/api/feedback/${SESSION_ID}" \
  -H "Authorization: Bearer ${AUTH_TOKEN}" \
  -s | jq '.feedback.overallScore // "Not available yet"'
echo ""
echo ""

# Example 5: Error handling
echo -e "${GREEN}Example 5: Error Handling (missing auth)${NC}"
echo -e "${YELLOW}Command:${NC}"
echo "curl -X GET \\"
echo "  \"${API_BASE_URL}/api/feedback/${SESSION_ID}\" \\"
echo "  -H \"Content-Type: application/json\""
echo ""
echo -e "${YELLOW}Response (expected 401 Unauthorized):${NC}"
curl -X GET \
  "${API_BASE_URL}/api/feedback/${SESSION_ID}" \
  -H "Content-Type: application/json" \
  -s -w "\nHTTP Status: %{http_code}\n" | head -n 10
echo ""
echo ""

# Example 6: Check response time
echo -e "${GREEN}Example 6: Response Time Measurement${NC}"
echo -e "${YELLOW}Command:${NC}"
echo "curl -X GET \\"
echo "  \"${API_BASE_URL}/api/feedback/${SESSION_ID}\" \\"
echo "  -H \"Authorization: Bearer \${AUTH_TOKEN}\" \\"
echo "  -w \"\\nTotal time: %{time_total}s\\n\" \\"
echo "  -s -o /dev/null"
echo ""
echo -e "${YELLOW}Output:${NC}"
curl -X GET \
  "${API_BASE_URL}/api/feedback/${SESSION_ID}" \
  -H "Authorization: Bearer ${AUTH_TOKEN}" \
  -w "\nTotal time: %{time_total}s\n" \
  -s -o /dev/null
echo ""
echo ""

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}All examples completed!${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo -e "${GREEN}Tip:${NC} Use 'jq' to format and filter JSON responses"
echo -e "${GREEN}Tip:${NC} Use '-v' flag to see full HTTP headers"
echo -e "${GREEN}Tip:${NC} Use '-w' flag to measure response times"
echo ""
