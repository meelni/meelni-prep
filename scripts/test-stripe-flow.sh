#!/bin/bash

# Stripe Payment Flow Test Helper
# Run this script to start Stripe webhook forwarding and dev server

set -e

echo "🔵 Meelni Stripe Test Mode"
echo "=========================="
echo ""

# Check if Stripe CLI is installed
if ! command -v stripe &> /dev/null; then
    echo "❌ Stripe CLI not found!"
    echo ""
    echo "Install with: brew install stripe/stripe-cli/stripe"
    echo "Or download from: https://stripe.com/docs/stripe-cli"
    exit 1
fi

echo "✅ Stripe CLI installed"

# Check if logged in
if ! stripe config --list &> /dev/null; then
    echo "⚠️  Not logged in to Stripe CLI"
    echo ""
    echo "Run: stripe login"
    exit 1
fi

echo "✅ Stripe CLI authenticated"
echo ""

# Display test card numbers
echo "📋 Quick Reference - Test Card Numbers:"
echo "--------------------------------------"
echo "✅ Success:          4242 4242 4242 4242"
echo "❌ Declined:         4000 0000 0000 0002"
echo "💰 Insufficient:     4000 0000 0000 9995"
echo "🔐 3D Secure:        4000 0025 0000 3155"
echo ""
echo "Expiry: 12/34 | CVC: 123 | ZIP: 12345"
echo ""

# Ask user which mode
echo "Select mode:"
echo "1) Start webhook listener + dev server (recommended)"
echo "2) Start webhook listener only"
echo "3) View Stripe events dashboard"
echo "4) Trigger test webhook"
echo ""
read -p "Enter choice (1-4): " choice

case $choice in
    1)
        echo ""
        echo "🚀 Starting webhook listener and dev server..."
        echo ""

        # Start Stripe webhook listener in background
        echo "📡 Starting Stripe webhook listener..."
        stripe listen --forward-to http://localhost:3000/api/webhooks/stripe &
        STRIPE_PID=$!

        # Wait for webhook listener to start
        sleep 3

        # Start Next.js dev server
        echo "🔧 Starting Next.js dev server..."
        npm run dev &
        NEXT_PID=$!

        echo ""
        echo "✅ Services started!"
        echo ""
        echo "Stripe webhook listener: PID $STRIPE_PID"
        echo "Next.js dev server: PID $NEXT_PID"
        echo ""
        echo "📝 Open http://localhost:3000/pricing to start testing"
        echo ""
        echo "Press Ctrl+C to stop all services"

        # Wait for Ctrl+C
        trap "kill $STRIPE_PID $NEXT_PID 2>/dev/null; echo ''; echo '✅ Services stopped'; exit 0" INT
        wait
        ;;

    2)
        echo ""
        echo "📡 Starting Stripe webhook listener only..."
        echo ""
        stripe listen --forward-to http://localhost:3000/api/webhooks/stripe
        ;;

    3)
        echo ""
        echo "📊 Opening Stripe events dashboard..."
        stripe events tail
        ;;

    4)
        echo ""
        echo "Select webhook to trigger:"
        echo "1) customer.subscription.created"
        echo "2) invoice.payment_succeeded"
        echo "3) invoice.payment_failed"
        echo "4) customer.subscription.deleted"
        echo "5) charge.refunded"
        echo ""
        read -p "Enter choice (1-5): " webhook_choice

        case $webhook_choice in
            1) stripe trigger customer.subscription.created ;;
            2) stripe trigger invoice.payment_succeeded ;;
            3) stripe trigger invoice.payment_failed ;;
            4) stripe trigger customer.subscription.deleted ;;
            5) stripe trigger charge.refunded ;;
            *) echo "Invalid choice" ;;
        esac
        ;;

    *)
        echo "Invalid choice"
        exit 1
        ;;
esac
