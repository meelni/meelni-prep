# Stripe Webhook Event Contract

Updated: 2026-07-19
Owner: SAV-126

Meelni Stripe endpoints must subscribe to the exact required event allowlist
below. The optional event may be enabled, but its absence does not block
billing readiness. Wildcard delivery and unrelated event types are not
accepted configuration because they expand the endpoint's payload surface
without a product workflow.

The executable source is
`lib/billing/stripe-webhook-events.ts`. The runtime handler dispatches through
its action map. The provider-free operator command and documentation contract
tests consume that same source:

```bash
npm run stripe:webhook-events -- --format=json
npm run stripe:webhook-events -- --verify-enabled-events-file=/absolute/path/to/sanitized-endpoint.json
```

The verification file must be a JSON event array or a sanitized Stripe
endpoint object containing `enabled_events`. It must not contain signing
secrets, credentials, customer data, or raw delivery payloads.

<!-- stripe-webhook-event-contract:start -->

Required events (16):

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`
- `checkout.session.async_payment_failed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.payment_succeeded`
- `invoice.payment_failed`
- `refund.created`
- `refund.updated`
- `refund.failed`
- `charge.refunded`
- `charge.dispute.created`
- `charge.dispute.funds_withdrawn`
- `charge.dispute.funds_reinstated`
- `charge.dispute.closed`

Optional events (1):

- `customer.subscription.trial_will_end`
<!-- stripe-webhook-event-contract:end -->

## Delivery Boundary

- Verify the `Stripe-Signature` before processing any event.
- Keep Preview/staging and Production endpoints and signing secrets separate.
- Configure all required events even if a particular receipt exercises only a
  subset. A successful Checkout or renewal receipt does not prove refund and
  dispute delivery coverage.
- Treat endpoint configuration as stale whenever executable contract
  verification fails. Repair and redeploy the matching environment before
  relying on billing rehearsals.
- Unknown signed events remain safe no-ops in the handler, but their presence
  in endpoint configuration is a configuration error.

## Change Process

Adding or removing a required event is a billing behavior change. Update the
executable definition, handler action, tests, this contract, the live
checklist, test plan, and launch runbook in the same PR. Provider endpoint
mutation and signed delivery verification remain separate authorized
operational steps.
