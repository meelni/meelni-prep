# AGENTS.md - Ralph Coding Agent Patterns

This file contains patterns and conventions discovered during automated development. Ralph updates this file when discovering reusable patterns that benefit future iterations.

## Quality Gates

Every commit must pass:
```bash
npm run typecheck    # TypeScript strict mode
npm run lint         # ESLint
```

Recommended before merge:
```bash
npm run build        # Full production build
npm run format:check # Prettier validation
```

## Commit Message Format

```
feat: [STORY-ID] - [Story Title]
```

Examples:
- `feat: US-001 - Add user preferences table`
- `feat: US-002 - Create preferences API endpoint`
- `fix: US-003 - Handle null case in preferences query`

## File Creation Patterns

### New API Route
Location: `/app/api/[name]/route.ts`
```typescript
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Implementation
    return NextResponse.json({ data });
  } catch (error) {
    console.error("Error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
```

### API Route with Dynamic Params (Next.js 15+)
Location: `/app/api/[name]/[param]/route.ts`
```typescript
import { NextRequest, NextResponse } from "next/server";

// IMPORTANT: In Next.js 15+, params is a Promise
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ param: string }> }
) {
  // Must await params before accessing values
  const { param } = await params;

  // Continue with implementation
}
```

### New Database Table
Location: `/lib/db/schema.ts`
```typescript
export const newTable = pgTable("new_table", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => appUser.id),
  // ... fields
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});
```
Then run: `npm run db:push`

### New Component
Location: `/components/[name].tsx`
```typescript
"use client"; // Only if using hooks, events, or browser APIs

import { useState } from "react";
import { Button } from "@/components/ui/button";

interface ComponentNameProps {
  // Props with types
}

export function ComponentName({ ...props }: ComponentNameProps) {
  // Implementation
}
```

## Testing Patterns

### Manual Testing Checklist
- [ ] Feature works as expected
- [ ] Error states handled gracefully
- [ ] Loading states present
- [ ] TypeScript has no errors
- [ ] No console errors in browser

### Verification Commands
```bash
# Type safety
npm run typecheck

# Code quality
npm run lint

# Full build test
npm run build

# Database schema
npm run db:check
```

## Common Issues & Solutions

### Issue: "Module not found" after adding new file
**Solution**: Restart TypeScript server or run `npm run typecheck`

### Issue: Supabase query returns null unexpectedly
**Solution**: Check RLS policies - user might not have access

### Issue: Component not updating after state change
**Solution**: Ensure component has `"use client"` directive

### Issue: API route returns 500 with no useful error
**Solution**: Check server logs, ensure proper try/catch with logging

---

## Patterns Discovered by Ralph

(Ralph will add new patterns here as they're discovered during development)

---

Last updated: 2026-01-16
