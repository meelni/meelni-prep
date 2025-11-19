# Security Audit Implementation Plan

**Sprint**: Security Audit 2025-01
**Created**: 2025-01-18
**Last Updated**: 2025-01-18

---

## 🎯 Objectives Recap

**What we're auditing:**
- Environment variables and API key exposure
- Database security (RLS policies, SQL injection, data isolation)
- Authentication and authorization flows
- API endpoint security and input validation
- User-facing vulnerabilities (XSS, CSRF, data exposure)
- Production security configuration

**Why we're doing this:**
Pre-production security audit to identify and remediate vulnerabilities before public launch. Focus on protecting user data, preventing unauthorized access, and ensuring secure API key management.

---

## 🏗️ Audit Methodology

### Phase 1: Environment & Secrets Audit

**Areas to Review:**
1. `.env.example` - Check for exposed secrets or patterns
2. Git history - Search for committed secrets
3. Client-side bundles - Verify API keys not exposed to browser
4. `NEXT_PUBLIC_*` variables - Ensure only safe values are public
5. Hardcoded secrets - Grep codebase for patterns

**Tools & Commands:**
```bash
# Search for potential secrets
grep -r "API_KEY\|SECRET\|PASSWORD" --exclude-dir=node_modules .

# Check for NEXT_PUBLIC_ variables
grep -r "NEXT_PUBLIC_" --exclude-dir=node_modules .

# Search git history for secrets
git log -p | grep -i "api_key\|secret\|password"

# Check for hardcoded keys
grep -rE "(sk-[a-zA-Z0-9]{48}|Bearer [a-zA-Z0-9]+)" --exclude-dir=node_modules .
```

**Expected Findings:**
- Verify all secrets in `.env.example` are placeholders
- Confirm no real API keys in git history
- Validate NEXT_PUBLIC_ variables contain no sensitive data
- Check that LiveKit, OpenAI, Deepgram keys are server-side only

---

### Phase 2: Database Security

**Areas to Review:**
1. RLS policies on all tables (`app_user`, `interview_session`, `transcript_turn`, `feedback`)
2. SQL injection vulnerabilities in queries
3. User data isolation enforcement
4. Database connection security
5. Exposed database credentials

**Files to Audit:**
- `lib/db/schema.ts` - Schema definitions
- `lib/db/index.ts` - Database client configuration
- All API routes using database queries
- `.claude/DATABASE.md` - RLS policy documentation

**Security Checks:**
```sql
-- Verify RLS is enabled on all tables
SELECT schemaname, tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public';

-- List all RLS policies
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual
FROM pg_policies
WHERE schemaname = 'public';
```

**Expected Findings:**
- All tables should have RLS enabled
- Policies should enforce `user_id = auth.uid()` for user data
- No raw SQL string concatenation (use parameterized queries)
- Verify Drizzle ORM usage prevents SQL injection

---

### Phase 3: Authentication & Authorization

**Areas to Review:**
1. Auth provider implementation (`app/providers/auth-provider.tsx`)
2. Session management and token refresh
3. Route protection middleware (`middleware.ts`)
4. OAuth callback security (`app/auth/callback/route.ts`)
5. Password reset flow security

**Security Checks:**
- **Session Management**: Verify HTTP-only cookies, secure flag
- **Token Storage**: No tokens in localStorage (XSS risk)
- **OAuth Flow**: Verify state parameter, proper redirect validation
- **Password Reset**: Check token expiration, one-time use
- **Route Protection**: Ensure all protected routes in middleware

**Files to Audit:**
```
app/providers/auth-provider.tsx
middleware.ts
app/auth/signin/page.tsx
app/auth/signup/page.tsx
app/auth/callback/route.ts
app/auth/forgot-password/page.tsx
app/auth/reset-password/page.tsx
lib/supabase/client.ts
lib/supabase/server.ts
```

---

### Phase 4: API Security

**Areas to Review:**
1. Authentication on all API routes
2. Input validation and sanitization
3. CORS configuration
4. Rate limiting (if implemented)
5. Exposed internal endpoints

**Files to Audit:**
```
app/api/livekit/token/route.ts
app/api/livekit/demo-token/route.ts
app/api/interview/start/route.ts
app/api/interview/end/route.ts
app/api/feedback/[sessionId]/route.ts
```

**Security Checks:**
```typescript
// Verify each API route has:
// 1. Authentication check
const session = await getSession();
if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

// 2. Input validation (using Zod or similar)
const schema = z.object({ field: z.string() });
const validated = schema.safeParse(data);

// 3. Authorization (user can access resource)
if (resource.userId !== session.user.id) {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

// 4. Error handling (no stack traces exposed)
catch (error) {
  console.error(error);
  return NextResponse.json({ error: "Internal error" }, { status: 500 });
}
```

---

### Phase 5: User-Facing Security

**Areas to Review:**
1. XSS prevention (React escaping, dangerouslySetInnerHTML usage)
2. CSRF protection (for forms and state-changing operations)
3. File upload security (if applicable)
4. Client-side data exposure (sensitive data in DOM, console logs)
5. Third-party script integrity (if using CDN scripts)

**Files to Audit:**
```
app/**/*.tsx (all frontend components)
components/**/*.tsx
lib/utils.ts (any HTML rendering utilities)
```

**XSS Checks:**
```typescript
// Bad: Direct HTML injection
<div dangerouslySetInnerHTML={{ __html: userInput }} />

// Good: React auto-escapes
<div>{userInput}</div>

// Check for console.log with sensitive data
console.log("User:", user); // May expose tokens, emails
```

**CSRF Checks:**
- Verify Supabase Auth handles CSRF tokens
- Check that state-changing operations require authentication
- Ensure cookies have SameSite=Lax or Strict

---

### Phase 6: Production Security Checklist

**Security Headers** (Next.js config):
```typescript
// next.config.js
const securityHeaders = [
  {
    key: 'X-Frame-Options',
    value: 'DENY', // Prevent clickjacking
  },
  {
    key: 'X-Content-Type-Options',
    value: 'nosniff', // Prevent MIME sniffing
  },
  {
    key: 'Referrer-Policy',
    value: 'strict-origin-when-cross-origin',
  },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=()', // Restrict permissions
  },
];
```

**HTTPS Enforcement:**
- Verify production uses HTTPS only
- Check HSTS header configuration
- Ensure secure cookies (Secure flag)

**Error Handling:**
- No stack traces in production responses
- Generic error messages to users
- Detailed errors logged server-side only

**Logging Security:**
- No PII in logs (emails, names, tokens)
- Sanitize user input before logging
- Secure log storage and access

---

## 📋 Audit Checklist

### Critical Security Items

**Environment & Secrets:**
- [ ] No real API keys in `.env.example`
- [ ] No secrets committed to git history
- [ ] API keys are server-side only (not in client bundles)
- [ ] NEXT_PUBLIC_ variables contain no sensitive data
- [ ] No hardcoded secrets in codebase

**Database Security:**
- [ ] RLS enabled on all tables
- [ ] RLS policies enforce user_id = auth.uid()
- [ ] No SQL injection vulnerabilities
- [ ] Parameterized queries used everywhere
- [ ] Database credentials not exposed

**Authentication:**
- [ ] Session tokens in HTTP-only cookies
- [ ] No tokens in localStorage
- [ ] OAuth flow uses state parameter
- [ ] Password reset tokens expire
- [ ] Route protection middleware covers all protected routes

**API Security:**
- [ ] All API routes check authentication
- [ ] Input validation on all endpoints
- [ ] Authorization checks (user owns resource)
- [ ] No stack traces in error responses
- [ ] Rate limiting implemented (or planned)

**User-Facing Security:**
- [ ] No dangerouslySetInnerHTML with user input
- [ ] React auto-escaping used everywhere
- [ ] No sensitive data in console.logs
- [ ] CSRF protection enabled
- [ ] No file upload vulnerabilities

**Production Config:**
- [ ] Security headers configured
- [ ] HTTPS enforced
- [ ] No stack traces in production
- [ ] Logging sanitized (no PII)
- [ ] Error tracking configured (Sentry)

---

## 📊 Severity Classification

**Critical**: Immediate fix required, blocks production launch
- API keys exposed in client code
- RLS policies missing or broken
- SQL injection vulnerabilities
- Authentication bypass possible

**High**: Fix before production launch
- Missing authentication checks on API routes
- Insufficient input validation
- Sensitive data in logs or console
- Missing security headers

**Medium**: Fix soon after launch
- Weak error messages
- Missing rate limiting
- Suboptimal CORS configuration
- Missing monitoring/alerting

**Low**: Improvement, fix when convenient
- Code organization issues
- Documentation gaps
- Non-critical warnings

---

## 🔧 Tools & Commands

### Search for Secrets
```bash
# Search for API key patterns
grep -rE "(sk-[a-zA-Z0-9]{48}|AKIA[0-9A-Z]{16})" --exclude-dir=node_modules .

# Search for common secret names
grep -ri "api_key\|secret_key\|private_key" --exclude-dir=node_modules --exclude="*.md" .

# Check git history
git log --all --full-history -p | grep -i "password\|secret\|api_key"
```

### Check Client Bundle
```bash
# Build and inspect client bundle
npm run build
grep -r "LIVEKIT_API_KEY\|OPENAI_API_KEY" .next/static/chunks/

# Check for exposed env vars
grep -r "process.env" .next/static/chunks/ | grep -v "NODE_ENV"
```

### Database Security
```sql
-- Check RLS status
SELECT schemaname, tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public';

-- List policies
SELECT * FROM pg_policies WHERE schemaname = 'public';

-- Test policy enforcement (run as different users)
SET ROLE postgres;
SELECT * FROM interview_session; -- Should see all
SET ROLE authenticated;
SELECT * FROM interview_session; -- Should see only own data
```

---

## 📈 Success Metrics

**Audit Completeness:**
- 100% of files in scope reviewed
- All phases completed
- Findings documented with severity

**Remediation Plan:**
- Critical: 0 open issues (all fixed before launch)
- High: < 2 open issues (fix within 1 week of launch)
- Medium: < 5 open issues (fix within 1 month)
- Low: All documented for future improvement

**Documentation:**
- Security ADR created for key decisions
- Production security checklist complete
- Incident response plan drafted (if needed)

---

## ⚠️ Known Risk Areas

### High-Risk Components

**LiveKit Token Generation** (`app/api/livekit/token/route.ts`):
- Risk: Tokens give access to real-time rooms
- Mitigation: Verify authentication, limit token TTL, validate room names

**Database Queries**:
- Risk: SQL injection, unauthorized data access
- Mitigation: Use Drizzle ORM, verify RLS policies, test with different users

**OAuth Callback** (`app/auth/callback/route.ts`):
- Risk: OAuth hijacking, redirect attacks
- Mitigation: Validate redirect URLs, verify state parameter, check code expiration

**Session Management**:
- Risk: Session hijacking, XSS token theft
- Mitigation: HTTP-only cookies, secure flag, SameSite attribute

---

## 🔗 References

**Security Best Practices:**
- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Next.js Security](https://nextjs.org/docs/advanced-features/security-headers)
- [Supabase Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [LiveKit Security](https://docs.livekit.io/realtime/guides/access-tokens/)

**Related Documentation:**
- `.claude/CLAUDE.md` - RLS policies, authentication flow
- `.claude/DATABASE.md` - Database schema and policies
- `docs/architecture/adrs/ADR-020-google-oauth-authentication.md`
- `docs/architecture/adrs/ADR-026-email-password-authentication.md`

---

**Plan Status**: Approved
**Next Review**: 2025-01-20 (after Phase 3 completion)
