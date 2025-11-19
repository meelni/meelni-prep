# 🚨 Quick Start: Security Fix (5 Minutes)

## What's Wrong?

Your Supabase database has **CRITICAL security issues**:

1. **Row Level Security (RLS) disabled** on all 13 tables
   - Any user can read/write ANY data from ALL accounts
   - User A can see User B's interviews, transcripts, payments, etc.

2. **Leaked password protection disabled**
   - Users can set passwords like "password123" that have been breached

---

## Quick Fix (Do This Now!)

### Step 1: Enable RLS (3 minutes)

1. Open: https://supabase.com/dashboard
2. Select your project
3. Click **SQL Editor** → **New Query**
4. Open this file in your code editor:
   ```
   supabase/migrations/apply_all_rls.sql
   ```
5. Copy the **entire file** and paste into Supabase SQL Editor
6. Click **Run** (or press Cmd+Enter)
7. Wait for "SUCCESS" message

**Expected Output**: All tables should show `RLS Enabled = true`

### Step 2: Enable Password Protection (1 minute)

1. In Supabase Dashboard, go to **Authentication** → **Providers** → **Email**
2. Scroll to **"Password Security"** section
3. Toggle **"Enable leaked password protection"** to **ON**
4. Click **Save**

### Step 3: Verify (1 minute)

Check Supabase Dashboard → **Reports** tab:
- ✅ No more "rls_disabled_in_public" errors
- ✅ No more "auth_leaked_password_protection" warnings

---

## What This Does

**Before**:
- ❌ Any user can see all other users' data
- ❌ Users can set weak/breached passwords

**After**:
- ✅ Users can ONLY see their own data
- ✅ Users must choose strong, non-leaked passwords
- ✅ Background jobs still work (service role access)
- ✅ Question bank still accessible to all users (intentional)

---

## Need More Details?

- **Full deployment guide**: `RLS_DEPLOYMENT_GUIDE.md`
- **Password protection guide**: `PASSWORD_PROTECTION_GUIDE.md`
- **Complete security audit**: `SECURITY_AUDIT_2025-11-18.md`

---

## Questions?

1. **Will this break my app?**
   - No! RLS is database-level, no code changes needed

2. **What about existing users?**
   - They keep their current passwords
   - New passwords must meet security requirements

3. **What if something goes wrong?**
   - You can disable RLS anytime with: `ALTER TABLE [name] DISABLE ROW LEVEL SECURITY;`
   - But don't do this unless absolutely necessary!

---

**Status**: Ready to deploy
**Time Required**: 5 minutes
**Difficulty**: Easy (copy/paste + click)
