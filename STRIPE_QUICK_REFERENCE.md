# Stripe Test Mode - Quick Reference Card

**Print this for easy testing!**

---

## Test Card Numbers

### ✅ Success Cards (any expiry/CVC/ZIP works)

```
Visa Success:        4242 4242 4242 4242
Mastercard Success:  5555 5555 5555 4444
Amex Success:        3782 822463 10005
```

**Default Values**:
- Expiry: `12/34`
- CVC: `123`
- ZIP: `12345`

---

### ❌ Failure Cards

```
Generic Decline:     4000 0000 0000 0002
Insufficient Funds:  4000 0000 0000 9995
Lost Card:           4000 0000 0000 9987
Stolen Card:         4000 0000 0000 9979
Expired Card:        4000 0000 0000 0069
Incorrect CVC:       4000 0000 0000 0127
```

---

### 🔐 Special Cards

```
3D Secure Required:  4000 0025 0000 3155
3D Secure Optional:  4000 0000 0000 3220
Dispute Later:       4000 0082 6000 0000
```

---

## Quick Test Flows

### Test 1: Pro Monthly Success (2 mins)
1. Go to `/pricing`
2. Select "Monthly"
3. Click "Start 7-Day Free Trial" on Pro
4. Email: `test+pro1@test.com`
5. Card: `4242 4242 4242 4242`
6. ✅ Should redirect to success page

### Test 2: Card Declined (1 min)
1. Go to `/pricing`
2. Select "Pro Monthly"
3. Card: `4000 0000 0000 0002`
4. ❌ Should show "Card declined" error

### Test 3: 3D Secure (2 mins)
1. Go to `/pricing`
2. Select "Premium Annual"
3. Card: `4000 0025 0000 3155`
4. ✅ Should show 3DS modal, then success

---

## Stripe CLI Commands

### Start Webhook Listener
```bash
stripe listen --forward-to http://localhost:3000/api/webhooks/stripe
```

### Trigger Test Webhooks
```bash
stripe trigger customer.subscription.created
stripe trigger invoice.payment_succeeded
stripe trigger invoice.payment_failed
stripe trigger customer.subscription.deleted
```

### View Recent Events
```bash
stripe events tail
```

---

## Database Checks (Quick)

### Check Latest Subscription
```sql
SELECT email, tier, status, billing_cycle, trial_end
FROM subscription s
JOIN app_user u ON s.user_id = u.id
ORDER BY s.created_at DESC LIMIT 1;
```

### Check Webhook Events
```sql
SELECT stripe_event_id, event_type, status, attempts
FROM stripe_event_log
ORDER BY created_at DESC LIMIT 5;
```

### Check Payment History
```sql
SELECT email, amount_in_cents, status, tier
FROM payment_history ph
JOIN app_user u ON ph.user_id = u.id
ORDER BY ph.created_at DESC LIMIT 5;
```

---

## URLs

- **Pricing Page**: http://localhost:3000/pricing
- **Success Page**: http://localhost:3000/pricing/success
- **Canceled Page**: http://localhost:3000/pricing/canceled
- **Stripe Dashboard**: https://dashboard.stripe.com/test/dashboard

---

## Expected Behavior

### Pro Monthly Trial
- Trial: 7 days
- Price: $29/month
- Status: `trialing`
- `proTrialUsed` = `true`

### Premium Annual Trial
- Trial: 14 days
- Price: $699/year ($58.25/month)
- Status: `trialing`
- `premiumTrialUsed` = `true`

---

## Error Codes Reference

| Error | Meaning |
|-------|---------|
| `card_declined` | Generic decline |
| `insufficient_funds` | Not enough money |
| `lost_card` | Card reported lost |
| `stolen_card` | Card reported stolen |
| `expired_card` | Card expired |
| `incorrect_cvc` | CVC wrong |

---

## Troubleshooting

### Webhook not received?
```bash
# Check if Stripe CLI is running
ps aux | grep stripe
```

### "Invalid signature" error?
```bash
# Verify webhook secret matches
echo $STRIPE_WEBHOOK_SECRET
stripe listen --print-secret
```

### Database not updating?
```bash
# Check event log for errors
SELECT * FROM stripe_event_log WHERE status = 'failed';
```

---

**Pro Tip**: Keep this window open while testing! 🚀
