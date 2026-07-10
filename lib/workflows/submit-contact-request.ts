import type { ContactSubmissionInput } from "@/lib/contact/contracts";

export interface ContactSubmissionStoreInput extends ContactSubmissionInput {
  idempotencyKey: string;
  rateLimitIdentities: {
    client: string;
    email: string;
    global: string;
  };
}

export type ContactSubmissionStoreDecision =
  | { disposition: "stored"; receiptId: string }
  | { disposition: "replayed"; receiptId: string }
  | { disposition: "idempotency_conflict" }
  | { disposition: "rate_limited"; retryAfterSeconds: number };

export interface ContactSubmissionStore {
  accept(
    input: ContactSubmissionStoreInput
  ): Promise<ContactSubmissionStoreDecision>;
}

export type SubmitContactRequestResult =
  | {
      ok: true;
      state: "stored";
      receiptId: string;
      duplicate: boolean;
    }
  | {
      ok: false;
      code: "idempotency_conflict" | "rate_limited" | "storage_unavailable";
      retryable: boolean;
      retryAfterSeconds?: number;
    };

export async function submitContactRequest(
  input: ContactSubmissionStoreInput,
  store: ContactSubmissionStore
): Promise<SubmitContactRequestResult> {
  try {
    const decision = await store.accept(input);

    switch (decision.disposition) {
      case "stored":
        return {
          ok: true,
          state: "stored",
          receiptId: decision.receiptId,
          duplicate: false,
        };
      case "replayed":
        return {
          ok: true,
          state: "stored",
          receiptId: decision.receiptId,
          duplicate: true,
        };
      case "idempotency_conflict":
        return {
          ok: false,
          code: "idempotency_conflict",
          retryable: false,
        };
      case "rate_limited":
        return {
          ok: false,
          code: "rate_limited",
          retryable: true,
          retryAfterSeconds: decision.retryAfterSeconds,
        };
    }
  } catch {
    return {
      ok: false,
      code: "storage_unavailable",
      retryable: true,
    };
  }
}
