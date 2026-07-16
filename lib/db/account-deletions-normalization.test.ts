import assert from "node:assert/strict";
import test from "node:test";

import {
  buildLiveKitDeletionRooms,
  normalizeLiveKitDeletionRooms,
} from "./account-deletions";

function room(
  roomName: string | null,
  generation: number,
  provisioning: boolean,
  provisioningExpiresAt: string | null
) {
  const built = buildLiveKitDeletionRooms(
    [roomName ?? "interview-duplicate-expiry"],
    { provisioning, provisioningExpiresAt }
  )[0]!;
  return { ...built, roomName, generation };
}

test("LiveKit deletion expiries normalize offsets and reject invalid instants", () => {
  const [target] = buildLiveKitDeletionRooms(["interview-offset-expiry"], {
    provisioning: true,
    provisioningExpiresAt: "2026-07-12T12:30:00.000-08:00",
  });
  assert.equal(
    normalizeLiveKitDeletionRooms([target])[0]?.provisioningExpiresAt,
    "2026-07-12T20:30:00.000Z"
  );
  assertInvalid([{ ...target, provisioningExpiresAt: "not-a-timestamp" }]);
});

test("LiveKit deletion expiries reject unknown offsets and UTC boundary crossings", () => {
  const lease = room(
    "interview-boundary-expiry",
    1,
    true,
    "2026-07-12T00:10:00.000Z"
  );
  for (const invalid of [
    "2026-07-12T00:10:00-00:00",
    "0001-01-01T00:00:00+00:01",
    "9999-12-31T23:59:59-00:01",
  ]) {
    assertInvalid([{ ...lease, provisioningExpiresAt: invalid }]);
  }
});

test("accepted expiry boundaries are canonical and normalization is idempotent", () => {
  for (const [input, expected] of [
    ["0001-01-01T00:00:00Z", "0001-01-01T00:00:00.000Z"],
    ["9999-12-31T23:59:59.999Z", "9999-12-31T23:59:59.999Z"],
    ["2026-07-12T12:30:00-08:00", "2026-07-12T20:30:00.000Z"],
  ] as const) {
    const once = normalizeLiveKitDeletionRooms([
      room("interview-idempotent-expiry", 1, true, input),
    ]);
    assert.equal(once[0]?.provisioningExpiresAt, expected);
    assert.deepEqual(normalizeLiveKitDeletionRooms(once), once);
  }
});

test("duplicate leases reduce chronologically and independently of array order", () => {
  const earlier = room(
    "interview-duplicate-expiry",
    1,
    true,
    "2026-07-12T01:05:00+02:00"
  );
  const later = room(
    "interview-duplicate-expiry",
    1,
    true,
    "2026-07-12T00:10:00.000Z"
  );
  const expected = [
    { ...later, provisioningExpiresAt: "2026-07-12T00:10:00.000Z" },
  ];
  assert.deepEqual(normalizeLiveKitDeletionRooms([earlier, later]), expected);
  assert.deepEqual(normalizeLiveKitDeletionRooms([later, earlier]), expected);
});

test("highest generation wins while retaining a known cleanup target", () => {
  const provisioning = room(
    "interview-duplicate-expiry",
    1,
    true,
    "2026-07-12T00:30:00.000Z"
  );
  const postCreate = room(null, 2, false, null);
  const expected = [{ ...postCreate, roomName: "interview-duplicate-expiry" }];
  assert.deepEqual(
    normalizeLiveKitDeletionRooms([provisioning, postCreate]),
    expected
  );
  assert.deepEqual(
    normalizeLiveKitDeletionRooms([postCreate, provisioning]),
    expected
  );
});

test("same-generation contradictory provisioning state unions conservatively", () => {
  const ready = room("interview-duplicate-expiry", 2, false, null);
  const uncertain = room(null, 2, true, "2026-07-12T00:30:00-08:00");
  const expected = [
    {
      ...ready,
      provisioning: true,
      provisioningExpiresAt: "2026-07-12T08:30:00.000Z",
    },
  ];
  assert.deepEqual(normalizeLiveKitDeletionRooms([ready, uncertain]), expected);
  assert.deepEqual(normalizeLiveKitDeletionRooms([uncertain, ready]), expected);
});

test("first-write normalization deduplicates targets and rejects ambiguous timestamps", () => {
  const duplicate = room(
    "interview-duplicate-expiry",
    1,
    true,
    "2026-07-12T00:10:00.000Z"
  );
  assert.equal(normalizeLiveKitDeletionRooms([duplicate, duplicate]).length, 1);
  const originalTimeZone = process.env.TZ;
  try {
    for (const timeZone of ["UTC", "America/Los_Angeles"]) {
      process.env.TZ = timeZone;
      for (const invalid of [
        "2026-07-12T12:30:00",
        "2026-02-30T00:00:00Z",
        "2026-07-12T00:00:00.0001Z",
        "0",
      ]) {
        assertInvalid([{ ...duplicate, provisioningExpiresAt: invalid }]);
      }
      assert.equal(
        normalizeLiveKitDeletionRooms([
          {
            ...duplicate,
            provisioningExpiresAt: "2026-07-12T00:10:00-08:00",
          },
        ])[0]?.provisioningExpiresAt,
        "2026-07-12T08:10:00.000Z"
      );
    }
  } finally {
    if (originalTimeZone === undefined) delete process.env.TZ;
    else process.env.TZ = originalTimeZone;
  }
});

function assertInvalid(value: unknown) {
  assert.throws(
    () => normalizeLiveKitDeletionRooms(value),
    (error: unknown) =>
      error instanceof Error &&
      "code" in error &&
      error.code === "account_deletion_rooms_invalid"
  );
}
