export interface FeedbackRecoveryState {
  status: string;
  retryable?: boolean;
}

export type FeedbackRecoveryAttempt<T> =
  | { disposition: "not_retryable" | "already_attempted" }
  | { disposition: "recovered"; value: T };

export interface FeedbackRecoveryCoordinator {
  attempt<T>(
    state: FeedbackRecoveryState,
    recover: () => Promise<T>
  ): Promise<FeedbackRecoveryAttempt<T>>;
}

export function createFeedbackRecoveryCoordinator(): FeedbackRecoveryCoordinator {
  let attempted = false;
  let inFlight: Promise<FeedbackRecoveryAttempt<unknown>> | null = null;

  return {
    attempt<T>(state: FeedbackRecoveryState, recover: () => Promise<T>) {
      if (state.retryable !== true) {
        return Promise.resolve({ disposition: "not_retryable" });
      }
      if (inFlight) {
        return inFlight as Promise<FeedbackRecoveryAttempt<T>>;
      }
      if (attempted) {
        return Promise.resolve({ disposition: "already_attempted" });
      }

      attempted = true;
      inFlight = recover()
        .then(
          (value): FeedbackRecoveryAttempt<T> => ({
            disposition: "recovered",
            value,
          })
        )
        .finally(() => {
          inFlight = null;
        });
      return inFlight as Promise<FeedbackRecoveryAttempt<T>>;
    },
  };
}

export interface FeedbackPollBudget {
  consume(): boolean;
  reset(): void;
}

export function createFeedbackPollBudget(maxPolls: number): FeedbackPollBudget {
  if (!Number.isInteger(maxPolls) || maxPolls <= 0) {
    throw new Error("Feedback poll budget must be a positive integer");
  }
  let polls = 0;
  return {
    consume() {
      if (polls >= maxPolls) return false;
      polls += 1;
      return true;
    },
    reset() {
      polls = 0;
    },
  };
}
