-- Forward-only reconciliation for both supported starting states:
-- 1. clean database after journaled migrations 0000 and 0001;
-- 2. the manually evolved Supabase schema used before relaunch.

ALTER TABLE "app_user" ADD COLUMN IF NOT EXISTS "streak_current" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "app_user" ADD COLUMN IF NOT EXISTS "streak_longest" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "app_user" ADD COLUMN IF NOT EXISTS "last_practice_date" timestamp with time zone;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "credit_grant" (
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
	CONSTRAINT "credit_grant_source_check" CHECK ("source" IN ('trial', 'checkout', 'subscription_renewal', 'rollover', 'admin', 'refund', 'migration')),
	CONSTRAINT "credit_grant_balance_check" CHECK ("original_credits" >= 0 AND "remaining_credits" >= 0 AND "reserved_credits" >= 0 AND ("remaining_credits" + "reserved_credits") <= "original_credits")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "credit_reservation" (
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
	CONSTRAINT "credit_reservation_status_check" CHECK ("status" IN ('active', 'consumed', 'released', 'refunded', 'expired')),
	CONSTRAINT "credit_reservation_credits_check" CHECK ("credits" > 0)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "credit_reservation_grant" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reservation_id" uuid NOT NULL,
	"grant_id" uuid NOT NULL,
	"credits" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "credit_reservation_grant_uniq" UNIQUE("reservation_id", "grant_id"),
	CONSTRAINT "credit_reservation_grant_credits_check" CHECK ("credits" > 0)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "credit_transaction" (
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
	CONSTRAINT "credit_transaction_type_check" CHECK ("type" IN ('grant', 'reserve', 'consume', 'release', 'refund', 'expire', 'adjustment', 'rollover')),
	CONSTRAINT "credit_transaction_credits_check" CHECK ("credits" > 0)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_achievement" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"achievement_id" text NOT NULL,
	"earned_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "bookmarked_question" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "practice_set" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "practice_set_question" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"practice_set_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- Normalize legacy/db-push constraint names to the committed Drizzle snapshot.
DO $$
DECLARE
	constraint_record record;
BEGIN
	FOR constraint_record IN
		SELECT conrelid::regclass AS table_name, conname
		FROM pg_constraint
		WHERE contype = 'f'
			AND connamespace = 'public'::regnamespace
			AND conrelid::regclass::text = ANY (ARRAY[
				'credit_grant', 'credit_reservation', 'credit_reservation_grant',
				'credit_transaction', 'user_achievement', 'bookmarked_question',
				'practice_set', 'practice_set_question'
			])
	LOOP
		EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', constraint_record.table_name, constraint_record.conname);
	END LOOP;
END $$;
--> statement-breakpoint
ALTER TABLE "credit_grant" ADD CONSTRAINT "credit_grant_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade;
ALTER TABLE "credit_reservation" ADD CONSTRAINT "credit_reservation_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade;
ALTER TABLE "credit_reservation_grant" ADD CONSTRAINT "credit_reservation_grant_reservation_id_credit_reservation_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."credit_reservation"("id") ON DELETE cascade;
ALTER TABLE "credit_reservation_grant" ADD CONSTRAINT "credit_reservation_grant_grant_id_credit_grant_id_fk" FOREIGN KEY ("grant_id") REFERENCES "public"."credit_grant"("id") ON DELETE cascade;
ALTER TABLE "credit_transaction" ADD CONSTRAINT "credit_transaction_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade;
ALTER TABLE "credit_transaction" ADD CONSTRAINT "credit_transaction_grant_id_credit_grant_id_fk" FOREIGN KEY ("grant_id") REFERENCES "public"."credit_grant"("id") ON DELETE set null;
ALTER TABLE "credit_transaction" ADD CONSTRAINT "credit_transaction_reservation_id_credit_reservation_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."credit_reservation"("id") ON DELETE set null;
ALTER TABLE "user_achievement" ADD CONSTRAINT "user_achievement_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade;
ALTER TABLE "bookmarked_question" ADD CONSTRAINT "bookmarked_question_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade;
ALTER TABLE "bookmarked_question" ADD CONSTRAINT "bookmarked_question_question_id_interview_question_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."interview_question"("id") ON DELETE cascade;
ALTER TABLE "practice_set" ADD CONSTRAINT "practice_set_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade;
ALTER TABLE "practice_set_question" ADD CONSTRAINT "practice_set_question_practice_set_id_practice_set_id_fk" FOREIGN KEY ("practice_set_id") REFERENCES "public"."practice_set"("id") ON DELETE cascade;
ALTER TABLE "practice_set_question" ADD CONSTRAINT "practice_set_question_question_id_interview_question_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."interview_question"("id") ON DELETE cascade;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "livekit_reconnect_rate_limit" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"accepted_at" timestamp with time zone[] DEFAULT ARRAY[]::timestamptz[] NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "livekit_reconnect_rate_limit_capacity_check" CHECK (cardinality("accepted_at") <= 10)
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "credit_grant_user_id_idx" ON "credit_grant" ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "credit_grant_user_expires_idx" ON "credit_grant" ("user_id", "expires_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "credit_grant_catalog_idx" ON "credit_grant" ("catalog_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "credit_grant_source_idx" ON "credit_grant" ("source", "source_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "credit_reservation_user_id_idx" ON "credit_reservation" ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "credit_reservation_status_expires_idx" ON "credit_reservation" ("status", "expires_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "credit_reservation_session_idx" ON "credit_reservation" ("session_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "credit_reservation_grant_grant_idx" ON "credit_reservation_grant" ("grant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "credit_transaction_user_id_idx" ON "credit_transaction" ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "credit_transaction_grant_idx" ON "credit_transaction" ("grant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "credit_transaction_reservation_idx" ON "credit_transaction" ("reservation_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "credit_transaction_type_idx" ON "credit_transaction" ("type");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_achievement_user_id_idx" ON "user_achievement" ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_achievement_achievement_id_idx" ON "user_achievement" ("achievement_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bookmarked_question_user_id_idx" ON "bookmarked_question" ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bookmarked_question_question_id_idx" ON "bookmarked_question" ("question_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "practice_set_user_id_idx" ON "practice_set" ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "practice_set_name_idx" ON "practice_set" ("name");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "practice_set_question_set_idx" ON "practice_set_question" ("practice_set_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "practice_set_question_question_idx" ON "practice_set_question" ("question_id");
--> statement-breakpoint

DO $$
BEGIN
	IF EXISTS (
		SELECT 1 FROM "subscription"
		WHERE "tier" NOT IN ('free', 'starter', 'pro')
	) THEN
		RAISE EXCEPTION 'subscription contains a tier that cannot be reconciled';
	END IF;
	IF EXISTS (
		SELECT 1 FROM "subscription"
		WHERE to_jsonb("subscription")->>'premium_trial_used' = 'true'
	) THEN
		RAISE EXCEPTION 'subscription contains legacy premium trial history that must be archived before reconciliation';
	END IF;
	IF EXISTS (
		SELECT 1 FROM "user_achievement"
		GROUP BY "user_id", "achievement_id" HAVING count(*) > 1
	) THEN
		RAISE EXCEPTION 'user_achievement contains duplicate user/achievement pairs';
	END IF;
	IF EXISTS (
		SELECT 1 FROM "bookmarked_question"
		GROUP BY "user_id", "question_id" HAVING count(*) > 1
	) THEN
		RAISE EXCEPTION 'bookmarked_question contains duplicate user/question pairs';
	END IF;
	IF EXISTS (
		SELECT 1 FROM "practice_set_question"
		GROUP BY "practice_set_id", "question_id" HAVING count(*) > 1
	) THEN
		RAISE EXCEPTION 'practice_set_question contains duplicate set/question pairs';
	END IF;
END $$;
--> statement-breakpoint

ALTER TABLE "subscription" DROP CONSTRAINT IF EXISTS "subscription_tier_check";
--> statement-breakpoint
ALTER TABLE "subscription" ADD CONSTRAINT "subscription_tier_check" CHECK ("tier" IN ('free', 'starter', 'pro'));
--> statement-breakpoint
ALTER TABLE "subscription" DROP COLUMN IF EXISTS "premium_trial_used";
--> statement-breakpoint

DROP INDEX IF EXISTS "user_achievement_user_achievement_idx";
--> statement-breakpoint
CREATE UNIQUE INDEX "user_achievement_user_achievement_idx" ON "user_achievement" ("user_id", "achievement_id");
--> statement-breakpoint
DROP INDEX IF EXISTS "bookmarked_question_user_question_idx";
--> statement-breakpoint
CREATE UNIQUE INDEX "bookmarked_question_user_question_idx" ON "bookmarked_question" ("user_id", "question_id");
--> statement-breakpoint
DROP INDEX IF EXISTS "practice_set_question_set_question_idx";
--> statement-breakpoint
CREATE UNIQUE INDEX "practice_set_question_set_question_idx" ON "practice_set_question" ("practice_set_id", "question_id");
--> statement-breakpoint

ALTER TABLE "app_user" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "interview_session" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "transcript_turn" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "feedback" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "interview_question" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "session_question" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "user_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "user_insights" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "user_achievement" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "bookmarked_question" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "practice_set" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "practice_set_question" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "subscription" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "usage_record" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payment_history" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "stripe_event_log" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "stripe_customer_mapping" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "credit_grant" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "credit_reservation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "credit_reservation_grant" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "credit_transaction" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "livekit_reconnect_rate_limit" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

DO $$
DECLARE
	policy_record record;
BEGIN
	FOR policy_record IN
		SELECT schemaname, tablename, policyname
		FROM pg_policies
		WHERE schemaname = 'public'
			AND tablename = ANY (ARRAY[
				'app_user', 'interview_session', 'transcript_turn', 'feedback',
				'interview_question', 'session_question', 'user_settings',
				'user_insights', 'user_achievement', 'bookmarked_question',
				'practice_set', 'practice_set_question', 'subscription',
				'usage_record', 'payment_history', 'stripe_event_log',
				'stripe_customer_mapping', 'credit_grant', 'credit_reservation',
				'credit_reservation_grant', 'credit_transaction',
				'livekit_reconnect_rate_limit'
			])
	LOOP
		EXECUTE format(
			'DROP POLICY %I ON %I.%I',
			policy_record.policyname,
			policy_record.schemaname,
			policy_record.tablename
		);
	END LOOP;
END $$;
--> statement-breakpoint

REVOKE ALL ON TABLE
	"app_user", "interview_session", "transcript_turn", "feedback",
	"interview_question", "session_question", "user_settings", "user_insights",
	"user_achievement", "bookmarked_question", "practice_set",
	"practice_set_question", "subscription", "usage_record", "payment_history",
	"stripe_event_log", "stripe_customer_mapping", "credit_grant",
	"credit_reservation", "credit_reservation_grant", "credit_transaction",
	"livekit_reconnect_rate_limit"
FROM anon, authenticated;
--> statement-breakpoint
GRANT ALL ON TABLE
	"app_user", "interview_session", "transcript_turn", "feedback",
	"interview_question", "session_question", "user_settings", "user_insights",
	"user_achievement", "bookmarked_question", "practice_set",
	"practice_set_question", "subscription", "usage_record", "payment_history",
	"stripe_event_log", "stripe_customer_mapping", "credit_grant",
	"credit_reservation", "credit_reservation_grant", "credit_transaction",
	"livekit_reconnect_rate_limit"
TO service_role;
--> statement-breakpoint
GRANT SELECT ON TABLE
	"app_user", "interview_session", "transcript_turn", "feedback",
	"session_question", "user_settings", "user_insights", "user_achievement",
	"bookmarked_question", "practice_set", "practice_set_question",
	"subscription", "usage_record", "payment_history", "credit_grant",
	"credit_reservation", "credit_reservation_grant", "credit_transaction"
TO authenticated;
--> statement-breakpoint
GRANT SELECT ON TABLE "interview_question" TO anon, authenticated;
--> statement-breakpoint
GRANT INSERT, DELETE ON TABLE "bookmarked_question" TO authenticated;
GRANT INSERT, UPDATE, DELETE ON TABLE "practice_set" TO authenticated;
GRANT INSERT, DELETE ON TABLE "practice_set_question" TO authenticated;
--> statement-breakpoint

DO $$
DECLARE
	table_name text;
BEGIN
	FOREACH table_name IN ARRAY ARRAY[
		'app_user', 'interview_session', 'transcript_turn', 'feedback',
		'interview_question', 'session_question', 'user_settings',
		'user_insights', 'user_achievement', 'bookmarked_question',
		'practice_set', 'practice_set_question', 'subscription',
		'usage_record', 'payment_history', 'stripe_event_log',
		'stripe_customer_mapping', 'credit_grant', 'credit_reservation',
		'credit_reservation_grant', 'credit_transaction',
		'livekit_reconnect_rate_limit'
	]
	LOOP
		EXECUTE format(
			'CREATE POLICY %I ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)',
			'Service role has full access to ' || table_name,
			table_name
		);
	END LOOP;
END $$;
--> statement-breakpoint

CREATE POLICY "Users can view own profile" ON "app_user"
	FOR SELECT TO authenticated USING ("id" = auth.uid());
CREATE POLICY "Users can view own sessions" ON "interview_session"
	FOR SELECT TO authenticated USING ("user_id" = auth.uid());
CREATE POLICY "Users can view own transcript turns" ON "transcript_turn"
	FOR SELECT TO authenticated USING (EXISTS (
		SELECT 1 FROM "interview_session"
		WHERE "interview_session"."id" = "transcript_turn"."session_id"
			AND "interview_session"."user_id" = auth.uid()
	));
CREATE POLICY "Users can view own feedback" ON "feedback"
	FOR SELECT TO authenticated USING (EXISTS (
		SELECT 1 FROM "interview_session"
		WHERE "interview_session"."id" = "feedback"."session_id"
			AND "interview_session"."user_id" = auth.uid()
	));
CREATE POLICY "Public can view active questions" ON "interview_question"
	FOR SELECT TO anon, authenticated USING ("is_active" = true);
CREATE POLICY "Users can view own session questions" ON "session_question"
	FOR SELECT TO authenticated USING (EXISTS (
		SELECT 1 FROM "interview_session"
		WHERE "interview_session"."id" = "session_question"."session_id"
			AND "interview_session"."user_id" = auth.uid()
	));
CREATE POLICY "Users can view own settings" ON "user_settings"
	FOR SELECT TO authenticated USING ("user_id" = auth.uid());
CREATE POLICY "Users can view own insights" ON "user_insights"
	FOR SELECT TO authenticated USING ("user_id" = auth.uid());
CREATE POLICY "Users can view own achievements" ON "user_achievement"
	FOR SELECT TO authenticated USING ("user_id" = auth.uid());
CREATE POLICY "Users can view own bookmarks" ON "bookmarked_question"
	FOR SELECT TO authenticated USING ("user_id" = auth.uid());
CREATE POLICY "Users can insert own bookmarks" ON "bookmarked_question"
	FOR INSERT TO authenticated WITH CHECK ("user_id" = auth.uid());
CREATE POLICY "Users can delete own bookmarks" ON "bookmarked_question"
	FOR DELETE TO authenticated USING ("user_id" = auth.uid());
CREATE POLICY "Users can view own practice sets" ON "practice_set"
	FOR SELECT TO authenticated USING ("user_id" = auth.uid());
CREATE POLICY "Users can insert own practice sets" ON "practice_set"
	FOR INSERT TO authenticated WITH CHECK ("user_id" = auth.uid());
CREATE POLICY "Users can update own practice sets" ON "practice_set"
	FOR UPDATE TO authenticated USING ("user_id" = auth.uid()) WITH CHECK ("user_id" = auth.uid());
CREATE POLICY "Users can delete own practice sets" ON "practice_set"
	FOR DELETE TO authenticated USING ("user_id" = auth.uid());
CREATE POLICY "Users can view own practice set questions" ON "practice_set_question"
	FOR SELECT TO authenticated USING (EXISTS (
		SELECT 1 FROM "practice_set"
		WHERE "practice_set"."id" = "practice_set_question"."practice_set_id"
			AND "practice_set"."user_id" = auth.uid()
	));
CREATE POLICY "Users can insert own practice set questions" ON "practice_set_question"
	FOR INSERT TO authenticated WITH CHECK (EXISTS (
		SELECT 1 FROM "practice_set"
		WHERE "practice_set"."id" = "practice_set_question"."practice_set_id"
			AND "practice_set"."user_id" = auth.uid()
	));
CREATE POLICY "Users can delete own practice set questions" ON "practice_set_question"
	FOR DELETE TO authenticated USING (EXISTS (
		SELECT 1 FROM "practice_set"
		WHERE "practice_set"."id" = "practice_set_question"."practice_set_id"
			AND "practice_set"."user_id" = auth.uid()
	));
CREATE POLICY "Users can view own subscription" ON "subscription"
	FOR SELECT TO authenticated USING ("user_id" = auth.uid());
CREATE POLICY "Users can view own usage" ON "usage_record"
	FOR SELECT TO authenticated USING ("user_id" = auth.uid());
CREATE POLICY "Users can view own payment history" ON "payment_history"
	FOR SELECT TO authenticated USING ("user_id" = auth.uid());
CREATE POLICY "Users can view own credit grants" ON "credit_grant"
	FOR SELECT TO authenticated USING ("user_id" = auth.uid());
CREATE POLICY "Users can view own credit reservations" ON "credit_reservation"
	FOR SELECT TO authenticated USING ("user_id" = auth.uid());
CREATE POLICY "Users can view own credit reservation grants" ON "credit_reservation_grant"
	FOR SELECT TO authenticated USING (EXISTS (
		SELECT 1 FROM "credit_reservation"
		WHERE "credit_reservation"."id" = "credit_reservation_grant"."reservation_id"
			AND "credit_reservation"."user_id" = auth.uid()
	));
CREATE POLICY "Users can view own credit transactions" ON "credit_transaction"
	FOR SELECT TO authenticated USING ("user_id" = auth.uid());
--> statement-breakpoint

CREATE OR REPLACE FUNCTION "public"."consume_livekit_reconnect_rate_limit"(
	"authenticated_user_id" uuid
)
RETURNS TABLE (
	"allowed" boolean,
	"retry_after_seconds" integer,
	"remaining" integer,
	"reset_at" timestamp with time zone
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
	now_at timestamp with time zone;
	accepted timestamp with time zone[];
	oldest timestamp with time zone;
BEGIN
	IF authenticated_user_id IS NULL THEN
		RAISE EXCEPTION 'authenticated user id is required';
	END IF;

	INSERT INTO livekit_reconnect_rate_limit (user_id)
	VALUES (authenticated_user_id)
	ON CONFLICT (user_id) DO NOTHING;

	SELECT accepted_at INTO accepted
	FROM livekit_reconnect_rate_limit
	WHERE user_id = authenticated_user_id
	FOR UPDATE;

	now_at := clock_timestamp();
	SELECT COALESCE(array_agg(value ORDER BY value), ARRAY[]::timestamptz[])
	INTO accepted
	FROM unnest(accepted) AS value
	WHERE value > now_at - interval '60 seconds';

	IF cardinality(accepted) < 10 THEN
		accepted := array_append(accepted, now_at);
		UPDATE livekit_reconnect_rate_limit
		SET accepted_at = accepted, updated_at = now_at
		WHERE user_id = authenticated_user_id;

		allowed := true;
		retry_after_seconds := 0;
		remaining := 10 - cardinality(accepted);
		reset_at := accepted[1] + interval '60 seconds';
		RETURN NEXT;
		RETURN;
	END IF;

	oldest := accepted[1];
	allowed := false;
	retry_after_seconds := GREATEST(
		1,
		CEIL(EXTRACT(EPOCH FROM (oldest + interval '60 seconds' - now_at)))::integer
	);
	remaining := 0;
	reset_at := oldest + interval '60 seconds';
	RETURN NEXT;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "public"."consume_livekit_reconnect_rate_limit"(uuid)
	FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION "public"."consume_livekit_reconnect_rate_limit"(uuid)
	TO service_role;
