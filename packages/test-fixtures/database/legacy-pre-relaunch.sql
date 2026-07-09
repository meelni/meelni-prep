-- Sanitized contract fixture for the manually evolved schema audited before
-- relaunch. It is intentionally independent from the reconciliation migration.

ALTER TABLE app_user ADD COLUMN streak_current integer DEFAULT 0 NOT NULL;
ALTER TABLE app_user ADD COLUMN streak_longest integer DEFAULT 0 NOT NULL;
ALTER TABLE app_user ADD COLUMN last_practice_date timestamptz;
ALTER TABLE subscription DROP COLUMN premium_trial_used;

CREATE TABLE credit_grant (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  catalog_id text NOT NULL,
  source text NOT NULL,
  source_id text,
  idempotency_key text NOT NULL,
  original_credits integer NOT NULL,
  remaining_credits integer NOT NULL,
  reserved_credits integer DEFAULT 0 NOT NULL,
  expires_at timestamptz,
  rollover_eligible boolean DEFAULT false NOT NULL,
  rollover_source_grant_id uuid,
  metadata jsonb,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT credit_grant_idempotency_key_unique UNIQUE (idempotency_key),
  CONSTRAINT credit_grant_source_check CHECK (source IN ('trial', 'checkout', 'subscription_renewal', 'rollover', 'admin', 'refund', 'migration')),
  CONSTRAINT credit_grant_balance_check CHECK (original_credits >= 0 AND remaining_credits >= 0 AND reserved_credits >= 0 AND remaining_credits + reserved_credits <= original_credits),
  CONSTRAINT credit_grant_user_id_app_user_id_fk FOREIGN KEY (user_id) REFERENCES app_user(id) ON DELETE CASCADE
);

CREATE TABLE credit_reservation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  reservation_key text NOT NULL,
  status text DEFAULT 'active' NOT NULL,
  credits integer DEFAULT 1 NOT NULL,
  session_id uuid,
  expires_at timestamptz NOT NULL,
  metadata jsonb,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT credit_reservation_reservation_key_unique UNIQUE (reservation_key),
  CONSTRAINT credit_reservation_status_check CHECK (status IN ('active', 'consumed', 'released', 'refunded', 'expired')),
  CONSTRAINT credit_reservation_credits_check CHECK (credits > 0),
  CONSTRAINT credit_reservation_user_id_app_user_id_fk FOREIGN KEY (user_id) REFERENCES app_user(id) ON DELETE CASCADE
);

CREATE TABLE credit_reservation_grant (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  reservation_id uuid NOT NULL,
  grant_id uuid NOT NULL,
  credits integer NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT credit_reservation_grant_uniq UNIQUE (reservation_id, grant_id),
  CONSTRAINT credit_reservation_grant_credits_check CHECK (credits > 0),
  CONSTRAINT credit_reservation_grant_reservation_id_credit_reservation_id_fk FOREIGN KEY (reservation_id) REFERENCES credit_reservation(id) ON DELETE CASCADE,
  CONSTRAINT credit_reservation_grant_grant_id_credit_grant_id_fk FOREIGN KEY (grant_id) REFERENCES credit_grant(id) ON DELETE CASCADE
);

CREATE TABLE credit_transaction (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  grant_id uuid,
  reservation_id uuid,
  type text NOT NULL,
  credits integer NOT NULL,
  idempotency_key text NOT NULL,
  source_id text,
  balance_after integer,
  metadata jsonb,
  created_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT credit_transaction_idempotency_key_unique UNIQUE (idempotency_key),
  CONSTRAINT credit_transaction_type_check CHECK (type IN ('grant', 'reserve', 'consume', 'release', 'refund', 'expire', 'adjustment', 'rollover')),
  CONSTRAINT credit_transaction_credits_check CHECK (credits > 0),
  CONSTRAINT credit_transaction_user_id_app_user_id_fk FOREIGN KEY (user_id) REFERENCES app_user(id) ON DELETE CASCADE,
  CONSTRAINT credit_transaction_grant_id_credit_grant_id_fk FOREIGN KEY (grant_id) REFERENCES credit_grant(id) ON DELETE SET NULL,
  CONSTRAINT credit_transaction_reservation_id_credit_reservation_id_fk FOREIGN KEY (reservation_id) REFERENCES credit_reservation(id) ON DELETE SET NULL
);

CREATE TABLE user_achievement (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  achievement_id text NOT NULL,
  earned_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT user_achievement_user_id_app_user_id_fk FOREIGN KEY (user_id) REFERENCES app_user(id) ON DELETE CASCADE
);

CREATE TABLE bookmarked_question (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  question_id uuid NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT bookmarked_question_user_id_app_user_id_fk FOREIGN KEY (user_id) REFERENCES app_user(id) ON DELETE CASCADE,
  CONSTRAINT bookmarked_question_question_id_interview_question_id_fk FOREIGN KEY (question_id) REFERENCES interview_question(id) ON DELETE CASCADE
);

CREATE TABLE practice_set (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT practice_set_user_id_app_user_id_fk FOREIGN KEY (user_id) REFERENCES app_user(id) ON DELETE CASCADE
);

CREATE TABLE practice_set_question (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  practice_set_id uuid NOT NULL,
  question_id uuid NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT practice_set_question_practice_set_id_practice_set_id_fk FOREIGN KEY (practice_set_id) REFERENCES practice_set(id) ON DELETE CASCADE,
  CONSTRAINT practice_set_question_question_id_interview_question_id_fk FOREIGN KEY (question_id) REFERENCES interview_question(id) ON DELETE CASCADE
);

CREATE INDEX user_achievement_user_achievement_idx ON user_achievement (user_id, achievement_id);
CREATE INDEX bookmarked_question_user_question_idx ON bookmarked_question (user_id, question_id);
CREATE INDEX practice_set_question_set_question_idx ON practice_set_question (practice_set_id, question_id);
CREATE INDEX credit_grant_user_id_idx ON credit_grant (user_id);
CREATE INDEX credit_grant_user_expires_idx ON credit_grant (user_id, expires_at);
CREATE INDEX credit_grant_catalog_idx ON credit_grant (catalog_id);
CREATE INDEX credit_grant_source_idx ON credit_grant (source, source_id);
CREATE INDEX credit_reservation_user_id_idx ON credit_reservation (user_id);
CREATE INDEX credit_reservation_status_expires_idx ON credit_reservation (status, expires_at);
CREATE INDEX credit_reservation_session_idx ON credit_reservation (session_id);
CREATE INDEX credit_reservation_grant_grant_idx ON credit_reservation_grant (grant_id);
CREATE INDEX credit_transaction_user_id_idx ON credit_transaction (user_id);
CREATE INDEX credit_transaction_grant_idx ON credit_transaction (grant_id);
CREATE INDEX credit_transaction_reservation_idx ON credit_transaction (reservation_id);
CREATE INDEX credit_transaction_type_idx ON credit_transaction (type);
CREATE INDEX user_achievement_user_id_idx ON user_achievement (user_id);
CREATE INDEX user_achievement_achievement_id_idx ON user_achievement (achievement_id);
CREATE INDEX bookmarked_question_user_id_idx ON bookmarked_question (user_id);
CREATE INDEX bookmarked_question_question_id_idx ON bookmarked_question (question_id);
CREATE INDEX practice_set_user_id_idx ON practice_set (user_id);
CREATE INDEX practice_set_name_idx ON practice_set (name);
CREATE INDEX practice_set_question_set_idx ON practice_set_question (practice_set_id);
CREATE INDEX practice_set_question_question_idx ON practice_set_question (question_id);

ALTER TABLE subscription ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE transcript_turn ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can update own subscription" ON subscription
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Service can insert feedback" ON feedback
  FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Service can update feedback" ON feedback
  FOR UPDATE TO public USING (true);
CREATE POLICY "Service can insert transcript turns" ON transcript_turn
  FOR INSERT TO public WITH CHECK (true);
GRANT UPDATE ON subscription TO authenticated;
GRANT INSERT, UPDATE ON feedback TO anon, authenticated;
GRANT INSERT ON transcript_turn TO anon, authenticated;
