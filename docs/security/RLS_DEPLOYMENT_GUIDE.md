# RLS Deployment Guide

## Critical Security Issue: Row Level Security Not Enabled

**Status**: 🚨 **CRITICAL** - All 13 database tables are currently unprotected

**Risk**: Any user with your Supabase API URL can read/write ALL data across all accounts, including:
- Interview sessions from other users
- Feedback and transcripts
- Payment history and subscription data
- Personal user information

---

## Quick Fix (5 minutes)

### Step 1: Open Supabase SQL Editor

1. Go to your Supabase dashboard: https://supabase.com/dashboard
2. Select your project
3. Click **SQL Editor** in the left sidebar
4. Click **New Query**

### Step 2: Apply RLS Policies

Copy and paste the entire contents of this file into the SQL editor:

```
supabase/migrations/apply_all_rls.sql
```

Then click **Run** (or press Cmd+Enter).

### Step 3: Verify Success

After running the script, you should see output showing:

**RLS Status Check:**
```
| schemaname | tablename                  | RLS Enabled |
|------------|----------------------------|-------------|
| public     | app_user                   | true        |
| public     | interview_session          | true        |
| public     | feedback                   | true        |
| public     | transcript_turn            | true        |
| public     | user_settings              | true        |
| public     | user_insights              | true        |
| public     | interview_question         | true        |
| public     | session_question           | true        |
| public     | subscription               | true        |
| public     | usage_record               | true        |
| public     | payment_history            | true        |
| public     | stripe_event_log           | true        |
| public     | stripe_customer_mapping    | true        |
```

**All rows should show `RLS Enabled = true`**

### Step 4: Enable Leaked Password Protection

1. In Supabase dashboard, go to **Authentication** → **Policies**
2. Find **"Leaked Password Protection"** setting
3. Toggle it **ON**

This will check user passwords against HaveIBeenPwned.org to prevent use of compromised passwords.

---

## What This Does

### RLS Policies Applied

#### 1. **app_user** (User Profiles)
- ✅ Users can only view/update their own profile
- ✅ Service role has full access for admin operations

#### 2. **interview_session** (Interview Sessions)
- ✅ Users can only view/create/update/delete their own sessions
- ✅ Service role has full access for background jobs

#### 3. **feedback** (AI Feedback)
- ✅ Users can only view feedback for their own sessions
- ✅ Service role can insert/update feedback (for Inngest workers)

#### 4. **transcript_turn** (Conversation Transcripts)
- ✅ Users can only view/insert transcripts for their own sessions
- ✅ Service role can insert transcripts (for LiveKit agents)

#### 5. **user_settings** (User Preferences)
- ✅ Users can only view/update their own settings

#### 6. **user_insights** (Analytics)
- ✅ Users can only view their own pre-aggregated analytics
- ✅ Service role updates insights (background jobs)

#### 7. **interview_question** (Question Bank)
- ✅ All authenticated users can READ active questions (public question bank)
- ✅ Only service role can INSERT/UPDATE/DELETE questions (admin-only)

#### 8. **session_question** (Session-Question Mapping)
- ✅ Users can only view questions used in their own sessions
- ✅ Service role has full access

#### 9-13. **Billing Tables** (subscription, usage_record, payment_history, stripe_event_log, stripe_customer_mapping)
- ✅ Users can only view their own subscription/usage/payment data
- ✅ stripe_event_log and stripe_customer_mapping are service-role-only (internal)
- ✅ Service role has full access for webhooks and admin operations

---

## Testing RLS Policies

After applying the migration, test that RLS is working:

### Test 1: Create a Test User

1. Sign in to your app with a test account
2. Create a new interview session
3. Sign out and sign in with a **different** account
4. Try to access the first user's session data

**Expected Result**: You should NOT see the other user's sessions/feedback/transcripts.

### Test 2: Check Question Bank

1. Sign in to your app
2. Navigate to interview setup
3. Verify you can see questions from the question bank

**Expected Result**: You SHOULD see questions (public read access).

### Test 3: API Isolation Test

Run this in your browser console while signed in:

```javascript
// This should only return YOUR sessions
const { data, error } = await supabase
  .from('interview_session')
  .select('*');

console.log('Your sessions:', data);
console.log('Error (should be null):', error);
```

**Expected Result**: Only your own sessions are returned.

---

## Troubleshooting

### Error: "relation does not exist"

**Cause**: Table hasn't been created yet in Supabase.

**Fix**: Run `npx drizzle-kit push` to sync your schema first, then apply RLS policies.

### Error: "policy already exists"

**Cause**: Policy was previously created.

**Fix**: Either:
1. Drop the existing policy first: `DROP POLICY "policy_name" ON table_name;`
2. Or ignore the error if the policy is correct

### Error: "permission denied for table"

**Cause**: Missing GRANT statements.

**Fix**: Run the entire `apply_all_rls.sql` script (it includes GRANT statements).

### Users Can Still See Other Users' Data

**Possible Causes**:
1. RLS not enabled on the table (check with verification query)
2. Using `service_role` key instead of `anon` key in client
3. Policy logic error

**Fix**:
1. Re-run the RLS script
2. Check your `.env.local` - make sure you're using `NEXT_PUBLIC_SUPABASE_ANON_KEY`, not `SUPABASE_SERVICE_ROLE_KEY` for client operations
3. Review policy definitions

---

## Production Checklist

Before deploying to production:

- [ ] All 13 tables have RLS enabled (verified with SQL query)
- [ ] Leaked password protection is enabled in Supabase Auth
- [ ] Test user can only see their own data
- [ ] Test user can see public question bank
- [ ] Service role operations still work (background jobs, webhooks)
- [ ] No "rls_disabled_in_public" errors in Supabase dashboard
- [ ] No "auth_leaked_password_protection" warnings in Supabase dashboard

---

## Files Reference

- **Master RLS Script**: `supabase/migrations/apply_all_rls.sql` (run this!)
- **Individual Migrations** (for reference only):
  - `supabase/migrations/feedback_system_rls.sql` (sessions, feedback, transcripts)
  - `supabase/migrations/user_settings_rls.sql` (user settings)
  - `supabase/migrations/20251113000001_add_billing_rls_policies.sql` (billing tables)
  - `supabase/migrations/20251118000001_enable_remaining_rls.sql` (app_user, questions, insights)

---

## Need Help?

If you encounter issues:

1. Check the Supabase dashboard **Reports** section for specific policy violations
2. Review the RLS policy definitions in `apply_all_rls.sql`
3. Test policies with the verification queries included in the script
4. Check Supabase docs: https://supabase.com/docs/guides/auth/row-level-security

---

**Last Updated**: 2025-11-18
**Status**: Ready to deploy
