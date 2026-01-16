# Ralph Agent Instructions for Meelni

You are an autonomous coding agent working on Meelni, a real-time AI mock interview platform. Each iteration, you will implement ONE user story and commit your work.

## Your Task (Execute in Order)

1. **Read project state:**
   - `scripts/ralph/prd.json` - Current user stories and status
   - `scripts/ralph/progress.txt` - Previous learnings (check Codebase Patterns first!)
   - `scripts/ralph/AGENTS.md` - Ralph-specific patterns

2. **Verify branch:**
   - Ensure you're on the branch specified in `prd.json.branchName`
   - If not, checkout or create the branch

3. **Select ONE story:**
   - Pick the highest priority story where `passes: false`
   - Priority is determined by the `priority` field (lower = higher priority)
   - If all stories have `passes: true`, output `<promise>COMPLETE</promise>` and stop

4. **Implement the story:**
   - Read the `acceptanceCriteria` carefully
   - Make minimal, focused changes
   - Follow existing code patterns (see Codebase Patterns below)

5. **Run quality checks:**
   ```bash
   npm run typecheck    # TypeScript strict mode
   npm run lint         # ESLint
   npm run build        # Production build (catches runtime issues)
   ```
   - ALL checks must pass before committing

6. **Update documentation:**
   - If you discovered reusable patterns, add them to `scripts/ralph/AGENTS.md`
   - Only add general patterns, not story-specific details

7. **Commit your changes:**
   ```bash
   git add -A
   git commit -m "feat: [STORY-ID] - [Story Title]"
   ```

8. **Update prd.json:**
   - Set `passes: true` for the completed story
   - Add any notes in the `notes` field

9. **Append to progress.txt:**
   ```markdown
   ## [Date] - [Story ID]: [Title]
   - What was implemented
   - Files changed: [list files]
   - **Learnings:**
     - Patterns discovered
     - Gotchas encountered
   ---
   ```

10. **End normally** (do not output the completion signal unless ALL stories pass)

---

## Meelni Tech Stack

### Frontend
- **Framework**: Next.js 16 (App Router)
- **React**: 19.2.0
- **Styling**: Tailwind CSS v4
- **Components**: shadcn/ui + custom in `/components/ui/`
- **Animation**: Framer Motion
- **Icons**: Lucide React
- **State**: React Context (auth), URL params (setup flow)

### Backend
- **API Routes**: `/app/api/[route]/route.ts`
- **Database**: Supabase PostgreSQL
- **ORM**: Drizzle ORM (`/lib/db/`)
- **Auth**: Supabase Auth
- **Validation**: Manual (Zod planned)

### Real-time
- **WebRTC**: LiveKit Cloud
- **Agents**: Python in `/agent/` directory

---

## Quality Check Commands

```bash
# REQUIRED before every commit:
npm run typecheck    # Must pass - TypeScript strict mode
npm run lint         # Must pass - ESLint

# RECOMMENDED (catches more issues):
npm run build        # Full production build
npm run format:check # Prettier formatting

# Database changes:
npm run db:push      # Push schema to Supabase (dev mode)
npm run db:check     # Validate schema
```

---

## Codebase Patterns (CRITICAL - Follow These)

### API Routes
- Location: `/app/api/[name]/route.ts`
- Always export named handlers: `GET`, `POST`, `PUT`, `DELETE`
- Use `NextRequest` and `NextResponse`
- Check auth with Supabase server client:
  ```typescript
  import { createClient } from "@/lib/supabase/server";
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  ```

### Database Queries (Drizzle ORM)
- Schema: `/lib/db/schema.ts`
- Client: `/lib/db/index.ts`
- Pattern:
  ```typescript
  import { db } from "@/lib/db";
  import { interviewSession } from "@/lib/db/schema";
  const sessions = await db.query.interviewSession.findMany({
    where: eq(interviewSession.userId, userId),
  });
  ```

### Components
- Server components by default
- Add `"use client"` only when using hooks, events, or browser APIs
- UI components in `/components/ui/`
- Use existing button variants: `primary`, `secondary`, `ghost`, `outline`

### Styling
- Use Tailwind classes, not custom CSS
- RGB color variables: `rgb(var(--primary) / 0.5)`
- Animation: Use Framer Motion presets from `/lib/animations.ts`

### Error Handling
- API routes: Return proper HTTP status codes with JSON body
- Client: Use try/catch with meaningful error messages
- Never expose internal errors to users

---

## Common Gotchas

1. **Supabase Client Import:**
   - Server: `import { createClient } from "@/lib/supabase/server"`
   - Client: `import { createClient } from "@/lib/supabase/client"`
   - Never use server client in `"use client"` components

2. **TypeScript Strict Mode:**
   - No implicit `any`
   - Null checks required
   - Optional chaining: `user?.email` not `user.email`

3. **Next.js App Router:**
   - Page components are async by default
   - Use `generateMetadata` for SEO, not `<Head>`
   - Loading states in `loading.tsx`

4. **Environment Variables:**
   - Public vars need `NEXT_PUBLIC_` prefix
   - Never commit `.env.local`

5. **Drizzle Schema Changes:**
   - After editing `/lib/db/schema.ts`, run `npm run db:push`
   - Check dependent files: API routes, components, services

---

## Stop Condition

If ALL stories in `prd.json` have `passes: true`, output ONLY:

```
<promise>COMPLETE</promise>
```

Otherwise, end normally after updating progress.txt.

---

## File References

- **Main docs**: `.claude/CLAUDE.md`
- **PRD**: `.claude/PRD.md`
- **ADRs**: `docs/architecture/adrs/`
- **API docs**: `docs/api/`
- **Schema**: `/lib/db/schema.ts`

---

## Example Commit Flow

```bash
# After implementing US-001
git add -A
git status  # Verify changes
npm run typecheck && npm run lint  # Verify quality
git commit -m "feat: US-001 - Add user preferences table"
```

Then update `scripts/ralph/prd.json`:
```json
{
  "id": "US-001",
  "passes": true,
  "notes": "Added preferences table with dark_mode and notification settings"
}
```
