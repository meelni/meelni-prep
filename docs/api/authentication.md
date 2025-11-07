# Authentication Guide

**Meelni API Authentication with Supabase Auth**

---

## Table of Contents

1. [Overview](#overview)
2. [Authentication Flow](#authentication-flow)
3. [Setup & Configuration](#setup--configuration)
4. [Code Examples](#code-examples)
5. [Token Management](#token-management)
6. [Security Best Practices](#security-best-practices)
7. [Troubleshooting](#troubleshooting)

---

## Overview

Meelni uses **Supabase Auth** for authentication, providing a secure, scalable authentication system with support for multiple providers.

### Key Features

- **Google OAuth Integration**: Primary authentication method
- **JWT-based**: Secure token-based authentication
- **Automatic token refresh**: Client SDK handles token lifecycle
- **Row Level Security (RLS)**: Database-level authorization
- **Session persistence**: Remember users across sessions

### Authentication Methods

Currently supported:
- ✅ **Google OAuth** (primary method)

Planned for future releases:
- Email/password authentication
- Magic link authentication
- Additional OAuth providers (GitHub, LinkedIn)

---

## Authentication Flow

### Overview Diagram

```
┌─────────────────┐
│   User Clicks   │
│ "Sign in with   │
│     Google"     │
└────────┬────────┘
         │
         v
┌─────────────────┐
│  Redirect to    │
│ Google OAuth    │
│ Consent Screen  │
└────────┬────────┘
         │
         v
┌─────────────────┐
│  User Grants    │
│   Permission    │
└────────┬────────┘
         │
         v
┌─────────────────┐
│ Google Redirects│
│ to /auth/       │
│    callback     │
│ with OAuth code │
└────────┬────────┘
         │
         v
┌─────────────────┐
│  Backend        │
│  Exchanges      │
│  Code for       │
│  Session        │
└────────┬────────┘
         │
         v
┌─────────────────┐
│  Supabase       │
│  Returns JWT    │
│  Token          │
└────────┬────────┘
         │
         v
┌─────────────────┐
│  Client Stores  │
│  Token in       │
│  localStorage   │
└────────┬────────┘
         │
         v
┌─────────────────┐
│  Redirect to    │
│   /dashboard    │
└────────┬────────┘
         │
         v
┌─────────────────┐
│  Include Token  │
│  in API         │
│  Requests       │
└─────────────────┘
```

### Detailed Flow

1. **User initiates sign-in**:
   - User clicks "Continue with Google" button
   - Frontend calls `supabase.auth.signInWithOAuth({ provider: 'google' })`

2. **OAuth redirect**:
   - User redirected to Google OAuth consent screen
   - User authorizes application
   - Google redirects back to `/auth/callback?code={auth_code}`

3. **Code exchange**:
   - Backend route `/api/auth/callback` exchanges code for session
   - Supabase creates user record (if new) and returns JWT token
   - Token stored in localStorage via Supabase client

4. **Authenticated state**:
   - User redirected to `/dashboard`
   - All subsequent API requests include token in Authorization header
   - Token automatically refreshed by Supabase client when needed

---

## Setup & Configuration

### 1. Environment Variables

**Required** (already configured in project):

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key # server-side only
```

**Location**: `.env.local` (not committed to git)

### 2. Google Cloud Console Setup

**Already configured for Meelni**, but for reference:

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing
3. Enable Google+ API
4. Create OAuth 2.0 credentials:
   - **Application type**: Web application
   - **Authorized redirect URIs**:
     - `https://your-project.supabase.co/auth/v1/callback`
     - `http://localhost:54321/auth/v1/callback` (for local dev with Supabase CLI)
5. Copy Client ID and Client Secret to Supabase Dashboard

### 3. Supabase Dashboard Configuration

**Already configured**, steps for reference:

1. Go to Supabase Dashboard → Authentication → Providers
2. Enable Google provider
3. Paste Google OAuth Client ID and Client Secret
4. Set redirect URL: `{SITE_URL}/auth/callback`
5. Save changes

---

## Code Examples

### Frontend Implementation

#### 1. Initialize Supabase Client

```typescript
// lib/supabase/client.ts
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
```

#### 2. Sign In with Google

```typescript
// app/auth/signin/page.tsx
'use client';

import { supabase } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';

export default function SignInPage() {
  const router = useRouter();

  const handleGoogleSignIn = async () => {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        queryParams: {
          access_type: 'offline',
          prompt: 'consent',
        },
      },
    });

    if (error) {
      console.error('Error signing in:', error.message);
      return;
    }

    // User will be redirected to Google OAuth consent screen
  };

  return (
    <div>
      <button onClick={handleGoogleSignIn}>
        Continue with Google
      </button>
    </div>
  );
}
```

#### 3. OAuth Callback Handler

```typescript
// app/auth/callback/route.ts
import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const redirectTo = requestUrl.searchParams.get('redirectTo') || '/dashboard';

  if (code) {
    const supabase = await createClient();

    // Exchange code for session
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      console.error('Auth callback error:', error);
      return NextResponse.redirect(new URL('/auth/signin?error=auth_failed', request.url));
    }

    // Successful authentication
    return NextResponse.redirect(new URL(redirectTo, request.url));
  }

  // No code present, redirect to sign-in
  return NextResponse.redirect(new URL('/auth/signin', request.url));
}
```

#### 4. Auth State Management (React Context)

```typescript
// app/providers/auth-provider.tsx
'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import type { User, Session } from '@supabase/supabase-js';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setIsLoading(false);
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
  };

  return (
    <AuthContext.Provider value={{ user, session, isLoading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
```

#### 5. Protected Routes (Middleware)

```typescript
// middleware.ts
import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Protected routes
  const protectedRoutes = ['/dashboard', '/setup', '/interview'];

  if (protectedRoutes.some(route => pathname.startsWith(route))) {
    const supabase = await createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      // Not authenticated, redirect to sign-in
      const redirectUrl = new URL('/auth/signin', request.url);
      redirectUrl.searchParams.set('redirectTo', pathname);
      return NextResponse.redirect(redirectUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*', '/setup/:path*', '/interview/:path*'],
};
```

#### 6. Making Authenticated API Requests

```typescript
// Example: Start interview session
async function startInterview(roundType: string) {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    throw new Error('Not authenticated');
  }

  const response = await fetch('/api/session/start', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ roundType }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error);
  }

  return response.json();
}
```

### Backend Implementation

#### Server-Side Auth Check

```typescript
// Any API route that requires authentication
import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  // Verify authentication
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  // User is authenticated, proceed with request
  // user.id is available for database queries
  console.log('Authenticated user:', user.id, user.email);

  // ... rest of API logic
}
```

---

## Token Management

### Token Structure

Supabase JWT tokens contain:

```json
{
  "sub": "user-uuid",
  "email": "user@example.com",
  "exp": 1699999999,
  "iss": "https://your-project.supabase.co/auth/v1",
  "role": "authenticated"
}
```

### Token Lifecycle

| Stage | Duration | Handled By |
|-------|----------|------------|
| **Access Token** | 1 hour | Supabase Client |
| **Refresh Token** | 7 days | Supabase Client |
| **Auto-refresh** | Before expiry | Supabase Client (automatic) |
| **Manual refresh** | On demand | `supabase.auth.refreshSession()` |

### Manual Token Refresh

```typescript
// Manually refresh session (usually not needed - automatic)
const { data, error } = await supabase.auth.refreshSession();

if (error) {
  console.error('Token refresh failed:', error);
  // Redirect to sign-in
}

// New tokens available in data.session
const newAccessToken = data.session?.access_token;
```

### Token Storage

- **Client-side**: localStorage (managed by Supabase client)
- **Server-side**: Cookie-based session (via `@supabase/ssr`)
- **Never expose**: `SUPABASE_SERVICE_ROLE_KEY` in client-side code

---

## Security Best Practices

### 1. Environment Variables

✅ **DO**:
- Store API keys in `.env.local` (not committed to git)
- Use `NEXT_PUBLIC_` prefix only for public keys (e.g., `NEXT_PUBLIC_SUPABASE_URL`)
- Keep `SUPABASE_SERVICE_ROLE_KEY` server-side only

❌ **DON'T**:
- Commit `.env.local` to git
- Expose service role key in client-side code
- Hardcode API keys in source code

### 2. Token Handling

✅ **DO**:
- Let Supabase client manage token lifecycle
- Use HTTPS in production
- Implement proper logout (clear all client state)

❌ **DON'T**:
- Store tokens in sessionStorage or cookies manually
- Send tokens in URL query parameters
- Log tokens to console in production

### 3. API Route Protection

✅ **DO**:
```typescript
// Always verify user on server-side
const { data: { user } } = await supabase.auth.getUser();

if (!user) {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

// Verify resource ownership
const session = await getSessionById(sessionId);
if (session.userId !== user.id) {
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}
```

❌ **DON'T**:
```typescript
// Don't trust client-provided user IDs
const { userId } = await req.json(); // ❌ Can be spoofed

// Don't skip auth checks
const session = await getSessionById(sessionId); // ❌ No user verification
```

### 4. Row Level Security (RLS)

**Planned for production** - Database-level authorization:

```sql
-- Example RLS policy for interview_session table
CREATE POLICY "Users can only access their own sessions"
ON interview_session
FOR ALL
USING (auth.uid() = user_id);
```

### 5. OAuth Scopes

Current Google OAuth scopes:
- `openid`
- `email`
- `profile`

**Principle**: Request minimum scopes needed.

---

## Troubleshooting

### Common Issues

#### 1. "Unauthorized" Error (401)

**Problem**: API requests return 401 Unauthorized

**Solutions**:
- Check if user is signed in: `const { data: { session } } = await supabase.auth.getSession()`
- Verify token is included in request: `Authorization: Bearer ${session.access_token}`
- Check token hasn't expired (automatic refresh should handle this)
- Confirm Supabase environment variables are set correctly

#### 2. Redirect Loop

**Problem**: Sign-in redirects back to sign-in page repeatedly

**Solutions**:
- Check middleware configuration (ensure `/auth/signin` is not protected)
- Verify OAuth callback route is working: `/auth/callback`
- Check browser console for errors during auth flow
- Clear localStorage and cookies, try again

#### 3. "Session not found" After Sign-in

**Problem**: User signed in but `supabase.auth.getSession()` returns null

**Solutions**:
- Wait for auth state change listener to fire
- Check if cookies are enabled in browser
- Verify `NEXT_PUBLIC_SUPABASE_URL` matches Supabase project URL
- Ensure callback handler successfully exchanges code for session

#### 4. Token Refresh Fails

**Problem**: Token refresh returns error

**Solutions**:
- Check refresh token is still valid (7-day expiry)
- Verify Supabase project is active
- Sign out and sign in again to get fresh tokens
- Check network connectivity

#### 5. Google OAuth Redirect Error

**Problem**: Google redirects with error parameter

**Solutions**:
- Verify redirect URI in Google Cloud Console matches Supabase callback URL
- Check Google OAuth credentials are correct in Supabase Dashboard
- Ensure Google+ API is enabled in Google Cloud Console
- Try with incognito window (clear OAuth consent state)

### Debug Checklist

```typescript
// Add this to debug auth issues
async function debugAuth() {
  // 1. Check session
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  console.log('Session:', session);
  console.log('Session error:', sessionError);

  // 2. Check user
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  console.log('User:', user);
  console.log('User error:', userError);

  // 3. Check environment variables
  console.log('Supabase URL:', process.env.NEXT_PUBLIC_SUPABASE_URL);
  console.log('Anon key exists:', !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

  // 4. Test token in API request
  if (session) {
    const response = await fetch('/api/sessions', {
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
      },
    });
    console.log('API test status:', response.status);
    console.log('API test body:', await response.json());
  }
}
```

---

## Additional Resources

- [Supabase Auth Documentation](https://supabase.com/docs/guides/auth)
- [Supabase Auth with Next.js](https://supabase.com/docs/guides/auth/server-side/nextjs)
- [Google OAuth Setup Guide](https://supabase.com/docs/guides/auth/social-login/auth-google)
- [JWT Best Practices](https://datatracker.ietf.org/doc/html/rfc8725)

---

**Last Updated**: 2025-11-05
**Version**: 1.0.0
