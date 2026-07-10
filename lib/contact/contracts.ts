import { z } from "zod";

export const CONTACT_REASONS = [
  "billing",
  "support",
  "bug",
  "feedback",
  "other",
] as const;

export const contactSubmissionSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  email: z
    .string()
    .trim()
    .email("Enter a valid email address")
    .max(320)
    .transform((email) => email.toLowerCase()),
  reason: z.enum(CONTACT_REASONS),
  subject: z.string().trim().min(1, "Subject is required").max(200),
  message: z
    .string()
    .trim()
    .min(10, "Message must be at least 10 characters")
    .max(5000),
});

export const contactIdempotencyKeySchema = z.string().uuid();

export type ContactReason = (typeof CONTACT_REASONS)[number];
export type ContactSubmissionInput = z.infer<typeof contactSubmissionSchema>;

export type ContactSubmissionSuccess = {
  ok: true;
  state: "stored";
  receiptId: string;
  duplicate: boolean;
};

export type ContactSubmissionErrorCode =
  | "invalid_request"
  | "invalid_idempotency_key"
  | "idempotency_conflict"
  | "rate_limited"
  | "storage_unavailable";

export type ContactSubmissionError = {
  ok: false;
  code: ContactSubmissionErrorCode;
  message: string;
  retryable: boolean;
  retryAfterSeconds?: number;
};

export type ContactSubmissionResponse =
  | ContactSubmissionSuccess
  | ContactSubmissionError;
