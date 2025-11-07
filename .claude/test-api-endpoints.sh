#!/bin/bash

# API Endpoint Verification Script
# Tests all API endpoints for basic functionality
# Usage: bash .claude/test-api-endpoints.sh

BASE_URL="http://localhost:3000"
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "========================================="
echo "Meelni API Endpoint Verification"
echo "========================================="
echo ""

# Test counters
PASS=0
FAIL=0
SKIP=0

# Helper function to test endpoint
test_endpoint() {
  local method=$1
  local path=$2
  local expected_status=$3
  local description=$4
  local data=$5

  echo -n "Testing $method $path ... "

  if [ "$method" = "GET" ]; then
    response=$(curl -s -w "%{http_code}" -o /dev/null "$BASE_URL$path")
  elif [ "$method" = "POST" ]; then
    response=$(curl -s -w "%{http_code}" -o /dev/null -X POST -H "Content-Type: application/json" -d "$data" "$BASE_URL$path")
  fi

  if [ "$response" = "$expected_status" ]; then
    echo -e "${GREEN}✓ PASS${NC} ($response - $description)"
    ((PASS++))
  else
    echo -e "${RED}✗ FAIL${NC} (Expected $expected_status, got $response - $description)"
    ((FAIL++))
  fi
}

echo "=== Authentication Tests ==="
test_endpoint "POST" "/api/session/start" "401" "Unauthenticated request should return 401" '{"roundType":"product_sense"}'
echo ""

echo "=== LiveKit Token Generation ==="
test_endpoint "POST" "/api/livekit/token" "400" "Missing params should return 400" '{}'
test_endpoint "POST" "/api/livekit/demo-token" "200" "Demo token should be generated" '{"participantName":"test-user"}'
echo ""

echo "=== Session Management (Unauthenticated) ==="
test_endpoint "GET" "/api/sessions" "401" "List sessions without auth" ""
test_endpoint "GET" "/api/session/test-id-123" "401" "Get session without auth" ""
test_endpoint "POST" "/api/session/end" "401" "End session without auth" '{"sessionId":"test-id"}'
echo ""

echo "=== Feedback APIs (Unauthenticated) ==="
test_endpoint "GET" "/api/feedback/test-id-123" "401" "Get feedback without auth" ""
test_endpoint "POST" "/api/feedback/generate" "401" "Generate feedback without auth" '{"sessionId":"test-id"}'
echo ""

echo "=== Utility APIs ==="
test_endpoint "GET" "/api/cartesia/voices" "200" "Get Cartesia voices" ""
echo ""

echo "========================================="
echo "Test Summary"
echo "========================================="
echo -e "${GREEN}Passed: $PASS${NC}"
echo -e "${RED}Failed: $FAIL${NC}"
echo -e "${YELLOW}Skipped: $SKIP${NC}"
echo ""

if [ $FAIL -eq 0 ]; then
  echo -e "${GREEN}✓ All tests passed!${NC}"
  exit 0
else
  echo -e "${RED}✗ Some tests failed${NC}"
  exit 1
fi
