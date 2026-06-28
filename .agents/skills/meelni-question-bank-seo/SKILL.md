---
name: meelni-question-bank-seo
description: Work on Meelni question bank, explore pages, company PM interview pages, SEO, structured data, sitemap behavior, Google Sheets sync, question selection, or conversion from public content into practice sessions.
---

# Meelni Question Bank SEO

Use this skill for the public question/company content engine and its conversion path into live practice.

## Read First

- `AGENTS.md`
- `docs/seo/EXPLORE_PAGE_SEO_OPTIMIZATION.md`
- `docs/seo/IMPLEMENTATION_CHECKLIST.md`
- `app/explore/page.tsx`
- `app/companies/`
- `components/explore/`
- `lib/db/questions.ts`
- `scripts/sync-questions-from-sheet.ts`
- `docs/integrations/google-sheets-setup.md`

## Workflow

1. Identify whether the work affects indexing, question data, company pages, filtering/search, or practice conversion.
2. Preserve structured data, metadata, sitemap discoverability, and semantic HTML.
3. Keep the conversion path clear: public question or company page -> selected question -> setup -> live practice -> feedback.
4. Avoid inventing question facts. Keep company/question content grounded in the stored question bank or explicit product copy.
5. Update docs/contracts when question payloads or URL behavior change.

## Checks

- Does the page still render useful content without authentication?
- Does selected-question practice preserve company, question type, and question text?
- Are metadata and structured data consistent with visible content?
- Are analytics events useful for search-to-practice conversion?
