REVOKE ALL ON TABLE
  "billing_adjustment",
  "billing_payment_state",
  "credit_rollover_lot",
  "credit_rollover_lot_allocation"
FROM PUBLIC, anon, authenticated;
--> statement-breakpoint
GRANT ALL ON TABLE
  "billing_adjustment",
  "billing_payment_state",
  "credit_rollover_lot",
  "credit_rollover_lot_allocation"
TO service_role;
