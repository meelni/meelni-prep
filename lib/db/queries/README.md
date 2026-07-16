# Database Queries

This directory contains Drizzle ORM query functions organized by domain.

## Files

### `transcript.ts`

Transcript retrieval functions (existing).

### `session-comparison.ts`

Session comparison queries (existing).

## Best Practices

1. **Error Handling**: All query functions catch errors and return safe defaults
2. **Batch Queries**: Use SQL IN clauses instead of loops
3. **Null Safety**: Check for null/undefined before operations
4. **Type Safety**: All functions have proper TypeScript types
5. **Performance**: Use indexes on foreign keys (userId, sessionId)

## Testing

Test query functions with different user scenarios:

- New user (0 sessions)
- Light user (1-5 sessions)
- Active user (10+ sessions)
- Power user (50+ sessions)
