export const CONTACT_RATE_LIMIT_CLEANUP_BATCH_SIZE = 5_000;
export const CONTACT_RATE_LIMIT_CLEANUP_MAX_BATCHES = 4;

export interface ContactRateLimitCleanupSummary {
  deleted: number;
  batches: number;
  backlogLikely: boolean;
}

export async function cleanupContactRateLimits(
  cleanupBatch: (batchSize: number, batchIndex: number) => Promise<number>
): Promise<ContactRateLimitCleanupSummary> {
  let deleted = 0;
  let batches = 0;
  let lastBatchDeleted = 0;

  for (
    let index = 0;
    index < CONTACT_RATE_LIMIT_CLEANUP_MAX_BATCHES;
    index += 1
  ) {
    lastBatchDeleted = await cleanupBatch(
      CONTACT_RATE_LIMIT_CLEANUP_BATCH_SIZE,
      index
    );
    if (
      !Number.isInteger(lastBatchDeleted) ||
      lastBatchDeleted < 0 ||
      lastBatchDeleted > CONTACT_RATE_LIMIT_CLEANUP_BATCH_SIZE
    ) {
      throw new Error("invalid_contact_rate_limit_cleanup_result");
    }

    deleted += lastBatchDeleted;
    batches += 1;
    if (lastBatchDeleted < CONTACT_RATE_LIMIT_CLEANUP_BATCH_SIZE) break;
  }

  return {
    deleted,
    batches,
    backlogLikely:
      batches === CONTACT_RATE_LIMIT_CLEANUP_MAX_BATCHES &&
      lastBatchDeleted === CONTACT_RATE_LIMIT_CLEANUP_BATCH_SIZE,
  };
}
