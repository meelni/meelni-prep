# Dashboard Button Navigation Fix

## Problem
Two buttons on the dashboard were non-functional:
1. **"New Interview" button** in the toolbar/header
2. **"Start Mock Interview" button** in the Overview section (appears in 3 places)

Both buttons were using a `useSetupModal` hook approach that opens a modal, but we need simple navigation to the `/setup` page instead.

## Root Cause
The tactical UI components imported from the reference design used a modal-based approach with a custom hook (`useSetupModal`). This hook manages interview configuration in a modal overlay. However, for MVP simplicity, we want direct navigation to the `/setup` page.

## Solution
Replaced `useSetupModal` hook calls with Next.js router navigation (`router.push("/setup")`).

## Files Modified

### 1. `/components/dashboard/layout/toolbar.tsx`
**Changes:**
- Removed `import { useSetupModal } from "@/lib/hooks/use-setup-modal";`
- Removed `const setupModal = useSetupModal();` hook call
- Changed button onClick from `setupModal.open` to `router.push("/setup")`

**Before:**
```tsx
<Button
  variant="glow"
  size="sm"
  onClick={setupModal.open}
  className="hidden md:flex"
>
  <Mic className="h-4 w-4 mr-2" />
  New Interview
</Button>
```

**After:**
```tsx
<Button
  variant="glow"
  size="sm"
  onClick={() => router.push("/setup")}
  className="hidden md:flex"
>
  <Mic className="h-4 w-4 mr-2" />
  New Interview
</Button>
```

### 2. `/components/dashboard/sections/overview.tsx`
**Changes:**
- Added `import { useRouter } from "next/navigation";`
- Removed `import { useSetupModal } from "@/lib/hooks/use-setup-modal";`
- Changed `const setupModal = useSetupModal();` to `const router = useRouter();`
- Updated 3 button onClick handlers from `setupModal.open` to `router.push("/setup")`

**Locations Updated:**
1. **Empty state button** (for new users with 0 sessions)
2. **Empty activity card** (when no recent activity)
3. **Main "Start Mock Interview" button** (in the bottom card)

**Before:**
```tsx
<Button
  size="lg"
  onClick={setupModal.open}
  className="..."
>
  Start Mock Interview
  <ArrowRight className="ml-2 w-4 h-4" />
</Button>
```

**After:**
```tsx
<Button
  size="lg"
  onClick={() => router.push("/setup")}
  className="..."
>
  Start Mock Interview
  <ArrowRight className="ml-2 w-4 h-4" />
</Button>
```

## Expected User Flow
1. User clicks "New Interview" (toolbar) or "Start Mock Interview" (overview)
2. Next.js router navigates to `/setup` page
3. User configures interview settings (type, mode, voice)
4. Setup page navigates to `/interview?roundType=...&mode=...&voice=...`
5. Interview session begins

## Testing Checklist
- [ ] Click "New Interview" button in toolbar → navigates to `/setup`
- [ ] Click "Start Mock Interview" in overview section → navigates to `/setup`
- [ ] Click "Start Your First Interview" (empty state) → navigates to `/setup`
- [ ] All buttons show proper hover states
- [ ] No console errors on button click
- [ ] Setup page loads correctly with configuration UI

## Migration Notes for Main Project
To apply these fixes to the main project (`/app/dashboard/page.tsx`):

1. The old dashboard already uses `router.push` approach with a Link wrapper
2. Remove the Link wrapper and use direct onClick handler:

```tsx
// OLD (in /app/dashboard/page.tsx)
<Link href="/setup" className="flex-1">
  <Button size="lg" className="w-full ...">
    Start Mock Interview
  </Button>
</Link>

// NEW
<Button
  size="lg"
  onClick={() => router.push("/setup")}
  className="w-full ..."
>
  Start Mock Interview
</Button>
```

## Dependencies
- Next.js router (`useRouter` from `next/navigation`)
- No new dependencies added
- Removed dependency on `useSetupModal` hook

## Build Status
✅ TypeScript compilation successful
✅ No ESLint errors in modified files
⚠️ Unrelated build warning about `/interview` page using `useSearchParams()` without Suspense (separate issue)

## Related Documentation
- User flow: Landing → Dashboard → Setup → Interview
- See ADR-020 in CLAUDE.md for authentication flow
- See `/app/setup/page.tsx` for configuration UI
