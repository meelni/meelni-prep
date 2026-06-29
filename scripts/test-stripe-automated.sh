#!/bin/bash

# Automated Stripe Testing Script
# Tests everything that doesn't require browser interaction

set -e

echo "🧪 Meelni Stripe - Automated Tests"
echo "===================================="
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Counters
PASSED=0
FAILED=0

# Test function
test_case() {
    local name="$1"
    local command="$2"

    echo -n "Testing: $name ... "

    if eval "$command" > /dev/null 2>&1; then
        echo -e "${GREEN}✅ PASS${NC}"
        ((PASSED++))
    else
        echo -e "${RED}❌ FAIL${NC}"
        ((FAILED++))
    fi
}

# Check prerequisites
echo "📋 Checking Prerequisites..."
echo "----------------------------"

test_case "Stripe CLI installed" "command -v stripe"
test_case "Node.js installed" "command -v node"
test_case "Database accessible" "psql $DATABASE_URL -c 'SELECT 1' -t -A"

echo ""

# Test 1: Checkout Session Creation API
echo "🔵 Test 1: Checkout Session Creation API"
echo "-----------------------------------------"

test_case "Interview Pass checkout session" \
    "curl -s -X POST http://localhost:3002/api/checkout/create-session \
    -H 'Content-Type: application/json' \
    -d '{\"catalogId\":\"interview_pass\"}' \
    | jq -e '.url' > /dev/null"

test_case "Starter checkout session" \
    "curl -s -X POST http://localhost:3002/api/checkout/create-session \
    -H 'Content-Type: application/json' \
    -d '{\"catalogId\":\"starter\"}' \
    | jq -e '.url' > /dev/null"

test_case "Pro checkout session" \
    "curl -s -X POST http://localhost:3002/api/checkout/create-session \
    -H 'Content-Type: application/json' \
    -d '{\"catalogId\":\"pro\"}' \
    | jq -e '.url' > /dev/null"

test_case "Invalid catalog ID rejected" \
    "curl -s -X POST http://localhost:3002/api/checkout/create-session \
    -H 'Content-Type: application/json' \
    -d '{\"catalogId\":\"invalid\"}' \
    | jq -e '.error' > /dev/null"

echo ""

# Test 2: Webhook Signature Validation
echo "🔵 Test 2: Webhook Handler"
echo "--------------------------"

test_case "Webhook endpoint exists" \
    "curl -s -o /dev/null -w '%{http_code}' http://localhost:3002/api/webhooks/stripe | grep -q 400"

echo ""

# Test 3: Trigger Test Webhooks
echo "🔵 Test 3: Webhook Event Processing"
echo "------------------------------------"

echo "Triggering customer.subscription.created webhook..."
stripe trigger customer.subscription.created --skip-ui 2>&1 | grep -q "Ready!"

sleep 2

test_case "Webhook received and processed" \
    "psql $DATABASE_URL -c \"SELECT COUNT(*) FROM stripe_event_log WHERE event_type = 'customer.subscription.created'\" -t -A | grep -qE '[1-9]'"

echo ""
echo "Triggering invoice.payment_succeeded webhook..."
stripe trigger invoice.payment_succeeded --skip-ui 2>&1 | grep -q "Ready!"

sleep 2

test_case "Payment webhook processed" \
    "psql $DATABASE_URL -c \"SELECT COUNT(*) FROM stripe_event_log WHERE event_type = 'invoice.payment_succeeded'\" -t -A | grep -qE '[1-9]'"

echo ""

# Test 4: Database Schema
echo "🔵 Test 4: Database Schema Validation"
echo "--------------------------------------"

test_case "subscription table exists" \
    "psql $DATABASE_URL -c \"SELECT to_regclass('public.subscription')\" -t -A | grep -q subscription"

test_case "stripe_event_log table exists" \
    "psql $DATABASE_URL -c \"SELECT to_regclass('public.stripe_event_log')\" -t -A | grep -q stripe_event_log"

test_case "payment_history table exists" \
    "psql $DATABASE_URL -c \"SELECT to_regclass('public.payment_history')\" -t -A | grep -q payment_history"

test_case "stripe_customer_mapping table exists" \
    "psql $DATABASE_URL -c \"SELECT to_regclass('public.stripe_customer_mapping')\" -t -A | grep -q stripe_customer_mapping"

test_case "usage_record table exists" \
    "psql $DATABASE_URL -c \"SELECT to_regclass('public.usage_record')\" -t -A | grep -q usage_record"

echo ""

# Test 5: Webhook Idempotency
echo "🔵 Test 5: Webhook Idempotency"
echo "-------------------------------"

# Get the most recent event ID
RECENT_EVENT=$(psql $DATABASE_URL -c "SELECT stripe_event_id FROM stripe_event_log ORDER BY created_at DESC LIMIT 1" -t -A | xargs)

if [ -n "$RECENT_EVENT" ]; then
    INITIAL_COUNT=$(psql $DATABASE_URL -c "SELECT attempts FROM stripe_event_log WHERE stripe_event_id = '$RECENT_EVENT'" -t -A)

    echo "Testing duplicate event: $RECENT_EVENT (current attempts: $INITIAL_COUNT)"

    # Note: We can't actually resend the exact same event via CLI
    # This would need to be tested manually via Stripe Dashboard
    echo -e "${YELLOW}⚠️  Manual test required: Resend webhook in Stripe Dashboard${NC}"
else
    echo -e "${YELLOW}⚠️  No events in log yet, skipping idempotency test${NC}"
fi

echo ""

# Test 6: Environment Variables
echo "🔵 Test 6: Environment Variables"
echo "---------------------------------"

test_case "STRIPE_SECRET_KEY set" "[ -n \"$STRIPE_SECRET_KEY\" ]"
test_case "STRIPE_WEBHOOK_SECRET set" "[ -n \"$STRIPE_WEBHOOK_SECRET\" ]"
test_case "STRIPE_INTERVIEW_PASS_PRICE_ID set" "[ -n \"$STRIPE_INTERVIEW_PASS_PRICE_ID\" ]"
test_case "STRIPE_STARTER_MONTHLY_PRICE_ID set" "[ -n \"$STRIPE_STARTER_MONTHLY_PRICE_ID\" ]"
test_case "STRIPE_PRO_MONTHLY_PRICE_ID set" "[ -n \"$STRIPE_PRO_MONTHLY_PRICE_ID\" ]"

test_case "Using test mode keys" "echo $STRIPE_SECRET_KEY | grep -q sk_test_"

echo ""

# Summary
echo "===================================="
echo "📊 Test Summary"
echo "===================================="
echo -e "${GREEN}Passed: $PASSED${NC}"
echo -e "${RED}Failed: $FAILED${NC}"
echo ""

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}✅ All automated tests passed!${NC}"
    echo ""
    echo "Manual tests still required:"
    echo "1. Full checkout flow (requires browser)"
    echo "2. Card decline scenarios"
    echo "3. 3D Secure authentication"
    echo "4. Webhook idempotency (resend in Dashboard)"
    exit 0
else
    echo -e "${RED}❌ Some tests failed${NC}"
    exit 1
fi
