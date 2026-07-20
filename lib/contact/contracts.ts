import { z } from "zod";

export const CONTACT_REASONS = [
  "billing",
  "support",
  "bug",
  "feedback",
  "other",
] as const;

const SINGLE_LINE_CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/;
const MESSAGE_CONTROL_CHARACTER =
  /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;

function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

export const contactSubmissionSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Name is required")
      .max(100)
      .refine((value) => !SINGLE_LINE_CONTROL_CHARACTER.test(value), {
        message: "Name contains unsupported characters",
      })
      .refine((value) => utf8ByteLength(value) <= 400, {
        message: "Name is too large",
      }),
    email: z
      .string()
      .trim()
      .email("Enter a valid email address")
      .max(320)
      .transform((email) => email.toLowerCase())
      .refine(
        (value) =>
          !SINGLE_LINE_CONTROL_CHARACTER.test(value) &&
          !/\s/.test(value) &&
          utf8ByteLength(value) <= 320,
        { message: "Enter a valid email address" }
      ),
    reason: z.enum(CONTACT_REASONS),
    subject: z
      .string()
      .trim()
      .min(1, "Subject is required")
      .max(200)
      .refine((value) => !SINGLE_LINE_CONTROL_CHARACTER.test(value), {
        message: "Subject contains unsupported characters",
      })
      .refine((value) => utf8ByteLength(value) <= 800, {
        message: "Subject is too large",
      }),
    message: z
      .string()
      .trim()
      .min(10, "Message must be at least 10 characters")
      .max(5000)
      .refine((value) => !MESSAGE_CONTROL_CHARACTER.test(value), {
        message: "Message contains unsupported characters",
      })
      .refine((value) => utf8ByteLength(value) <= 20_000, {
        message: "Message is too large",
      }),
  })
  .strict();

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
  | "contact_unavailable"
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
