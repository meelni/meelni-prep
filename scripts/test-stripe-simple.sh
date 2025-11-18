#!/bin/bash

# Simple Stripe Testing Script (no database required)

set -e

echo "🧪 Meelni Stripe - API Tests"
echo "============================="
echo ""

PORT=3000
BASE_URL="http://localhost:$PORT"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

PASSED=0
FAILED=0

test_api() {
    local name="$1"
    local method="$2"
    local endpoint="$3"
    local data="$4"
    local expected="$5"

    echo -n "  $name ... "

    if [ "$method" = "POST" ]; then
        response=$(curl -s -X POST "$BASE_URL$endpoint" \
            -H 'Content-Type: application/json' \
            -d "$data")
    else
        response=$(curl -s "$BASE_URL$endpoint")
    fi

    if echo "$response" | jq -e "$expected" > /dev/null 2>&1; then
        echo -e "${GREEN}✅ PASS${NC}"
        ((PASSED++))
        return 0
    else
        echo -e "${RED}❌ FAIL${NC}"
        echo -e "${YELLOW}   Response: $response${NC}"
        ((FAILED++))
        return 1
    fi
}

echo "📋 Checking Prerequisites"
echo "-------------------------"
if ! command -v jq &> /dev/null; then
    echo -e "${RED}❌ jq not installed (brew install jq)${NC}"
    exit 1
fi
echo -e "${GREEN}✅ jq installed${NC}"

if ! curl -s -o /dev/null -w "%{http_code}" "$BASE_URL" | grep -qE "200|404"; then
    echo -e "${RED}❌ Dev server not running on port $PORT${NC}"
    echo "   Run: npm run dev"
    exit 1
fi
echo -e "${GREEN}✅ Dev server running on port $PORT${NC}"
echo ""

# Test 1: Checkout Session Creation
echo -e "${BLUE}🔵 Test 1: Checkout Session Creation${NC}"
echo "-------------------------------------"

test_api \
    "Pro Monthly session" \
    "POST" \
    "/api/checkout/create-session" \
    '{"tier":"pro","billingPeriod":"monthly"}' \
    '.url'

test_api \
    "Pro Annual session" \
    "POST" \
    "/api/checkout/create-session" \
    '{"tier":"pro","billingPeriod":"annual"}' \
    '.url'

test_api \
    "Premium Monthly session" \
    "POST" \
    "/api/checkout/create-session" \
    '{"tier":"premium","billingPeriod":"monthly"}' \
    '.url'

test_api \
    "Premium Annual session" \
    "POST" \
    "/api/checkout/create-session" \
    '{"tier":"premium","billingPeriod":"annual"}' \
    '.url'

echo ""

# Test 2: Validation
echo -e "${BLUE}🔵 Test 2: Input Validation${NC}"
echo "---------------------------"

test_api \
    "Invalid tier rejected" \
    "POST" \
    "/api/checkout/create-session" \
    '{"tier":"invalid","billingPeriod":"monthly"}' \
    '.error'

test_api \
    "Invalid billing period rejected" \
    "POST" \
    "/api/checkout/create-session" \
    '{"tier":"pro","billingPeriod":"invalid"}' \
    '.error'

test_api \
    "Missing tier rejected" \
    "POST" \
    "/api/checkout/create-session" \
    '{"billingPeriod":"monthly"}' \
    '.error'

echo ""

# Test 3: Webhook Endpoint
echo -e "${BLUE}🔵 Test 3: Webhook Endpoint${NC}"
echo "----------------------------"

echo -n "  Webhook endpoint rejects unsigned requests ... "
status=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/api/webhooks/stripe")
if [ "$status" = "400" ]; then
    echo -e "${GREEN}✅ PASS${NC}"
    ((PASSED++))
else
    echo -e "${RED}❌ FAIL (got $status, expected 400)${NC}"
    ((FAILED++))
fi

echo ""

# Test 4: Test Webhooks (requires Stripe CLI)
echo -e "${BLUE}🔵 Test 4: Trigger Test Webhooks${NC}"
echo "-----------------------------------"

if ! command -v stripe &> /dev/null; then
    echo -e "${YELLOW}⚠️  Stripe CLI not installed, skipping webhook tests${NC}"
else
    echo "  Triggering customer.subscription.created ..."
    stripe trigger customer.subscription.created --skip-ui 2>&1 | head -5

    echo "  Triggering invoice.payment_succeeded ..."
    stripe trigger invoice.payment_succeeded --skip-ui 2>&1 | head -5

    echo -e "${GREEN}✅ Webhooks triggered (check logs for processing)${NC}"
fi

echo ""

# Test 5: Environment Variables
echo -e "${BLUE}🔵 Test 5: Environment Check${NC}"
echo "----------------------------"

check_env() {
    local var="$1"
    echo -n "  $var ... "
    if [ -n "${!var}" ]; then
        if [ "$var" = "STRIPE_SECRET_KEY" ]; then
            if echo "${!var}" | grep -q "sk_test_"; then
                echo -e "${GREEN}✅ Set (test mode)${NC}"
                ((PASSED++))
            else
                echo -e "${RED}❌ Not test mode${NC}"
                ((FAILED++))
            fi
        else
            echo -e "${GREEN}✅ Set${NC}"
            ((PASSED++))
        fi
    else
        echo -e "${RED}❌ Not set${NC}"
        ((FAILED++))
    fi
}

check_env "STRIPE_SECRET_KEY"
check_env "STRIPE_WEBHOOK_SECRET"
check_env "STRIPE_PRO_MONTHLY_PRICE_ID"
check_env "STRIPE_PRO_ANNUAL_PRICE_ID"
check_env "STRIPE_PREMIUM_MONTHLY_PRICE_ID"
check_env "STRIPE_PREMIUM_ANNUAL_PRICE_ID"

echo ""

# Summary
echo "===================================="
echo "📊 Test Summary"
echo "===================================="
echo -e "${GREEN}Passed: $PASSED${NC}"
echo -e "${RED}Failed: $FAILED${NC}"
echo ""

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}✅ All API tests passed!${NC}"
    echo ""
    echo -e "${BLUE}Next Steps:${NC}"
    echo "1. Check webhook logs: tail -f /tmp/stripe-webhooks.log"
    echo "2. Manual browser test: http://localhost:$PORT/pricing"
    echo "3. Use test card: 4242 4242 4242 4242"
    echo ""
    exit 0
else
    echo -e "${RED}❌ Some tests failed${NC}"
    exit 1
fi
