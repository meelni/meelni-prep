import assert from "node:assert/strict";
import test from "node:test";

import { contactSubmissionSchema } from "./contracts";

const valid = {
  name: "Candidate",
  email: "Candidate@Example.invalid",
  reason: "support",
  subject: "Account question",
  message: "Please help with this account question.",
};

test("contact input is strict and normalizes the stored text contract", () => {
  assert.equal(
    contactSubmissionSchema.safeParse({ ...valid, userId: "untrusted" })
      .success,
    false
  );

  const parsed = contactSubmissionSchema.parse({
    ...valid,
    name: "  Candidate  ",
    email: "  Candidate@Example.invalid  ",
    subject: "  Account question  ",
    message: "  First line\nSecond line with\ttab.  ",
  });
  assert.deepEqual(parsed, {
    ...valid,
    email: "candidate@example.invalid",
    message: "First line\nSecond line with\ttab.",
  });
});

test("contact input rejects values the database content checks reject", () => {
  for (const candidate of [
    { ...valid, name: "Candidate\nInjected" },
    { ...valid, subject: "Account\u007fquestion" },
    { ...valid, message: "Valid prefix\u0000invalid control" },
    { ...valid, email: `${"é".repeat(160)}@example.invalid` },
  ]) {
    assert.equal(contactSubmissionSchema.safeParse(candidate).success, false);
  }
});

test("contact input accepts the exact maximum safe UTF-8 text bounds", () => {
  const parsed = contactSubmissionSchema.safeParse({
    ...valid,
    name: "😀".repeat(50),
    subject: "😀".repeat(100),
    message: "😀".repeat(2_500),
  });
  assert.equal(parsed.success, true);
});
