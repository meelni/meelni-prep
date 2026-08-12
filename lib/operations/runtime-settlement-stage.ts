import type { LiveKitInterviewTargetSource } from "@meelni/integrations";

export const RUNTIME_SETTLEMENT_STAGES = [
  "target_resolution",
  "generation_recheck",
  "packet_send",
  "durable_ack",
] as const;
export type RuntimeSettlementStage = (typeof RUNTIME_SETTLEMENT_STAGES)[number];

export const RUNTIME_SETTLEMENT_STAGE_REASONS = [
  "participant_exact",
  "dispatch_exact",
  "agent_absent",
  "agent_ambiguous",
  "agent_projection_invalid",
  "agent_name_conflict",
  "dispatch_absent",
  "dispatch_pending",
  "dispatch_ambiguous",
  "dispatch_projection_invalid",
  "provider_unavailable",
  "generation_current",
  "generation_replaced",
  "generation_already_settled",
  "packet_sent",
  "packet_send_failed",
  "ack_settled",
  "ack_degraded",
  "ack_missing",
] as const;
export type RuntimeSettlementStageReason =
  (typeof RUNTIME_SETTLEMENT_STAGE_REASONS)[number];

export type RuntimeSettlementStageOutcome = "succeeded" | "deferred" | "failed";

export interface RuntimeSettlementStageEvent {
  event: "meelni_runtime_settlement_stage";
  version: 1;
  occurredAt: string;
  stage: RuntimeSettlementStage;
  targetSource: LiveKitInterviewTargetSource;
  outcome: RuntimeSettlementStageOutcome;
  reason: RuntimeSettlementStageReason;
  durationMs: number;
  release: string | null;
}

const STAGE_SET = new Set<string>(RUNTIME_SETTLEMENT_STAGES);
const SOURCE_SET = new Set<string>(["participant", "dispatch", "none"]);
const OUTCOME_SET = new Set<string>(["succeeded", "deferred", "failed"]);
const REASON_SET = new Set<string>(RUNTIME_SETTLEMENT_STAGE_REASONS);
const RELEASE_PATTERN = /^[0-9a-f]{7,40}$/i;

/** Fixed, identity-free telemetry for the trusted settlement control path. */
export function reportRuntimeSettlementStage(
  input: {
    stage: RuntimeSettlementStage;
    targetSource: LiveKitInterviewTargetSource;
    outcome: RuntimeSettlementStageOutcome;
    reason: RuntimeSettlementStageReason;
    durationMs: number;
  },
  deps: {
    now?: () => Date;
    env?: Readonly<Record<string, string | undefined>>;
    write?: (serialized: string) => void;
  } = {}
): RuntimeSettlementStageEvent | null {
  if (
    !STAGE_SET.has(input.stage) ||
    !SOURCE_SET.has(input.targetSource) ||
    !OUTCOME_SET.has(input.outcome) ||
    !REASON_SET.has(input.reason) ||
    !Number.isFinite(input.durationMs) ||
    input.durationMs < 0
  ) {
    return null;
  }
  const now = deps.now?.() ?? new Date();
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) return null;
  const env = deps.env ?? process.env;
  const rawRelease = env.VERCEL_GIT_COMMIT_SHA ?? env.GIT_COMMIT_SHA;
  const event: RuntimeSettlementStageEvent = {
    event: "meelni_runtime_settlement_stage",
    version: 1,
    occurredAt: now.toISOString(),
    stage: input.stage,
    targetSource: input.targetSource,
    outcome: input.outcome,
    reason: input.reason,
    durationMs: Math.round(input.durationMs),
    release: rawRelease && RELEASE_PATTERN.test(rawRelease) ? rawRelease : null,
  };
  try {
    (deps.write ?? console.info)(JSON.stringify(event));
  } catch {
    return null;
  }
  return event;
}
