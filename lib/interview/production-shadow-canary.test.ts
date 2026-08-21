import assert from "node:assert/strict";
import test from "node:test";

import { AccessToken, TrackSource } from "livekit-server-sdk";

import {
  ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_CONFIGURATION_SHA256,
  ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_SELECTED_CANDIDATE_SHA256,
} from "@meelni/agent";

import {
  parseProductionWebShadowConnectionJson,
  PRODUCTION_WEB_SHADOW_CONNECTION_MAX_BYTES,
  PRODUCTION_WEB_SHADOW_CONNECTION_VERSION,
  PRODUCTION_WEB_SHADOW_LIVEKIT_URL,
} from "./production-shadow-canary";
import { resolveProductionWebShadowCanaryAccess } from "./production-shadow-canary-access";

const RUN = "1".repeat(64);
const LEASE = "2".repeat(64);
const BINDING = "3".repeat(64);
const CANDIDATE = "4".repeat(40);
const NOW = new Date("2026-08-21T05:00:00.000Z");
const EXPIRY = "2026-08-21T05:30:00.000Z";
const OWNER = "123e4567-e89b-42d3-a456-426614174000";

function jwtPayload(
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    name: "Production Project Shadow Owner",
    video: {
      room: `preview-shadow-${BINDING}`,
      roomJoin: true,
      canPublish: true,
      canPublishData: false,
      canPublishSources: ["microphone"],
      canSubscribe: true,
    },
    iss: "test-api-key",
    exp: Date.parse(EXPIRY) / 1_000,
    nbf: Date.parse("2026-08-21T04:59:00.000Z") / 1_000,
    sub: "production-project-shadow-owner",
    ...overrides,
  };
}

function jwt(payload = jwtPayload()): string {
  const encode = (value: unknown) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "HS256" })}.${encode(payload)}.${"s".repeat(43)}`;
}

function connection() {
  return {
    contract_version: PRODUCTION_WEB_SHADOW_CONNECTION_VERSION,
    topology: "production_project_shadow",
    run_id: RUN,
    lease_id: LEASE,
    candidate_git_sha: CANDIDATE,
    preview_shadow_configuration_sha256:
      ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_CONFIGURATION_SHA256,
    selected_candidate_configuration_sha256:
      ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_SELECTED_CANDIDATE_SHA256,
    session_binding_sha256: BINDING,
    round: "product_sense",
    voice_condition: "baseline_final_turn",
    expires_at: EXPIRY,
    room: {
      roomName: `preview-shadow-${BINDING}`,
      token: jwt(),
      url: PRODUCTION_WEB_SHADOW_LIVEKIT_URL,
    },
  };
}

const parse = (value: unknown, now = NOW) =>
  parseProductionWebShadowConnectionJson(JSON.stringify(value), {
    runId: RUN,
    candidateGitSha: CANDIDATE,
    now,
  });

test("Production web Shadow connection accepts one exact current v2 record", () => {
  const parsed = parse(connection());
  assert.equal(parsed.run_id, RUN);
  assert.equal(parsed.room.roomName, `preview-shadow-${BINDING}`);
  assert.equal(parsed.room.url, PRODUCTION_WEB_SHADOW_LIVEKIT_URL);
  assert.equal(Object.isFrozen(parsed), true);
  assert.equal(Object.isFrozen(parsed.room), true);
});

test("Production web Shadow connection accepts the exact pinned LiveKit token shape", async () => {
  const token = new AccessToken("test-key", "s".repeat(32), {
    identity: "production-project-shadow-owner",
    name: "Production Project Shadow Owner",
    ttl: 30 * 60,
  });
  token.addGrant({
    room: `preview-shadow-${BINDING}`,
    roomJoin: true,
    canPublish: true,
    canPublishData: false,
    canPublishSources: [TrackSource.MICROPHONE],
    canSubscribe: true,
  });
  const value = connection();
  value.room.token = await token.toJwt();
  const payload = JSON.parse(
    Buffer.from(value.room.token.split(".")[1] ?? "", "base64url").toString(
      "utf8"
    )
  ) as { exp: number };
  value.expires_at = new Date(payload.exp * 1_000).toISOString();
  const parsed = parse(value, new Date());
  assert.equal(parsed.room.token, value.room.token);
});

test("Production web Shadow connection binds the JWT room and least-privilege grant", () => {
  for (const payload of [
    jwtPayload({
      video: {
        ...(jwtPayload().video as Record<string, unknown>),
        room: `preview-shadow-${"9".repeat(64)}`,
      },
    }),
    jwtPayload({ sub: "another-participant" }),
    jwtPayload({
      video: {
        ...(jwtPayload().video as Record<string, unknown>),
        canPublishData: true,
      },
    }),
    jwtPayload({
      video: {
        ...(jwtPayload().video as Record<string, unknown>),
        canPublishSources: ["microphone", "camera"],
      },
    }),
    jwtPayload({ exp: Date.parse("2026-08-21T05:30:01.000Z") / 1_000 }),
  ]) {
    const value = connection();
    value.room.token = jwt(payload);
    assert.throws(
      () => parse(value),
      /production_web_shadow_connection_invalid/
    );
  }
});

test("Production web Shadow connection rejects malformed and ambiguous JWTs", () => {
  const payload = jwtPayload();
  for (const token of [
    "header.payload.signature",
    jwt(payload).replace("eyJhbGciOiJIUzI1NiJ9", "eyJhbGciOiJub25lIn0"),
    `${Buffer.from('{"alg":"HS256","alg":"none"}').toString(
      "base64url"
    )}.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.${"s".repeat(43)}`,
    `${Buffer.from(JSON.stringify({ alg: "HS256" })).toString(
      "base64url"
    )}.${"a".repeat(16_385)}.${"s".repeat(43)}`,
  ]) {
    const value = connection();
    value.room.token = token;
    assert.throws(
      () => parse(value),
      /production_web_shadow_connection_invalid/
    );
  }
});

test("Production web Shadow connection rejects wrong bindings and expiry", () => {
  for (const mutate of [
    (value: ReturnType<typeof connection>) => {
      value.contract_version = value.contract_version.replace(
        "v2",
        "v1"
      ) as never;
    },
    (value: ReturnType<typeof connection>) => {
      value.topology = "preview_shadow";
    },
    (value: ReturnType<typeof connection>) => {
      value.run_id = "a".repeat(64);
    },
    (value: ReturnType<typeof connection>) => {
      value.candidate_git_sha = "a".repeat(40);
    },
    (value: ReturnType<typeof connection>) => {
      value.preview_shadow_configuration_sha256 = "a".repeat(64) as never;
    },
    (value: ReturnType<typeof connection>) => {
      value.selected_candidate_configuration_sha256 = "b".repeat(64) as never;
    },
    (value: ReturnType<typeof connection>) => {
      value.room.roomName = `preview-shadow-${"5".repeat(64)}`;
    },
    (value: ReturnType<typeof connection>) => {
      value.room.url = "wss://other.livekit.cloud" as never;
    },
    (value: ReturnType<typeof connection>) => {
      value.expires_at = "2026-08-21T04:59:59.000Z";
    },
    (value: ReturnType<typeof connection>) => {
      value.expires_at = "2026-08-21T06:00:01.000Z";
    },
  ]) {
    const value = connection();
    mutate(value);
    assert.throws(
      () => parse(value),
      /production_web_shadow_connection_invalid/
    );
  }
});

test("Production web Shadow connection rejects malformed and ambiguous JSON", () => {
  const valid = JSON.stringify(connection());
  const duplicate = valid.replace(
    `"run_id":"${RUN}"`,
    `"run_id":"${RUN}","run_id":"${RUN}"`
  );
  for (const contents of [
    "",
    "null",
    "[]",
    duplicate,
    `${valid} trailing`,
    `\u00a0${valid}`,
    " ".repeat(PRODUCTION_WEB_SHADOW_CONNECTION_MAX_BYTES + 1),
  ]) {
    assert.throws(
      () =>
        parseProductionWebShadowConnectionJson(contents, {
          runId: RUN,
          candidateGitSha: CANDIDATE,
          now: NOW,
        }),
      /production_web_shadow_connection_invalid/
    );
  }

  const extra = connection() as ReturnType<typeof connection> & {
    extra?: true;
  };
  extra.extra = true;
  assert.throws(() => parse(extra), /production_web_shadow_connection_invalid/);
  const missing = connection() as Partial<ReturnType<typeof connection>>;
  delete missing.lease_id;
  assert.throws(
    () => parse(missing),
    /production_web_shadow_connection_invalid/
  );
});

test("Production web Shadow access requires exact server and owner bindings", () => {
  const env = {
    VERCEL: "1",
    VERCEL_ENV: "production",
    VERCEL_TARGET_ENV: "production",
    MEELNI_ENV_PULL_ENVIRONMENT: "production",
    MEELNI_PRODUCTION_WEB_SHADOW_CANARY: "enabled",
    MEELNI_PRODUCTION_WEB_SHADOW_OWNER_USER_ID: OWNER,
    MEELNI_PRODUCTION_WEB_SHADOW_RUN_ID: RUN,
    MEELNI_PRODUCTION_WEB_SHADOW_CANDIDATE_SHA: CANDIDATE,
    MEELNI_PRODUCTION_WEB_SHADOW_EXPIRES_AT: EXPIRY,
  };
  assert.deepEqual(resolveProductionWebShadowCanaryAccess(env, OWNER, NOW), {
    allowed: true,
    runId: RUN,
    candidateGitSha: CANDIDATE,
  });
  for (const [key, value] of [
    ["VERCEL", "0"],
    ["VERCEL_ENV", "preview"],
    ["VERCEL_TARGET_ENV", "staging"],
    ["MEELNI_ENV_PULL_ENVIRONMENT", "preview"],
    ["MEELNI_PRODUCTION_WEB_SHADOW_CANARY", "disabled"],
    ["MEELNI_PRODUCTION_WEB_SHADOW_OWNER_USER_ID", "not-a-uuid"],
    ["MEELNI_PRODUCTION_WEB_SHADOW_RUN_ID", "a"],
    ["MEELNI_PRODUCTION_WEB_SHADOW_CANDIDATE_SHA", "b"],
    ["MEELNI_PRODUCTION_WEB_SHADOW_EXPIRES_AT", "2026-08-21T04:59:59.000Z"],
  ] as const) {
    assert.deepEqual(
      resolveProductionWebShadowCanaryAccess(
        { ...env, [key]: value },
        OWNER,
        NOW
      ),
      { allowed: false }
    );
  }
  assert.deepEqual(resolveProductionWebShadowCanaryAccess(env, null, NOW), {
    allowed: false,
  });
  assert.deepEqual(
    resolveProductionWebShadowCanaryAccess(
      env,
      "123e4567-e89b-42d3-a456-426614174001",
      NOW
    ),
    { allowed: false }
  );
  assert.deepEqual(
    resolveProductionWebShadowCanaryAccess(
      {
        ...env,
        MEELNI_PRODUCTION_WEB_SHADOW_EXPIRES_AT: "2026-08-21T06:00:01.000Z",
      },
      OWNER,
      NOW
    ),
    { allowed: false }
  );
});
