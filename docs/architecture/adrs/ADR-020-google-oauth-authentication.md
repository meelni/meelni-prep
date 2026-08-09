### ADR-020: Google OAuth Authentication Implementation

- **Date**: 2025-11-06
- **Decision**: Implemented full Google OAuth authentication with Supabase Auth
- **Rationale**:
  - **User Requirement**: Authentication needed for "Start A Mock" flow
  - **Provider Choice**: Google OAuth only (initially) for simplicity
  - **No Onboarding**: Direct to dashboard after sign-in per user request
  - **Demo Separation**: Keep demo modal auth-free for instant testing
- **Implementation**:
  - **AuthProvider** (`app/providers/auth-provider.tsx`): React Context for session management
  - **Sign-in Page** (`app/auth/signin/page.tsx`): Google OAuth button with polished UI
  - **Callback Route** (`app/auth/callback/route.ts`): Exchanges OAuth code for session
  - **Middleware** (`middleware.ts`): Protects `/dashboard`, `/setup`, `/interview` routes
  - **Dashboard** (`app/dashboard/page.tsx`): Personalized welcome + "Start Mock Interview" CTA
- **User Flow**:
  ```
  Landing Page → "Start A Mock" button
      ↓
  /dashboard (middleware checks auth)
      ↓
  If not logged in → /auth/signin
      ↓
  Google OAuth consent screen
      ↓
  /auth/callback (code exchange)
      ↓
  /dashboard (authenticated)
      ↓
  "Start Mock Interview" → /setup → /interview
  ```
- **Key Features**:
  - Personalized greeting with user's first name from Google profile
  - Auto-redirect if already authenticated
  - Sign out functionality from dashboard
  - Preserves redirect URL for post-login navigation
  - Demo modal remains auth-free (no friction for trying the product)
- **Consequences**:
  - Authentication gate for full interview experience
  - User data (name, email) stored in Supabase Auth
  - Need to add RLS policies later for data security
  - Easy to add email/password auth later if needed
  - Google Cloud Console OAuth credentials required (already configured)
