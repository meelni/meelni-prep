export const DELEGATED_AGENT_AUTHORIZATION_CONTRACT =
  "meelni.delegated-agent-authorization.v1";

export const DELEGATED_AGENT_ID = "codex";
export const DELEGATED_AGENT_AUTHORIZATION_MAX_TTL_MS = 4 * 60 * 60 * 1_000;
export const DELEGATED_AGENT_AUTHORIZATION_MAX_SPEND_NANO_USD = 3_000_000_000;

const ARTIFACT_KEYS = ["contract", "payload"] as const;
const PAYLOAD_KEYS = [
  "actionClass",
  "authorizationId",
  "authorizedBy",
  "authorizedVia",
  "customerTranscriptsAllowed",
  "delegatedTo",
  "expiresAt",
  "issuedAt",
  "launchDecision",
  "maximumPhysicalHttpAttempts",
  "maximumProviderCalls",
  "maximumSpendNanoUsd",
  "productionDataAllowed",
  "reviewedSourcePolicy",
  "scope",
] as const;
const AUTHORIZATION_ID = /^sav[0-9]+_delegated_agent_[0-9a-f]{32}$/;

export type DelegatedAgentActionClass =
  | "repo_only_guardrail_repair"
  | "synthetic_calibration_retry";

export interface DelegatedAgentAuthorizationPayload {
  authorizationId: string;
  authorizedBy: "human_product_owner_chat_delegation";
  authorizedVia: "codex_thread";
  delegatedTo: typeof DELEGATED_AGENT_ID;
  actionClass: DelegatedAgentActionClass;
  scope: string;
  reviewedSourcePolicy:
    | "exact_commit_required"
    | "merged_repo_only_guardrail_repairs_allowed";
  maximumProviderCalls: number;
  maximumPhysicalHttpAttempts: number;
  maximumSpendNanoUsd: number;
  customerTranscriptsAllowed: false;
  productionDataAllowed: false;
  launchDecision: null;
  issuedAt: string;
  expiresAt: string;
}

export interface DelegatedAgentAuthorizationArtifact {
  contract: typeof DELEGATED_AGENT_AUTHORIZATION_CONTRACT;
  payload: DelegatedAgentAuthorizationPayload;
}

export interface VerifiedDelegatedAgentAuthorization {
  readonly authorizationId: string;
  readonly delegatedTo: typeof DELEGATED_AGENT_ID;
  readonly actionClass: DelegatedAgentActionClass;
  readonly scope: string;
  readonly reviewedSourcePolicy:
    | "exact_commit_required"
    | "merged_repo_only_guardrail_repairs_allowed";
  readonly maximumProviderCalls: number;
  readonly maximumPhysicalHttpAttempts: number;
  readonly maximumSpendNanoUsd: number;
  readonly expiresAt: string;
}

export function verifyDelegatedAgentAuthorization(input: {
  artifact: unknown;
  now?: Date;
}): VerifiedDelegatedAgentAuthorization {
  const now = input.now ?? new Date();
  if (!Number.isFinite(now.getTime())) {
    throw new Error("delegated_agent_authorization_clock_invalid");
  }
  const artifact = parseDelegatedAgentAuthorizationArtifact(input.artifact);
  const payload = artifact.payload;

  if (!AUTHORIZATION_ID.test(payload.authorizationId)) {
    throw new Error("delegated_agent_authorization_id_invalid");
  }
  if (
    payload.authorizedBy !== "human_product_owner_chat_delegation" ||
    payload.authorizedVia !== "codex_thread" ||
    payload.delegatedTo !== DELEGATED_AGENT_ID
  ) {
    throw new Error("delegated_agent_authorization_provenance_invalid");
  }
  if (
    payload.actionClass !== "repo_only_guardrail_repair" &&
    payload.actionClass !== "synthetic_calibration_retry"
  ) {
    throw new Error("delegated_agent_authorization_action_invalid");
  }
  if (
    typeof payload.scope !== "string" ||
    payload.scope.length < 8 ||
    payload.scope.length > 240
  ) {
    throw new Error("delegated_agent_authorization_scope_invalid");
  }
  if (
    payload.reviewedSourcePolicy !== "exact_commit_required" &&
    payload.reviewedSourcePolicy !==
      "merged_repo_only_guardrail_repairs_allowed"
  ) {
    throw new Error("delegated_agent_authorization_source_policy_invalid");
  }
  if (
    !Number.isSafeInteger(payload.maximumProviderCalls) ||
    payload.maximumProviderCalls < 0 ||
    payload.maximumProviderCalls > 96 ||
    !Number.isSafeInteger(payload.maximumPhysicalHttpAttempts) ||
    payload.maximumPhysicalHttpAttempts < payload.maximumProviderCalls ||
    payload.maximumPhysicalHttpAttempts > 96 ||
    !Number.isSafeInteger(payload.maximumSpendNanoUsd) ||
    payload.maximumSpendNanoUsd < 0 ||
    payload.maximumSpendNanoUsd >
      DELEGATED_AGENT_AUTHORIZATION_MAX_SPEND_NANO_USD
  ) {
    throw new Error("delegated_agent_authorization_budget_invalid");
  }
  if (
    payload.customerTranscriptsAllowed !== false ||
    payload.productionDataAllowed !== false ||
    payload.launchDecision !== null
  ) {
    throw new Error("delegated_agent_authorization_scope_forbidden");
  }

  const issuedAt = parseTimestamp(
    payload.issuedAt,
    "delegated_agent_authorization_issued_at_invalid"
  );
  const expiresAt = parseTimestamp(
    payload.expiresAt,
    "delegated_agent_authorization_expires_at_invalid"
  );
  if (issuedAt.getTime() > now.getTime()) {
    throw new Error("delegated_agent_authorization_not_yet_valid");
  }
  if (expiresAt.getTime() <= now.getTime()) {
    throw new Error("delegated_agent_authorization_expired");
  }
  if (
    expiresAt.getTime() <= issuedAt.getTime() ||
    expiresAt.getTime() - issuedAt.getTime() >
      DELEGATED_AGENT_AUTHORIZATION_MAX_TTL_MS
  ) {
    throw new Error("delegated_agent_authorization_ttl_invalid");
  }

  return Object.freeze({
    authorizationId: payload.authorizationId,
    delegatedTo: payload.delegatedTo,
    actionClass: payload.actionClass,
    scope: payload.scope,
    reviewedSourcePolicy: payload.reviewedSourcePolicy,
    maximumProviderCalls: payload.maximumProviderCalls,
    maximumPhysicalHttpAttempts: payload.maximumPhysicalHttpAttempts,
    maximumSpendNanoUsd: payload.maximumSpendNanoUsd,
    expiresAt: payload.expiresAt,
  });
}

function parseDelegatedAgentAuthorizationArtifact(
  value: unknown
): DelegatedAgentAuthorizationArtifact {
  assertPlainObject(value, "delegated_agent_authorization_artifact_invalid");
  assertExactKeys(value, ARTIFACT_KEYS);
  if (value.contract !== DELEGATED_AGENT_AUTHORIZATION_CONTRACT) {
    throw new Error("delegated_agent_authorization_contract_invalid");
  }
  assertPlainObject(
    value.payload,
    "delegated_agent_authorization_payload_invalid"
  );
  assertExactKeys(value.payload, PAYLOAD_KEYS);
  return value as unknown as DelegatedAgentAuthorizationArtifact;
}

function parseTimestamp(value: unknown, code: string): Date {
  if (typeof value !== "string") throw new Error(code);
  const parsed = new Date(value);
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString() !== value ||
    parsed.getUTCMilliseconds() !== 0
  ) {
    throw new Error(code);
  }
  return parsed;
}

function assertPlainObject(
  value: unknown,
  code: string
): asserts value is Record<string, unknown> {
  if (
    !value ||
    typeof value !== "object" ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    throw new Error(code);
  }
}

function assertExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[]
): void {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (
    actual.length !== wanted.length ||
    actual.some((key, index) => key !== wanted[index])
  ) {
    throw new Error("delegated_agent_authorization_unknown_or_missing_field");
  }
}
