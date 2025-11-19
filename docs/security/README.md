# Security Documentation

This directory contains all security-related documentation for the Meelni project.

## 🚨 Quick Start

**If you need to deploy security fixes NOW**, start here:

📄 **[QUICK_START_SECURITY_FIX.md](./QUICK_START_SECURITY_FIX.md)** - 5-minute security deployment guide

---

## Documentation Index

### Security Audits

- **[SECURITY_AUDIT_2025-11-18.md](./SECURITY_AUDIT_2025-11-18.md)** - Complete security audit report
  - RLS disabled issue (CRITICAL - RESOLVED ✅)
  - Leaked password protection (WARNING - ACTION REQUIRED)
  - Impact assessment and deployment checklist

### Deployment Guides

- **[RLS_DEPLOYMENT_GUIDE.md](./RLS_DEPLOYMENT_GUIDE.md)** - Row Level Security deployment
  - Step-by-step RLS policy application
  - Testing and verification procedures
  - Troubleshooting common issues
  - Production checklist

- **[PASSWORD_PROTECTION_GUIDE.md](./PASSWORD_PROTECTION_GUIDE.md)** - Leaked password protection
  - How to enable in Supabase Auth
  - HaveIBeenPwned.org integration
  - Password strength recommendations
  - Testing procedures

### Migration Files

SQL migration files are located in:
```
/supabase/migrations/
├── feedback_system_rls.sql          # RLS for sessions, feedback, transcripts
├── user_settings_rls.sql            # RLS for user settings
├── 20251113000001_add_billing_rls_policies.sql  # RLS for billing tables
├── 20251118000001_enable_remaining_rls.sql      # RLS for app_user, questions, insights
└── apply_all_rls.sql                # Master RLS script (run this!)
```

---

## Security Status

### ✅ Completed

- [x] Row Level Security enabled on all 13 tables
- [x] User data isolation policies implemented
- [x] Service role access configured for background jobs
- [x] Public read access for question bank
- [x] SQL migrations created and tested

### ⏳ Pending Deployment

- [ ] Leaked password protection enabled in Supabase Auth
- [ ] Performance optimization (auth.uid() → select auth.uid())

### 📋 Production Checklist

Before going live:

- [ ] All RLS policies deployed (verify in Supabase Dashboard → Reports)
- [ ] Leaked password protection enabled
- [ ] User isolation tested (User A cannot see User B's data)
- [ ] Service role operations verified (background jobs work)
- [ ] No "rls_disabled_in_public" errors in Supabase dashboard
- [ ] No "auth_leaked_password_protection" warnings

---

## Security Architecture

### RLS Policy Design Patterns

#### 1. User Isolation (Most Tables)
```sql
-- Users can only access their own data
USING (user_id = auth.uid())
```

**Applied to**: app_user, interview_session, user_settings, user_insights, subscription, usage_record, payment_history

#### 2. Derived Access (Foreign Key)
```sql
-- Users can access data linked to their sessions
USING (
  EXISTS (
    SELECT 1 FROM interview_session
    WHERE interview_session.id = table.session_id
    AND interview_session.user_id = auth.uid()
  )
)
```

**Applied to**: feedback, transcript_turn, session_question

#### 3. Public Read (Shared Resources)
```sql
-- All authenticated users can read active questions
USING (is_active = true)
```

**Applied to**: interview_question

#### 4. Service Role Only (Internal Tables)
```sql
-- Service role has full access, users have none
USING (false)  -- For authenticated users
USING (true)   -- For service_role
```

**Applied to**: stripe_event_log, stripe_customer_mapping

---

## Permission Matrix

| Table | User Read | User Write | Service Read | Service Write |
|-------|-----------|------------|--------------|---------------|
| app_user | Own only | Own only | ✅ | ✅ |
| interview_session | Own only | Own only | ✅ | ✅ |
| feedback | Own only | ❌ | ✅ | ✅ |
| transcript_turn | Own only | Own only | ✅ | ✅ |
| user_settings | Own only | Own only | ✅ | ✅ |
| user_insights | Own only | ❌ | ✅ | ✅ |
| interview_question | Active only | ❌ | ✅ | ✅ |
| session_question | Own only | Own only | ✅ | ✅ |
| subscription | Own only | Update only | ✅ | ✅ |
| usage_record | Own only | ❌ | ✅ | ✅ |
| payment_history | Own only | ❌ | ✅ | ✅ |
| stripe_event_log | ❌ | ❌ | ✅ | ✅ |
| stripe_customer_mapping | ❌ | ❌ | ✅ | ✅ |

---

## Known Performance Warnings

### Auth RLS Initialization Plan (22 warnings)

**Issue**: RLS policies call `auth.uid()` for every row, causing performance overhead at scale.

**Current Status**: ACCEPTABLE at MVP scale (<1,000 users)

**Fix (when needed)**:
```sql
-- Change this:
USING (auth.uid() = user_id)

-- To this:
USING ((select auth.uid()) = user_id)
```

**When to optimize**: When you have 10,000+ users or notice query performance degradation.

### Multiple Permissive Policies (4 warnings)

**Issue**: `transcript_turn` table has multiple INSERT policies (user + service role).

**Current Status**: ACCEPTABLE trade-off for flexibility

**Why we have this**: Both users (client-side) and LiveKit agents (server-side) need to insert transcripts.

---

## References

- **Supabase RLS Docs**: https://supabase.com/docs/guides/auth/row-level-security
- **Postgres RLS Docs**: https://www.postgresql.org/docs/current/ddl-rowsecurity.html
- **HaveIBeenPwned API**: https://haveibeenpwned.com/API/v3
- **OWASP Top 10**: https://owasp.org/www-project-top-ten/

---

## Change Log

### 2025-11-18: Initial Security Audit & RLS Deployment

**Issues Identified**:
- RLS disabled on all 13 tables (CRITICAL)
- Leaked password protection disabled (WARNING)

**Actions Taken**:
- Created comprehensive RLS policies for all tables
- Documented deployment procedures
- Created master SQL migration script
- Organized security documentation

**Status**: RLS policies deployed ✅ | Password protection pending ⏳

---

## Need Help?

- **Quick fix**: See [QUICK_START_SECURITY_FIX.md](./QUICK_START_SECURITY_FIX.md)
- **Detailed RLS guide**: See [RLS_DEPLOYMENT_GUIDE.md](./RLS_DEPLOYMENT_GUIDE.md)
- **Password setup**: See [PASSWORD_PROTECTION_GUIDE.md](./PASSWORD_PROTECTION_GUIDE.md)
- **Full audit report**: See [SECURITY_AUDIT_2025-11-18.md](./SECURITY_AUDIT_2025-11-18.md)

---

**Last Updated**: 2025-11-18
**Status**: Security measures deployed, password protection pending
