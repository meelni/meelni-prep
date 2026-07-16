# RLS Deployment Guide

This guide now delegates to the canonical
[database migration runbook](../operations/database-migrations.md). The former
manual Supabase SQL-editor workflow is retired because it could drift from the
Drizzle journal and restore unsafe browser write privileges.

## Required workflow

1. Keep the relaunch gate off.
2. Select the intended Preview or Production environment explicitly.
3. Run the scoped database preflight from the operations runbook.
4. Rehearse with `npm run test:database-migrations`.
5. Apply the complete journal only through the guarded `db:migrate:preview` or
   `db:migrate:production` wrapper described in that runbook.
6. Run preflight again and require the `reconciled` state.
7. Run `npm run auth:doctor:db` against the same configured environment.

Do not paste standalone RLS helpers into the SQL editor. Do not use
`drizzle-kit push` against Preview or Production.

## Transcript verification

The postflight and doctor must prove all of the following:

- authenticated roles cannot insert into `transcript_turn`;
- authenticated and anonymous roles cannot write runtime writer, settlement,
  or interruption-marker evidence;
- only the service-authenticated runtime path can create canonical transcript
  evidence;
- all expected tables have RLS enabled and no unsafe transcript policy exists.

If any check fails, do not patch grants manually. Keep the relaunch gate off,
reconcile the database through a new reviewed forward migration, and repeat the
disposable-database rehearsal.
