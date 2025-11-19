# Leaked Password Protection Guide

## What Is This?

Supabase Auth can check user passwords against **HaveIBeenPwned.org**, a database of over 11 billion compromised passwords from data breaches. This prevents users from setting passwords that have been leaked online.

**Status**: 🟡 **WARNING** - Currently disabled in your Supabase project

---

## How to Enable (1 minute)

### Option 1: Via Supabase Dashboard (Easiest)

1. Go to your Supabase dashboard: https://supabase.com/dashboard
2. Select your project
3. Navigate to **Authentication** → **Providers** → **Email**
4. Scroll down to **"Password Security"** section
5. Toggle **"Enable leaked password protection"** to **ON**
6. Click **Save**

### Option 2: Via Supabase CLI

```bash
# Update auth config
supabase auth update \
  --password-hibp-enabled=true
```

### Option 3: Via SQL (Alternative)

```sql
-- Enable leaked password protection
UPDATE auth.config
SET password_hibp_enabled = true
WHERE id = 'default';
```

---

## What This Does

When enabled:

1. **On Sign Up**: If a user tries to create an account with a compromised password, Supabase will:
   - Return an error: `"Password has been found in a data breach"`
   - Require the user to choose a different password

2. **On Password Change**: Same validation applies when users update their password

3. **Privacy**: Supabase uses **k-Anonymity** - only a hash prefix is sent to HaveIBeenPwned.org, so the actual password is never transmitted

---

## User Experience

### Before Enabling

User can set password: `password123` (even though it's been breached millions of times)

### After Enabling

**User tries to sign up with `password123`:**

```
❌ Error: "This password has been found in a data breach and cannot be used. Please choose a different password."
```

**User changes to a strong, unique password:**

```
✅ Success: Account created
```

---

## Technical Details

### How It Works

1. User enters password: `mypassword123`
2. Supabase hashes the password using SHA-1: `abc123def...`
3. Supabase sends **only the first 5 characters** of the hash to HaveIBeenPwned: `abc12`
4. HaveIBeenPwned returns all hashes starting with `abc12`
5. Supabase checks if the full hash matches any in the list
6. If match found → reject password; if not → allow password

**Privacy Guaranteed**: The actual password is never sent to HaveIBeenPwned.org.

### API Calls

- **No cost** - HaveIBeenPwned.org API is free
- **Minimal latency** - Adds ~100-200ms to sign-up/password-change requests
- **No API key required**

### Password Strength Requirements (Independent)

Leaked password protection works **in addition to** existing password strength rules:

Current Supabase defaults:
- Minimum 8 characters (can be configured)
- No maximum length limit
- No special character requirements (can be added)

You can combine both:
```javascript
// Example: Strong password that's also NOT leaked
const password = "MyUniqueP@ssw0rd2024!";
```

---

## Testing

### Test 1: Try a Known Leaked Password

```javascript
// This should FAIL after enabling protection
const { data, error } = await supabase.auth.signUp({
  email: 'test@example.com',
  password: 'password123', // Known leaked password
});

console.log(error); // Should show: "Password has been found in a data breach"
```

### Test 2: Try a Strong Unique Password

```javascript
// This should SUCCEED
const { data, error } = await supabase.auth.signUp({
  email: 'test@example.com',
  password: 'Xk9$mP2vL#qR8nW@2024', // Strong unique password
});

console.log(error); // Should be null
console.log(data); // Should show user created
```

---

## Additional Security Recommendations

While enabling leaked password protection, also consider:

### 1. Increase Minimum Password Length

In Supabase Dashboard → Authentication → Providers → Email:

```
Minimum password length: 12 characters (instead of 8)
```

### 2. Add Password Complexity Requirements

In your sign-up form, add client-side validation:

```typescript
function validatePassword(password: string): string | null {
  if (password.length < 12) {
    return "Password must be at least 12 characters";
  }
  if (!/[A-Z]/.test(password)) {
    return "Password must contain at least one uppercase letter";
  }
  if (!/[a-z]/.test(password)) {
    return "Password must contain at least one lowercase letter";
  }
  if (!/[0-9]/.test(password)) {
    return "Password must contain at least one number";
  }
  if (!/[^A-Za-z0-9]/.test(password)) {
    return "Password must contain at least one special character";
  }
  return null; // Valid
}
```

### 3. Require Email Verification

Already enabled in your project ✅

In Supabase Dashboard → Authentication → Providers → Email:

```
☑ Enable email confirmations
```

### 4. Rate Limiting

Supabase already includes rate limiting for auth endpoints:
- Sign up: 30 requests per hour per IP
- Sign in: 30 requests per hour per email
- Password reset: 30 requests per hour per email

---

## Impact on Existing Users

**Good news**: Enabling leaked password protection does NOT affect existing users unless they:

1. Try to change their password to a leaked one
2. You force a password reset

If you want to force existing users to update compromised passwords:

1. Enable leaked password protection
2. Send a password reset email to all users: `supabase.auth.resetPasswordForEmail(email)`
3. Users will be forced to choose a non-leaked password on reset

---

## Disabling (Not Recommended)

If you need to disable it:

```bash
# Via CLI
supabase auth update --password-hibp-enabled=false
```

Or toggle OFF in Supabase Dashboard → Authentication → Providers → Email.

---

## Production Checklist

Before going live:

- [ ] Leaked password protection is enabled in Supabase Auth
- [ ] Tested sign-up with leaked password (should fail)
- [ ] Tested sign-up with strong password (should succeed)
- [ ] Updated sign-up form UI to show helpful error messages
- [ ] Consider increasing minimum password length to 12 characters
- [ ] Consider adding password complexity requirements

---

## Resources

- **HaveIBeenPwned.org**: https://haveibeenpwned.com/Passwords
- **Supabase Docs**: https://supabase.com/docs/guides/auth/password-security
- **k-Anonymity Explained**: https://www.troyhunt.com/ive-just-launched-pwned-passwords-version-2/

---

**Last Updated**: 2025-11-18
**Status**: Ready to enable
