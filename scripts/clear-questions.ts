/**
 * Retired: destructive clear-and-reinsert is not a supported sync procedure.
 * Question sync converges active state atomically without deleting provenance.
 */

console.error(
  "clear-questions is retired; use docs/operations/question-sync.md."
);
process.exitCode = 1;
