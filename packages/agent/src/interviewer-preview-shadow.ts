import { createHash } from "node:crypto";

export const ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_RUNTIME_CONFIG_VERSION =
  "adaptive-interviewer-preview-shadow-runtime-config.v1" as const;
export const ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_MATRIX_VERSION =
  "adaptive-interviewer-preview-shadow-rehearsal-matrix.v1" as const;
export const ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_OWNER_REQUEST_VERSION =
  "adaptive-interviewer-preview-shadow-owner-request.v1" as const;
export const ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_AUTHORIZATION_VERSION =
  "adaptive-interviewer-preview-shadow-authorization.v1" as const;
export const ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_AUTHORIZATION_DIGEST_VERSION =
  "adaptive-interviewer-preview-shadow-authorization-digest.v1" as const;
export const ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_ACTIVATION_RECEIPT_VERSION =
  "adaptive-interviewer-preview-shadow-activation-receipt.v1" as const;

export const ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_SELECTED_CANDIDATE_SHA256 =
  "b8cc8547c6d2573b7d323b3327ab31bf74c237a1486c13e0e7780a63880e25ac" as const;
export const ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_OWNER_DIRECTION_REFERENCE =
  "linear:SAV-476:comment:fe76af4b-9a83-4899-b38e-db985e1f3c84" as const;
export const ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_MAX_TTL_MS =
  24 * 60 * 60 * 1_000;

export const ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_RUNTIME_CONFIG =
  /* @__PURE__ */ deepFreeze({
    contract_version:
      ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_RUNTIME_CONFIG_VERSION,
    stage: "preview_shadow",
    target_environment: "preview_staging",
    target_cohort: "shadow",
    exposure: "none",
    flags: {
      brief_v2: true,
      controller_v1: true,
      tools_v1: true,
      director_shadow_v1: true,
      director_influence_v1: false,
    },
    director: {
      adapter_id: "meelni_director_openai_responses",
      adapter_version: "interview-director-adapter.openai-responses.v1",
      provider: "openai-api",
      model: "gpt-5.4-mini-2026-03-17",
      endpoint_mode: "direct_responses",
      base_url: "https://api.openai.com/v1/",
      sdk: "openai-python",
      sdk_version: "3.3.1",
      store: false,
      provider_tools: false,
      retries: 0,
    },
    limits: {
      maximum_sessions: 25,
      maximum_spend_nano_usd: 25_000_000_000,
      maximum_cumulative_spend_nano_usd: 10_000_000_000,
      maximum_session_lease_nano_usd: 1_000_000_000,
      maximum_attempts_per_session: 10,
      maximum_attempt_reservation_nano_usd: 100_000_000,
      maximum_settle_shutdown_ms: 250,
    },
    privacy_and_retention: {
      policy_version: "adaptive-interviewer-preview-privacy.v1",
      policy_accepted: true,
      data_scope: "synthetic_owner_rehearsal_only",
      customer_data_allowed: false,
      provider_training_allowed: false,
      provider_policy_reference: "openai-api-data-controls-2026-08-19",
      maximum_provider_payload_retention_days: 30,
      maximum_transcript_retention_days: 7,
      maximum_raw_audio_retention_days: 0,
    },
    entry_thresholds: {
      minimum_completed_sessions: 20,
      minimum_quality_score_bps: 7_708,
      maximum_first_audio_p50_ms: 1_200,
      maximum_first_audio_p95_ms: 2_500,
      minimum_completion_rate_bps: 9_500,
      maximum_fallback_rate_bps: 500,
      maximum_tool_failure_rate_bps: 200,
      maximum_recommendation_age_ms: 3_000,
      minimum_recommendation_freshness_rate_bps: 9_500,
      minimum_interruption_recovery_rate_bps: 9_000,
      minimum_feedback_integrity_rate_bps: 10_000,
    },
    stop_thresholds: {
      maximum_cumulative_spend_nano_usd: 10_000_000_000,
      minimum_quality_score_bps: 7_008,
      maximum_first_audio_p50_ms: 1_800,
      maximum_first_audio_p95_ms: 3_450,
      minimum_completion_rate_bps: 9_000,
      maximum_fallback_rate_bps: 1_000,
      maximum_tool_failure_rate_bps: 500,
      maximum_recommendation_age_ms: 5_000,
      minimum_recommendation_freshness_rate_bps: 8_000,
      minimum_interruption_recovery_rate_bps: 8_000,
      minimum_feedback_integrity_rate_bps: 10_000,
    },
    non_tunable_hard_stops: {
      evidence_digest_drift: true,
      version_pin_mismatch: true,
      unauthorized_stage_or_cohort: true,
      deterministic_invariant_regression: true,
      any_session_or_transcript_loss: true,
      kill_switch_failure: true,
    },
    rehearsal_matrix: {
      contract_version: ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_MATRIX_VERSION,
      rounds: ["behavioral", "product_sense", "execution", "strategy"],
      voice_conditions: [
        "baseline_final_turn",
        "barge_in_interruption",
        "rapid_double_interruption",
        "long_silence_then_resume",
        "speculative_to_final_revision",
        "disconnect_reconnect_generation",
        "shutdown_with_inflight_attempt",
      ],
      coverage_rule: "cartesian_all_rounds_x_voice_conditions",
      required_case_count: 28,
      live_status: "unperformed",
    },
  } as const);

export type AdaptiveInterviewerPreviewShadowRuntimeConfig =
  typeof ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_RUNTIME_CONFIG;

export function adaptiveInterviewerPreviewShadowConfigurationSha256(
  value: unknown = ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_RUNTIME_CONFIG
): string {
  const config = parseAdaptiveInterviewerPreviewShadowRuntimeConfig(value);
  return createHash("sha256")
    .update(
      `${ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_RUNTIME_CONFIG_VERSION}\0${JSON.stringify(config)}`
    )
    .digest("hex");
}

export const ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_CONFIGURATION_SHA256 =
  "c6db8b06428fde9a7ffb13d78641e66efc584203c7862db93de42a9d9d64d89c" as const;

export function parseAdaptiveInterviewerPreviewShadowRuntimeConfig(
  value: unknown
): AdaptiveInterviewerPreviewShadowRuntimeConfig {
  assertExactValue(
    value,
    ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_RUNTIME_CONFIG,
    invalidConfig
  );
  return ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_RUNTIME_CONFIG;
}

export interface AdaptiveInterviewerPreviewShadowOwnerRequest {
  contract_version: typeof ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_OWNER_REQUEST_VERSION;
  authorization_contract_version: typeof ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_AUTHORIZATION_VERSION;
  requested_authority: "execute_bounded_preview_shadow_only";
  current_stage: "synthetic";
  target_stage: "preview_shadow";
  target_environment: "preview_staging";
  target_cohort: "shadow";
  exposure: "none";
  candidate_git_sha: string;
  preview_shadow_configuration: AdaptiveInterviewerPreviewShadowRuntimeConfig;
  preview_shadow_configuration_sha256: string;
  selected_candidate_configuration_sha256: typeof ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_SELECTED_CANDIDATE_SHA256;
  owner_direction_reference: typeof ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_OWNER_DIRECTION_REFERENCE;
  owner_decision: "pending_exact_merged_sha_authorization";
  owner_decision_reference: null;
  owner_decided_at: null;
  authorization_expires_at: null;
  authorization_nonce: null;
  one_time_execution: true;
  maximum_consumptions: 1;
  preview_shadow_execution_authorized: false;
  preview_influence_authorized: false;
  later_stage_authorized: false;
  production_authorized: false;
  default_on_authorized: false;
  launch_go_no_go_authorized: false;
  system_recommendation: "await_exact_merged_sha_owner_authorization";
}

export interface AdaptiveInterviewerPreviewShadowAuthorization {
  contract_version: typeof ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_AUTHORIZATION_VERSION;
  requested_authority: "execute_bounded_preview_shadow_only";
  current_stage: "synthetic";
  target_stage: "preview_shadow";
  target_environment: "preview_staging";
  target_cohort: "shadow";
  exposure: "none";
  candidate_git_sha: string;
  preview_shadow_configuration: AdaptiveInterviewerPreviewShadowRuntimeConfig;
  preview_shadow_configuration_sha256: string;
  selected_candidate_configuration_sha256: typeof ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_SELECTED_CANDIDATE_SHA256;
  owner_direction_reference: typeof ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_OWNER_DIRECTION_REFERENCE;
  owner_decision: "approved";
  owner_decision_reference: string;
  owner_decided_at: string;
  authorization_expires_at: string;
  authorization_nonce: string;
  one_time_execution: true;
  maximum_consumptions: 1;
  preview_shadow_execution_authorized: true;
  preview_influence_authorized: false;
  later_stage_authorized: false;
  production_authorized: false;
  default_on_authorized: false;
  launch_go_no_go_authorized: false;
}

const REQUEST_KEYS = [
  "contract_version",
  "authorization_contract_version",
  "requested_authority",
  "current_stage",
  "target_stage",
  "target_environment",
  "target_cohort",
  "exposure",
  "candidate_git_sha",
  "preview_shadow_configuration",
  "preview_shadow_configuration_sha256",
  "selected_candidate_configuration_sha256",
  "owner_direction_reference",
  "owner_decision",
  "owner_decision_reference",
  "owner_decided_at",
  "authorization_expires_at",
  "authorization_nonce",
  "one_time_execution",
  "maximum_consumptions",
  "preview_shadow_execution_authorized",
  "preview_influence_authorized",
  "later_stage_authorized",
  "production_authorized",
  "default_on_authorized",
  "launch_go_no_go_authorized",
  "system_recommendation",
] as const;

const AUTHORIZATION_KEYS = /* @__PURE__ */ REQUEST_KEYS.filter(
  (key) =>
    key !== "authorization_contract_version" && key !== "system_recommendation"
);

export function createAdaptiveInterviewerPreviewShadowOwnerRequest(input: {
  candidateGitSha: string;
}): AdaptiveInterviewerPreviewShadowOwnerRequest {
  const request = exactRecord(input, ["candidateGitSha"], invalidBinding);
  if (!isGitSha(request.candidateGitSha)) invalidBinding();
  return deepFreeze({
    contract_version: ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_OWNER_REQUEST_VERSION,
    authorization_contract_version:
      ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_AUTHORIZATION_VERSION,
    requested_authority: "execute_bounded_preview_shadow_only",
    current_stage: "synthetic",
    target_stage: "preview_shadow",
    target_environment: "preview_staging",
    target_cohort: "shadow",
    exposure: "none",
    candidate_git_sha: request.candidateGitSha,
    preview_shadow_configuration:
      ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_RUNTIME_CONFIG,
    preview_shadow_configuration_sha256:
      ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_CONFIGURATION_SHA256,
    selected_candidate_configuration_sha256:
      ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_SELECTED_CANDIDATE_SHA256,
    owner_direction_reference:
      ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_OWNER_DIRECTION_REFERENCE,
    owner_decision: "pending_exact_merged_sha_authorization",
    owner_decision_reference: null,
    owner_decided_at: null,
    authorization_expires_at: null,
    authorization_nonce: null,
    one_time_execution: true,
    maximum_consumptions: 1,
    preview_shadow_execution_authorized: false,
    preview_influence_authorized: false,
    later_stage_authorized: false,
    production_authorized: false,
    default_on_authorized: false,
    launch_go_no_go_authorized: false,
    system_recommendation: "await_exact_merged_sha_owner_authorization",
  } as const);
}

export function parseAdaptiveInterviewerPreviewShadowAuthorizationJson(
  contents: string,
  expected: PreviewShadowAuthorizationBindings,
  now: Date
): AdaptiveInterviewerPreviewShadowAuthorization {
  let value: unknown;
  try {
    if (
      typeof contents !== "string" ||
      contents.length > 64 * 1_024 ||
      Buffer.byteLength(contents, "utf8") > 64 * 1_024
    ) {
      throw new Error("json_size_invalid");
    }
    value = parseJsonRejectingDuplicateKeys(contents);
  } catch {
    throw new Error(
      "adaptive_interviewer_preview_shadow_authorization_json_invalid"
    );
  }
  return parseAdaptiveInterviewerPreviewShadowAuthorization(
    value,
    expected,
    now
  );
}

export interface PreviewShadowAuthorizationBindings {
  candidateGitSha: string;
  previewShadowConfigurationSha256: string;
  selectedCandidateConfigurationSha256: string;
}

/** Validates closed shape and bindings; the caller authenticates the owner ref. */
export function parseAdaptiveInterviewerPreviewShadowAuthorization(
  value: unknown,
  expected: PreviewShadowAuthorizationBindings,
  now: Date
): AdaptiveInterviewerPreviewShadowAuthorization {
  const currentTime = snapshotWholeSecondDate(now, invalidAuthorization);
  const bindings = exactRecord(
    expected,
    [
      "candidateGitSha",
      "previewShadowConfigurationSha256",
      "selectedCandidateConfigurationSha256",
    ],
    invalidBinding
  );
  if (
    !isGitSha(bindings.candidateGitSha) ||
    !isSha256(bindings.previewShadowConfigurationSha256) ||
    !isSha256(bindings.selectedCandidateConfigurationSha256)
  ) {
    invalidBinding();
  }
  const record = exactRecord(value, AUTHORIZATION_KEYS, invalidAuthorization);
  if (
    record.contract_version !==
      ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_AUTHORIZATION_VERSION ||
    record.requested_authority !== "execute_bounded_preview_shadow_only" ||
    record.current_stage !== "synthetic" ||
    record.target_stage !== "preview_shadow" ||
    record.target_environment !== "preview_staging" ||
    record.target_cohort !== "shadow" ||
    record.exposure !== "none" ||
    record.owner_direction_reference !==
      ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_OWNER_DIRECTION_REFERENCE ||
    record.owner_decision !== "approved" ||
    record.one_time_execution !== true ||
    record.maximum_consumptions !== 1 ||
    record.preview_shadow_execution_authorized !== true ||
    record.preview_influence_authorized !== false ||
    record.later_stage_authorized !== false ||
    record.production_authorized !== false ||
    record.default_on_authorized !== false ||
    record.launch_go_no_go_authorized !== false
  ) {
    invalidAuthorization();
  }
  if (
    record.candidate_git_sha !== bindings.candidateGitSha ||
    record.preview_shadow_configuration_sha256 !==
      bindings.previewShadowConfigurationSha256 ||
    record.preview_shadow_configuration_sha256 !==
      ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_CONFIGURATION_SHA256 ||
    record.selected_candidate_configuration_sha256 !==
      bindings.selectedCandidateConfigurationSha256 ||
    record.selected_candidate_configuration_sha256 !==
      ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_SELECTED_CANDIDATE_SHA256
  ) {
    invalidBinding();
  }
  const config = parseAdaptiveInterviewerPreviewShadowRuntimeConfig(
    record.preview_shadow_configuration
  );
  const decidedAt = wholeSecondTimestamp(record.owner_decided_at);
  const expiresAt = wholeSecondTimestamp(record.authorization_expires_at);
  if (
    decidedAt.getTime() > currentTime.getTime() ||
    expiresAt.getTime() <= currentTime.getTime() ||
    expiresAt.getTime() <= decidedAt.getTime() ||
    expiresAt.getTime() - decidedAt.getTime() >
      ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_MAX_TTL_MS ||
    !isDecisionReference(record.owner_decision_reference) ||
    !isAuthorizationNonce(record.authorization_nonce)
  ) {
    invalidAuthorization();
  }

  return deepFreeze({
    contract_version: ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_AUTHORIZATION_VERSION,
    requested_authority: "execute_bounded_preview_shadow_only",
    current_stage: "synthetic",
    target_stage: "preview_shadow",
    target_environment: "preview_staging",
    target_cohort: "shadow",
    exposure: "none",
    candidate_git_sha: bindings.candidateGitSha,
    preview_shadow_configuration: config,
    preview_shadow_configuration_sha256:
      ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_CONFIGURATION_SHA256,
    selected_candidate_configuration_sha256:
      ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_SELECTED_CANDIDATE_SHA256,
    owner_direction_reference:
      ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_OWNER_DIRECTION_REFERENCE,
    owner_decision: "approved",
    owner_decision_reference: record.owner_decision_reference,
    owner_decided_at: record.owner_decided_at,
    authorization_expires_at: record.authorization_expires_at,
    authorization_nonce: record.authorization_nonce,
    one_time_execution: true,
    maximum_consumptions: 1,
    preview_shadow_execution_authorized: true,
    preview_influence_authorized: false,
    later_stage_authorized: false,
    production_authorized: false,
    default_on_authorized: false,
    launch_go_no_go_authorized: false,
  } as AdaptiveInterviewerPreviewShadowAuthorization);
}

export function adaptiveInterviewerPreviewShadowAuthorizationId(
  value: AdaptiveInterviewerPreviewShadowAuthorization
): string {
  const record = exactRecord(value, AUTHORIZATION_KEYS, invalidAuthorization);
  const canonical = Object.fromEntries(
    AUTHORIZATION_KEYS.map((key) => [
      key,
      key === "preview_shadow_configuration"
        ? parseAdaptiveInterviewerPreviewShadowRuntimeConfig(record[key])
        : record[key],
    ])
  );
  return createHash("sha256")
    .update(
      `${ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_AUTHORIZATION_DIGEST_VERSION}\0${JSON.stringify(canonical)}`
    )
    .digest("hex");
}

function assertExactValue(
  value: unknown,
  expected: unknown,
  invalid: () => never
): void {
  if (
    expected === null ||
    typeof expected === "string" ||
    typeof expected === "boolean" ||
    typeof expected === "number"
  ) {
    if (!Object.is(value, expected)) invalid();
    return;
  }
  if (Array.isArray(expected)) {
    const snapshot = exactArray(value, expected.length, invalid);
    expected.forEach((item, index) =>
      assertExactValue(snapshot[index], item, invalid)
    );
    return;
  }
  const record = exactRecord(
    value,
    Object.keys(expected as Record<string, unknown>),
    invalid
  );
  for (const [key, item] of Object.entries(
    expected as Record<string, unknown>
  )) {
    assertExactValue(record[key], item, invalid);
  }
}

function exactRecord(
  value: unknown,
  expectedKeys: readonly string[],
  invalid: () => never
): Record<string, unknown> {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    invalid();
  }
  const record = value as Record<string, unknown>;
  const keys = Reflect.ownKeys(record);
  if (keys.some((key) => typeof key !== "string")) invalid();
  const actual = (keys as string[]).sort();
  const expected = [...expectedKeys].sort();
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  ) {
    invalid();
  }
  const snapshot: Record<string, unknown> = {};
  for (const key of actual) {
    const descriptor = Object.getOwnPropertyDescriptor(record, key);
    if (
      descriptor === undefined ||
      descriptor.enumerable !== true ||
      !("value" in descriptor)
    ) {
      invalid();
    }
    snapshot[key] = descriptor.value;
  }
  return snapshot;
}

function exactArray(
  value: unknown,
  expectedLength: number,
  invalid: () => never
): unknown[] {
  if (
    !Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Array.prototype
  ) {
    invalid();
  }
  const keys = Reflect.ownKeys(value);
  const expectedKeys = [
    ...Array.from({ length: expectedLength }, (_, index) => String(index)),
    "length",
  ];
  if (
    keys.some((key) => typeof key !== "string") ||
    keys.length !== expectedKeys.length ||
    !(keys as string[]).every((key) => expectedKeys.includes(key))
  ) {
    invalid();
  }
  const snapshot: unknown[] = [];
  for (let index = 0; index < expectedLength; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (
      descriptor === undefined ||
      descriptor.enumerable !== true ||
      !("value" in descriptor)
    ) {
      invalid();
    }
    snapshot.push(descriptor.value);
  }
  const lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
  if (
    lengthDescriptor === undefined ||
    lengthDescriptor.enumerable !== false ||
    !("value" in lengthDescriptor) ||
    lengthDescriptor.value !== expectedLength
  ) {
    invalid();
  }
  return snapshot;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const nested of Object.values(value as Record<string, unknown>)) {
      deepFreeze(nested);
    }
    Object.freeze(value);
  }
  return value;
}

function snapshotWholeSecondDate(
  value: unknown,
  invalid: () => never
): Date {
  if (
    value === null ||
    typeof value !== "object" ||
    Object.getPrototypeOf(value) !== Date.prototype ||
    Reflect.ownKeys(value).length !== 0
  ) {
    invalid();
  }
  let timestamp: number;
  try {
    timestamp = Date.prototype.getTime.call(value);
  } catch {
    invalid();
  }
  if (!Number.isFinite(timestamp) || timestamp % 1_000 !== 0) invalid();
  return new Date(timestamp);
}

function wholeSecondTimestamp(value: unknown): Date {
  if (typeof value !== "string") invalidAuthorization();
  const parsed = new Date(value);
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString() !== value ||
    parsed.getUTCMilliseconds() !== 0
  ) {
    invalidAuthorization();
  }
  return parsed;
}

function isGitSha(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{40}$/.test(value);
}

function isSha256(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
}

function isDecisionReference(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= 200 &&
    /^[A-Za-z0-9][A-Za-z0-9._:/#-]*$/.test(value)
  );
}

function isAuthorizationNonce(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
}

function invalidConfig(): never {
  throw new Error("adaptive_interviewer_preview_shadow_config_invalid");
}

function invalidAuthorization(): never {
  throw new Error("adaptive_interviewer_preview_shadow_authorization_invalid");
}

function invalidBinding(): never {
  throw new Error(
    "adaptive_interviewer_preview_shadow_authorization_binding_mismatch"
  );
}

function parseJsonRejectingDuplicateKeys(contents: string): unknown {
  let offset = 0;
  const whitespace = () => {
    while (/[ \t\r\n]/.test(contents[offset] ?? "")) offset += 1;
  };
  const value = (depth = 0): unknown => {
    if (depth > 32) {
      throw new Error("json_depth_invalid");
    }
    whitespace();
    const character = contents[offset];
    if (character === "{") return object(depth);
    if (character === "[") return array(depth);
    if (character === '"') return string();
    for (const [literal, parsed] of [
      ["true", true],
      ["false", false],
      ["null", null],
    ] as const) {
      if (contents.startsWith(literal, offset)) {
        offset += literal.length;
        return parsed;
      }
    }
    const match = contents
      .slice(offset)
      .match(/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/);
    if (!match) throw new Error("json_invalid");
    offset += match[0].length;
    return Number(match[0]);
  };
  const object = (depth: number): Record<string, unknown> => {
    offset += 1;
    whitespace();
    const entries: [string, unknown][] = [];
    const keys = new Set<string>();
    if (contents[offset] === "}") {
      offset += 1;
      return {};
    }
    while (true) {
      whitespace();
      if (contents[offset] !== '"') throw new Error("json_invalid");
      const key = string();
      if (keys.has(key)) throw new Error("json_duplicate_key");
      keys.add(key);
      whitespace();
      if (contents[offset] !== ":") throw new Error("json_invalid");
      offset += 1;
      entries.push([key, value(depth + 1)]);
      whitespace();
      if (contents[offset] === "}") {
        offset += 1;
        return Object.fromEntries(entries);
      }
      if (contents[offset] !== ",") throw new Error("json_invalid");
      offset += 1;
    }
  };
  const array = (depth: number): unknown[] => {
    offset += 1;
    whitespace();
    const values: unknown[] = [];
    if (contents[offset] === "]") {
      offset += 1;
      return values;
    }
    while (true) {
      values.push(value(depth + 1));
      whitespace();
      if (contents[offset] === "]") {
        offset += 1;
        return values;
      }
      if (contents[offset] !== ",") throw new Error("json_invalid");
      offset += 1;
    }
  };
  const string = (): string => {
    const start = offset;
    offset += 1;
    while (offset < contents.length) {
      const character = contents[offset];
      if (character === '"') {
        offset += 1;
        return JSON.parse(contents.slice(start, offset)) as string;
      }
      if (character === "\\") {
        offset += 1;
        const escape = contents[offset];
        if (escape === "u") {
          const hex = contents.slice(offset + 1, offset + 5);
          if (!/^[0-9a-fA-F]{4}$/.test(hex)) throw new Error("json_invalid");
          offset += 5;
          continue;
        }
        if (!escape || !'"\\/bfnrt'.includes(escape)) {
          throw new Error("json_invalid");
        }
        offset += 1;
        continue;
      }
      if (!character || character.charCodeAt(0) < 0x20) {
        throw new Error("json_invalid");
      }
      offset += 1;
    }
    throw new Error("json_invalid");
  };

  const result = value();
  whitespace();
  if (offset !== contents.length) throw new Error("json_invalid");
  return result;
}
