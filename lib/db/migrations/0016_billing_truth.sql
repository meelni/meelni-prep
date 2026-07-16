CREATE TABLE "billing_adjustment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"payment_history_id" uuid,
	"credit_grant_id" uuid,
	"stripe_event_id" text NOT NULL,
	"provider_adjustment_id" text NOT NULL,
	"adjustment_type" text NOT NULL,
	"direction" text NOT NULL,
	"amount_in_cents" integer,
	"currency" text,
	"source_credits" integer NOT NULL,
	"remaining_credits" integer NOT NULL,
	"reserved_credits" integer NOT NULL,
	"consumed_credits" integer NOT NULL,
	"revoked_credits" integer NOT NULL,
	"unrecoverable_credits" integer NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "billing_adjustment_stripe_event_id_unique" UNIQUE("stripe_event_id"),
	CONSTRAINT "billing_adjustment_provider_direction_uniq" UNIQUE("provider_adjustment_id","direction"),
	CONSTRAINT "billing_adjustment_type_check" CHECK ("billing_adjustment"."adjustment_type" IN ('refund', 'dispute')),
	CONSTRAINT "billing_adjustment_direction_check" CHECK ("billing_adjustment"."direction" IN ('withdraw', 'reinstate')),
	CONSTRAINT "billing_adjustment_quantities_check" CHECK ("billing_adjustment"."source_credits" >= 0 AND "billing_adjustment"."remaining_credits" >= 0 AND "billing_adjustment"."reserved_credits" >= 0 AND "billing_adjustment"."consumed_credits" >= 0 AND "billing_adjustment"."revoked_credits" >= 0 AND "billing_adjustment"."unrecoverable_credits" >= 0 AND "billing_adjustment"."revoked_credits" = ("billing_adjustment"."remaining_credits" + "billing_adjustment"."reserved_credits") AND "billing_adjustment"."consumed_credits" <= "billing_adjustment"."unrecoverable_credits" AND ("billing_adjustment"."revoked_credits" + "billing_adjustment"."unrecoverable_credits") <= "billing_adjustment"."source_credits")
);
--> statement-breakpoint
CREATE TABLE "billing_payment_state" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"payment_history_id" uuid,
	"credit_grant_id" uuid NOT NULL,
	"source_credits" integer NOT NULL,
	"target_credits" integer NOT NULL,
	"revoked_credits" integer NOT NULL,
	"unrecoverable_credits" integer NOT NULL,
	"consumed_credits" integer NOT NULL,
	"grant_revocations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"allocation_revocations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"last_provider_adjustment_id" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "billing_payment_state_payment_history_id_unique" UNIQUE("payment_history_id"),
	CONSTRAINT "billing_payment_state_credit_grant_id_unique" UNIQUE("credit_grant_id"),
	CONSTRAINT "billing_payment_state_quantities_check" CHECK ("billing_payment_state"."source_credits" >= 0 AND "billing_payment_state"."target_credits" >= 0 AND "billing_payment_state"."target_credits" <= "billing_payment_state"."source_credits" AND "billing_payment_state"."revoked_credits" >= 0 AND "billing_payment_state"."unrecoverable_credits" >= 0 AND "billing_payment_state"."consumed_credits" >= 0 AND "billing_payment_state"."revoked_credits" + "billing_payment_state"."unrecoverable_credits" = "billing_payment_state"."target_credits" AND "billing_payment_state"."consumed_credits" <= "billing_payment_state"."unrecoverable_credits" AND "billing_payment_state"."version" >= 1)
);
--> statement-breakpoint
CREATE TABLE "credit_rollover_lot" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"rollover_grant_id" uuid NOT NULL,
	"source_grant_id" uuid NOT NULL,
	"original_credits" integer NOT NULL,
	"remaining_credits" integer NOT NULL,
	"reserved_credits" integer DEFAULT 0 NOT NULL,
	"consumed_credits" integer DEFAULT 0 NOT NULL,
	"revoked_credits" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "credit_rollover_lot_grant_source_uniq" UNIQUE("rollover_grant_id","source_grant_id"),
	CONSTRAINT "credit_rollover_lot_balance_check" CHECK ("credit_rollover_lot"."original_credits" > 0 AND "credit_rollover_lot"."remaining_credits" >= 0 AND "credit_rollover_lot"."reserved_credits" >= 0 AND "credit_rollover_lot"."consumed_credits" >= 0 AND "credit_rollover_lot"."revoked_credits" >= 0 AND "credit_rollover_lot"."original_credits" = ("credit_rollover_lot"."remaining_credits" + "credit_rollover_lot"."reserved_credits" + "credit_rollover_lot"."consumed_credits" + "credit_rollover_lot"."revoked_credits"))
);
--> statement-breakpoint
CREATE TABLE "credit_rollover_lot_allocation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reservation_grant_id" uuid NOT NULL,
	"rollover_lot_id" uuid NOT NULL,
	"credits" integer NOT NULL,
	"revoked_credits" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "credit_rollover_lot_allocation_uniq" UNIQUE("reservation_grant_id","rollover_lot_id"),
	CONSTRAINT "credit_rollover_lot_allocation_credits_check" CHECK ("credit_rollover_lot_allocation"."credits" > 0 AND "credit_rollover_lot_allocation"."revoked_credits" >= 0 AND "credit_rollover_lot_allocation"."revoked_credits" <= "credit_rollover_lot_allocation"."credits")
);
--> statement-breakpoint
ALTER TABLE "payment_history" DROP CONSTRAINT "payment_history_status_check";--> statement-breakpoint
ALTER TABLE "credit_grant" ADD COLUMN "revoked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "credit_grant" ADD COLUMN "revocation_key" text;--> statement-breakpoint
ALTER TABLE "credit_reservation_grant" ADD COLUMN "revoked_credits" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "payment_history" ADD COLUMN "stripe_checkout_session_id" text;--> statement-breakpoint
ALTER TABLE "payment_history" ADD COLUMN "stripe_charge_id" text;--> statement-breakpoint
ALTER TABLE "payment_history" ADD COLUMN "credit_grant_id" uuid;--> statement-breakpoint
ALTER TABLE "payment_history" ADD COLUMN "catalog_id" text;--> statement-breakpoint
ALTER TABLE "billing_adjustment" ADD CONSTRAINT "billing_adjustment_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_adjustment" ADD CONSTRAINT "billing_adjustment_payment_history_id_payment_history_id_fk" FOREIGN KEY ("payment_history_id") REFERENCES "public"."payment_history"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_adjustment" ADD CONSTRAINT "billing_adjustment_credit_grant_id_credit_grant_id_fk" FOREIGN KEY ("credit_grant_id") REFERENCES "public"."credit_grant"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_payment_state" ADD CONSTRAINT "billing_payment_state_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_payment_state" ADD CONSTRAINT "billing_payment_state_payment_history_id_payment_history_id_fk" FOREIGN KEY ("payment_history_id") REFERENCES "public"."payment_history"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_payment_state" ADD CONSTRAINT "billing_payment_state_credit_grant_id_credit_grant_id_fk" FOREIGN KEY ("credit_grant_id") REFERENCES "public"."credit_grant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_rollover_lot" ADD CONSTRAINT "credit_rollover_lot_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_rollover_lot" ADD CONSTRAINT "credit_rollover_lot_rollover_grant_id_credit_grant_id_fk" FOREIGN KEY ("rollover_grant_id") REFERENCES "public"."credit_grant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_rollover_lot" ADD CONSTRAINT "credit_rollover_lot_source_grant_id_credit_grant_id_fk" FOREIGN KEY ("source_grant_id") REFERENCES "public"."credit_grant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_rollover_lot_allocation" ADD CONSTRAINT "credit_rollover_lot_allocation_reservation_grant_id_credit_reservation_grant_id_fk" FOREIGN KEY ("reservation_grant_id") REFERENCES "public"."credit_reservation_grant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_rollover_lot_allocation" ADD CONSTRAINT "credit_rollover_lot_allocation_rollover_lot_id_credit_rollover_lot_id_fk" FOREIGN KEY ("rollover_lot_id") REFERENCES "public"."credit_rollover_lot"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "billing_adjustment_user_id_idx" ON "billing_adjustment" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "billing_adjustment_payment_history_id_idx" ON "billing_adjustment" USING btree ("payment_history_id");--> statement-breakpoint
CREATE INDEX "billing_adjustment_credit_grant_id_idx" ON "billing_adjustment" USING btree ("credit_grant_id");--> statement-breakpoint
CREATE INDEX "billing_payment_state_user_id_idx" ON "billing_payment_state" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "billing_payment_state_credit_grant_id_idx" ON "billing_payment_state" USING btree ("credit_grant_id");--> statement-breakpoint
CREATE INDEX "credit_rollover_lot_user_id_idx" ON "credit_rollover_lot" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "credit_rollover_lot_source_grant_id_idx" ON "credit_rollover_lot" USING btree ("source_grant_id");--> statement-breakpoint
CREATE INDEX "credit_rollover_lot_allocation_lot_id_idx" ON "credit_rollover_lot_allocation" USING btree ("rollover_lot_id");--> statement-breakpoint
ALTER TABLE "payment_history" ADD CONSTRAINT "payment_history_credit_grant_id_credit_grant_id_fk" FOREIGN KEY ("credit_grant_id") REFERENCES "public"."credit_grant"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payment_history_stripe_invoice_id_idx" ON "payment_history" USING btree ("stripe_invoice_id");--> statement-breakpoint
CREATE INDEX "payment_history_credit_grant_id_idx" ON "payment_history" USING btree ("credit_grant_id");--> statement-breakpoint
ALTER TABLE "payment_history" ADD CONSTRAINT "payment_history_stripe_checkout_session_id_unique" UNIQUE("stripe_checkout_session_id");--> statement-breakpoint
ALTER TABLE "payment_history" ADD CONSTRAINT "payment_history_stripe_charge_id_unique" UNIQUE("stripe_charge_id");--> statement-breakpoint
ALTER TABLE "credit_reservation_grant" ADD CONSTRAINT "credit_reservation_grant_revoked_credits_check" CHECK ("credit_reservation_grant"."revoked_credits" >= 0 AND "credit_reservation_grant"."revoked_credits" <= "credit_reservation_grant"."credits");--> statement-breakpoint
ALTER TABLE "payment_history" ADD CONSTRAINT "payment_history_status_check" CHECK ("payment_history"."status" IN ('succeeded', 'failed', 'partially_refunded', 'refunded', 'disputed', 'canceled'));
--> statement-breakpoint
ALTER TABLE "billing_adjustment" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "billing_payment_state" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "credit_rollover_lot" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "credit_rollover_lot_allocation" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "Service role has full access to billing_adjustment"
ON "billing_adjustment" FOR ALL TO service_role USING (true) WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY "Service role has full access to billing_payment_state"
ON "billing_payment_state" FOR ALL TO service_role USING (true) WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY "Service role has full access to credit_rollover_lot"
ON "credit_rollover_lot" FOR ALL TO service_role USING (true) WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY "Service role has full access to credit_rollover_lot_allocation"
ON "credit_rollover_lot_allocation" FOR ALL TO service_role USING (true) WITH CHECK (true);
--> statement-breakpoint
CREATE OR REPLACE FUNCTION enforce_billing_adjustment_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'billing adjustment evidence is immutable';
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION enforce_billing_adjustment_immutable() FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION enforce_billing_adjustment_immutable() FROM anon;
--> statement-breakpoint
REVOKE ALL ON FUNCTION enforce_billing_adjustment_immutable() FROM authenticated;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION enforce_billing_adjustment_immutable() TO service_role;
--> statement-breakpoint
CREATE TRIGGER billing_adjustment_immutable
BEFORE UPDATE ON "billing_adjustment"
FOR EACH ROW
EXECUTE FUNCTION enforce_billing_adjustment_immutable();
