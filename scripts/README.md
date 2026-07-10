# Meelni Scripts

This directory contains local development, verification, migration-safety, and operator entrypoints.

Question sync has one executable procedure: [Question sync operations](../docs/operations/question-sync.md). Do not copy commands from historical commits or create alternate cron, cookie/session, direct-database, clear-and-reinsert, or verbose-debug workflows.

Source configuration is documented in [Google Sheets question source](../docs/integrations/google-sheets-setup.md). The supported CLI delegates to the same authenticated-route workflow and transaction boundary; its only optional argument is `--dry-run`.

General local environment and quality commands are documented in [Operations tooling](../docs/operations/tooling.md) and [Code quality checks](../docs/operations/code-quality-checks.md).
