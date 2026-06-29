CREATE TABLE "credit_grant" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"catalog_id" text NOT NULL,
	"source" text NOT NULL,
	"source_id" text,
	"idempotency_key" text NOT NULL,
	"original_credits" integer NOT NULL,
	"remaining_credits" integer NOT NULL,
	"reserved_credits" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone,
	"rollover_eligible" boolean DEFAULT false NOT NULL,
	"rollover_source_grant_id" uuid,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "credit_grant_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "credit_grant_source_check" CHECK ("credit_grant"."source" IN ('trial', 'checkout', 'subscription_renewal', 'rollover', 'admin', 'refund', 'migration')),
	CONSTRAINT "credit_grant_balance_check" CHECK ("credit_grant"."original_credits" >= 0 AND "credit_grant"."remaining_credits" >= 0 AND "credit_grant"."reserved_credits" >= 0 AND ("credit_grant"."remaining_credits" + "credit_grant"."reserved_credits") <= "credit_grant"."original_credits")
);
--> statement-breakpoint
CREATE TABLE "credit_reservation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"reservation_key" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"credits" integer DEFAULT 1 NOT NULL,
	"session_id" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "credit_reservation_reservation_key_unique" UNIQUE("reservation_key"),
	CONSTRAINT "credit_reservation_status_check" CHECK ("credit_reservation"."status" IN ('active', 'consumed', 'released', 'refunded', 'expired')),
	CONSTRAINT "credit_reservation_credits_check" CHECK ("credit_reservation"."credits" > 0)
);
--> statement-breakpoint
CREATE TABLE "credit_reservation_grant" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reservation_id" uuid NOT NULL,
	"grant_id" uuid NOT NULL,
	"credits" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "credit_reservation_grant_uniq" UNIQUE("reservation_id","grant_id"),
	CONSTRAINT "credit_reservation_grant_credits_check" CHECK ("credit_reservation_grant"."credits" > 0)
);
--> statement-breakpoint
CREATE TABLE "credit_transaction" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"grant_id" uuid,
	"reservation_id" uuid,
	"type" text NOT NULL,
	"credits" integer NOT NULL,
	"idempotency_key" text NOT NULL,
	"source_id" text,
	"balance_after" integer,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "credit_transaction_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "credit_transaction_type_check" CHECK ("credit_transaction"."type" IN ('grant', 'reserve', 'consume', 'release', 'refund', 'expire', 'adjustment', 'rollover')),
	CONSTRAINT "credit_transaction_credits_check" CHECK ("credit_transaction"."credits" > 0)
);
--> statement-breakpoint
ALTER TABLE "credit_grant" ADD CONSTRAINT "credit_grant_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "credit_reservation" ADD CONSTRAINT "credit_reservation_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "credit_reservation_grant" ADD CONSTRAINT "credit_reservation_grant_reservation_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."credit_reservation"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "credit_reservation_grant" ADD CONSTRAINT "credit_reservation_grant_grant_id_fk" FOREIGN KEY ("grant_id") REFERENCES "public"."credit_grant"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "credit_transaction" ADD CONSTRAINT "credit_transaction_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "credit_transaction" ADD CONSTRAINT "credit_transaction_grant_id_fk" FOREIGN KEY ("grant_id") REFERENCES "public"."credit_grant"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "credit_transaction" ADD CONSTRAINT "credit_transaction_reservation_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."credit_reservation"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "credit_grant_user_id_idx" ON "credit_grant" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX "credit_grant_user_expires_idx" ON "credit_grant" USING btree ("user_id","expires_at");
--> statement-breakpoint
CREATE INDEX "credit_grant_catalog_idx" ON "credit_grant" USING btree ("catalog_id");
--> statement-breakpoint
CREATE INDEX "credit_grant_source_idx" ON "credit_grant" USING btree ("source","source_id");
--> statement-breakpoint
CREATE INDEX "credit_reservation_user_id_idx" ON "credit_reservation" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX "credit_reservation_status_expires_idx" ON "credit_reservation" USING btree ("status","expires_at");
--> statement-breakpoint
CREATE INDEX "credit_reservation_session_idx" ON "credit_reservation" USING btree ("session_id");
--> statement-breakpoint
CREATE INDEX "credit_reservation_grant_grant_idx" ON "credit_reservation_grant" USING btree ("grant_id");
--> statement-breakpoint
CREATE INDEX "credit_transaction_user_id_idx" ON "credit_transaction" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX "credit_transaction_grant_idx" ON "credit_transaction" USING btree ("grant_id");
--> statement-breakpoint
CREATE INDEX "credit_transaction_reservation_idx" ON "credit_transaction" USING btree ("reservation_id");
--> statement-breakpoint
CREATE INDEX "credit_transaction_type_idx" ON "credit_transaction" USING btree ("type");
--> statement-breakpoint
ALTER TABLE credit_grant ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE credit_reservation ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE credit_reservation_grant ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE credit_transaction ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "Users can view own credit grants" ON credit_grant FOR SELECT USING (auth.uid() = user_id);
--> statement-breakpoint
CREATE POLICY "Service can manage credit grants" ON credit_grant FOR ALL USING (auth.role() = 'service_role');
--> statement-breakpoint
CREATE POLICY "Users can view own credit reservations" ON credit_reservation FOR SELECT USING (auth.uid() = user_id);
--> statement-breakpoint
CREATE POLICY "Service can manage credit reservations" ON credit_reservation FOR ALL USING (auth.role() = 'service_role');
--> statement-breakpoint
CREATE POLICY "Users can view own credit reservation grants" ON credit_reservation_grant FOR SELECT USING (
	EXISTS (
		SELECT 1 FROM credit_reservation
		WHERE credit_reservation.id = credit_reservation_grant.reservation_id
			AND credit_reservation.user_id = auth.uid()
	)
);
--> statement-breakpoint
CREATE POLICY "Service can manage credit reservation grants" ON credit_reservation_grant FOR ALL USING (auth.role() = 'service_role');
--> statement-breakpoint
CREATE POLICY "Users can view own credit transactions" ON credit_transaction FOR SELECT USING (auth.uid() = user_id);
--> statement-breakpoint
CREATE POLICY "Service can manage credit transactions" ON credit_transaction FOR ALL USING (auth.role() = 'service_role');
