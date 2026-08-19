import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import fixtures from "../../test-fixtures/interviewer-contracts.json";
import { sha256Utf8Hex } from "./interview-brief-canonicalization";
import {
  InterviewerContractError,
  calculateInterviewBriefV2PayloadDigest,
  canonicalizeInterviewBriefV2Payload,
  parseInterviewBriefV2,
  parseInterviewRoomMetadata,
  resolveOptionalInterviewBriefV2,
} from "./index";

function withValidBriefDigest(
  mutate: (brief: typeof fixtures.brief) => void
): typeof fixtures.brief {
  const brief = structuredClone(fixtures.brief);
  mutate(brief);
  const digest = calculateInterviewBriefV2PayloadDigest(brief as never);
  brief.payload_digest = digest;
  brief.brief_id = `brief:${digest.slice("sha256:".length)}`;
  return brief;
}

test("brief payload and digest are deterministic, replay-stable, and content-bound", () => {
  const brief = parseInterviewBriefV2(fixtures.brief);
  const reorderedBrief = parseInterviewBriefV2(
    Object.fromEntries(
      Object.entries(structuredClone(fixtures.brief)).reverse()
    )
  );
  const canonical = canonicalizeInterviewBriefV2Payload(brief);
  const nodeDigest = `sha256:${createHash("sha256")
    .update(canonical, "utf8")
    .digest("hex")}`;

  assert.equal(calculateInterviewBriefV2PayloadDigest(brief), nodeDigest);
  assert.equal(nodeDigest, brief.payload_digest);
  assert.equal(canonicalizeInterviewBriefV2Payload(reorderedBrief), canonical);
  assert.equal(
    calculateInterviewBriefV2PayloadDigest(reorderedBrief),
    brief.payload_digest
  );
  assert.equal("compiled_at" in brief, false);
});

test("brief hashing matches the standard SHA-256 abc vector", () => {
  assert.equal(
    sha256Utf8Hex("abc"),
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
  );
});

test("brief Unicode scalars are parity-safe and surrogate failures fall back", () => {
  for (const unicodeCase of fixtures.unicode_cases) {
    const candidate = {
      ...structuredClone(fixtures.brief),
      candidate_practice_goal: unicodeCase.candidate_practice_goal,
    };
    if (!unicodeCase.accepted) {
      assert.throws(
        () => canonicalizeInterviewBriefV2Payload(candidate as never),
        (error) =>
          error instanceof InterviewerContractError &&
          error.code === "invalid_payload"
      );
      assert.deepEqual(resolveOptionalInterviewBriefV2(candidate), {
        mode: "room_metadata_v1",
        reason: "invalid_payload",
      });
      continue;
    }
    const payloadDigest = unicodeCase.payload_digest!;
    const parsed = parseInterviewBriefV2({
      ...candidate,
      brief_id: `brief:${payloadDigest.slice("sha256:".length)}`,
      payload_digest: payloadDigest,
    });
    const canonical = canonicalizeInterviewBriefV2Payload(parsed);
    assert.equal(calculateInterviewBriefV2PayloadDigest(parsed), payloadDigest);
    assert.equal(
      `sha256:${createHash("sha256").update(canonical, "utf8").digest("hex")}`,
      payloadDigest
    );
  }
});

test("brief numeric wire forms reject floats and exponents before hashing", () => {
  const canonicalBriefWire = JSON.stringify(fixtures.brief);
  const canonicalRoomWire = JSON.stringify({
    ...fixtures.room_metadata_v1,
    interview_brief: fixtures.brief,
  });
  for (const numericCase of fixtures.numeric_wire_cases) {
    const replaceDuration = (wire: string) =>
      wire.replace(
        '"duration_minutes":30',
        `"duration_minutes":${numericCase.duration_lexeme}`
      );
    assert.throws(
      () => parseInterviewBriefV2(replaceDuration(canonicalBriefWire)),
      (error) =>
        error instanceof InterviewerContractError &&
        error.code === "invalid_payload"
    );
    const room = parseInterviewRoomMetadata(replaceDuration(canonicalRoomWire));
    assert.equal(room.interview_brief, undefined);
    assert.equal(room.config.duration, 30);
  }
});

test("room metadata validates only the unambiguous top-level brief numeric wire", () => {
  for (const numericCase of fixtures.room_metadata_numeric_adversarial_cases) {
    const nestedMarker = `nested-${numericCase.name}`;
    const topLevelMarker = `top-level-${numericCase.name}`;
    let wire = JSON.stringify({
      ...fixtures.room_metadata_v1,
      question: {
        ...fixtures.room_metadata_v1.question,
        interview_brief: { duration_minutes: nestedMarker },
      },
      interview_brief: {
        ...fixtures.brief,
        duration_minutes: topLevelMarker,
      },
    })
      .replace(
        `"duration_minutes":"${nestedMarker}"`,
        `"duration_minutes":${numericCase.nested_duration_lexeme}`
      )
      .replace(
        `"duration_minutes":"${topLevelMarker}"`,
        `"duration_minutes":${numericCase.top_level_duration_lexeme}`
      );
    if (numericCase.duplicate_top_level_brief) {
      wire = `${wire.slice(0, -1)},"interview_brief":${JSON.stringify(
        fixtures.brief
      )}}`;
    }

    const parsed = parseInterviewRoomMetadata(wire);
    if (numericCase.accepted) {
      assert.deepEqual(parsed.interview_brief, fixtures.brief);
    } else {
      assert.equal(parsed.interview_brief, undefined);
    }
  }
});

test("room metadata stays v1 and negotiates the optional nested brief", () => {
  const withBrief = parseInterviewRoomMetadata(
    JSON.stringify({
      ...fixtures.room_metadata_v1,
      interview_brief: fixtures.brief,
    })
  );
  assert.equal(withBrief.contract_version, 1);
  assert.deepEqual(withBrief.interview_brief, fixtures.brief);
  assert.deepEqual(withBrief.interview_brief?.selected_question, {
    id: fixtures.room_metadata_v1.question.id,
    text: fixtures.room_metadata_v1.question.text,
    company: fixtures.room_metadata_v1.question.company,
    type: fixtures.room_metadata_v1.question.type,
  });

  const absent = parseInterviewRoomMetadata(
    JSON.stringify(fixtures.room_metadata_v1)
  );
  assert.equal(absent.interview_brief, undefined);
  assert.deepEqual(resolveOptionalInterviewBriefV2(undefined), {
    mode: "room_metadata_v1",
    reason: "absent",
  });

  for (const nestedBrief of [
    { ...fixtures.brief, contract_version: "interview-brief.v999" },
    { ...fixtures.brief, selected_question: { id: "malformed" } },
    { ...fixtures.brief, payload_digest: `sha256:${"0".repeat(64)}` },
  ]) {
    const parsed = parseInterviewRoomMetadata(
      JSON.stringify({
        ...fixtures.room_metadata_v1,
        interview_brief: nestedBrief,
      })
    );
    assert.equal(parsed.contract_version, 1);
    assert.equal(parsed.interview_brief, undefined);
    assert.equal(
      parsed.question?.text,
      fixtures.room_metadata_v1.question.text
    );
  }

  assert.throws(
    () =>
      parseInterviewRoomMetadata(
        JSON.stringify({ ...fixtures.room_metadata_v1, contract_version: 2 })
      ),
    /unsupported_contract/
  );
});

test("every nested brief authority mismatch falls back to unchanged v1 metadata", () => {
  const mismatches = [
    withValidBriefDigest((brief) => {
      brief.session_id = "session-substituted";
    }),
    withValidBriefDigest((brief) => {
      brief.deadline_at = "2026-08-18T23:29:59.999Z";
    }),
    withValidBriefDigest((brief) => {
      brief.round_type = "strategy";
      brief.round_pack.round_type = "strategy";
    }),
    withValidBriefDigest((brief) => {
      brief.difficulty = "advanced";
    }),
    withValidBriefDigest((brief) => {
      brief.duration_minutes = 45;
    }),
    ...(["id", "text", "company", "type"] as const).map((field) =>
      withValidBriefDigest((brief) => {
        if (field === "company") {
          Object.assign(brief, { company_context: null });
          brief.selected_question.company = "Figma";
        } else {
          brief.selected_question[field] = `${field}-substituted`;
        }
      })
    ),
  ];

  for (const mismatched of mismatches) {
    const parsed = parseInterviewRoomMetadata(
      JSON.stringify({
        ...fixtures.room_metadata_v1,
        interview_brief: mismatched,
      })
    );
    assert.equal(parsed.interview_brief, undefined);
    assert.deepEqual(parsed.question, fixtures.room_metadata_v1.question);
    assert.equal(parsed.config.hintMode, "off");
    assert.equal(parsed.config.feedback_mode, "end_only");
  }
});
