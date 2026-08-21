import {
  ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_CONFIGURATION_SHA256,
  ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_SELECTED_CANDIDATE_SHA256,
} from "@meelni/agent";

import type { DurablePreviewShadowControlPlaneWorkflow } from "@/lib/workflows/adaptive-interviewer-preview-shadow-control-plane";
import type { DurablePreviewShadowRun } from "@/lib/db/adaptive-interviewer-preview-shadow-control-plane";
import type { PreviewShadowActivationContext } from "@/lib/security/adaptive-interviewer-preview-shadow-owner-decision";

export const PREVIEW_SHADOW_ACTIVATION_REQUEST_VERSION =
  "adaptive-interviewer-preview-shadow-activation-request.v1" as const;
export const PREVIEW_SHADOW_ACTIVATION_RECEIPT_VERSION =
  "adaptive-interviewer-preview-shadow-operator-activation.v1" as const;

const GIT_SHA = /^[0-9a-f]{40}$/;

export interface PreviewShadowActivationReceipt {
  contract_version: typeof PREVIEW_SHADOW_ACTIVATION_RECEIPT_VERSION;
  outcome: "activated" | "replayed";
  run: DurablePreviewShadowRun;
}

export function createPreviewShadowActivationContext(
  candidateGitSha: string
): PreviewShadowActivationContext {
  if (!GIT_SHA.test(candidateGitSha)) invalid();
  return Object.freeze({
    candidateGitSha,
    previewShadowConfigurationSha256:
      ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_CONFIGURATION_SHA256,
    selectedCandidateConfigurationSha256:
      ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_SELECTED_CANDIDATE_SHA256,
    targetStage: "preview_shadow" as const,
    targetEnvironment: "preview_staging" as const,
    targetCohort: "shadow" as const,
    exposure: "none" as const,
  });
}

export function isPreviewShadowActivationRequest(candidate: unknown): boolean {
  try {
    if (
      candidate === null ||
      typeof candidate !== "object" ||
      Array.isArray(candidate) ||
      Object.getPrototypeOf(candidate) !== Object.prototype
    ) {
      return false;
    }
    const descriptor = Object.getOwnPropertyDescriptor(
      candidate,
      "contract_version"
    );
    return (
      descriptor?.enumerable === true &&
      "value" in descriptor &&
      descriptor.value === PREVIEW_SHADOW_ACTIVATION_REQUEST_VERSION
    );
  } catch {
    return false;
  }
}

export function createPreviewShadowActivationRequestWorkflow(input: {
  controlPlane: DurablePreviewShadowControlPlaneWorkflow;
  context: PreviewShadowActivationContext;
}) {
  const dependencies = exactRecord(input, ["controlPlane", "context"]);
  const controlPlane = dependencies.controlPlane as
    | DurablePreviewShadowControlPlaneWorkflow
    | undefined;
  const activate = dataMethod(controlPlane, "activate") as
    | DurablePreviewShadowControlPlaneWorkflow["activate"]
    | undefined;
  const context = dependencies.context as PreviewShadowActivationContext;
  if (!activate) invalid();

  return Object.freeze({
    async handle(candidate: unknown): Promise<PreviewShadowActivationReceipt> {
      const payload = parsePreviewShadowActivationRequest(candidate);
      const result = await activate.call(controlPlane, {
        artifact: payload.artifact,
        authorization: payload.authorization,
        context,
        runControlCapability: payload.runControlCapability,
      });
      return Object.freeze({
        contract_version: PREVIEW_SHADOW_ACTIVATION_RECEIPT_VERSION,
        outcome: result.outcome,
        run: result.run,
      });
    },
  });
}

export function parsePreviewShadowActivationRequest(candidate: unknown): {
  artifact: unknown;
  authorization: unknown;
  runControlCapability: string;
} {
  const envelope = exactRecord(candidate, [
    "contract_version",
    "action",
    "payload",
  ]);
  if (
    envelope.contract_version !== PREVIEW_SHADOW_ACTIVATION_REQUEST_VERSION ||
    envelope.action !== "activate"
  ) {
    invalid();
  }
  const payload = exactRecord(envelope.payload, [
    "artifact",
    "authorization",
    "run_control_capability",
  ]);
  if (
    typeof payload.run_control_capability !== "string" ||
    payload.run_control_capability.length < 43 ||
    payload.run_control_capability.length > 128
  ) {
    invalid();
  }
  return Object.freeze({
    artifact: payload.artifact,
    authorization: payload.authorization,
    runControlCapability: payload.run_control_capability,
  });
}

function exactRecord(
  value: unknown,
  expected: readonly string[]
): Record<string, unknown> {
  try {
    if (
      value === null ||
      typeof value !== "object" ||
      Array.isArray(value) ||
      Object.getPrototypeOf(value) !== Object.prototype
    ) {
      invalid();
    }
    const keys = Reflect.ownKeys(value);
    if (
      keys.length !== expected.length ||
      keys.some((key) => typeof key !== "string" || !expected.includes(key))
    ) {
      invalid();
    }
    const snapshot: Record<string, unknown> = {};
    for (const key of expected) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (
        !descriptor ||
        descriptor.enumerable !== true ||
        !("value" in descriptor)
      ) {
        invalid();
      }
      snapshot[key] = descriptor.value;
    }
    return snapshot;
  } catch {
    invalid();
  }
}

function dataMethod(
  value: unknown,
  key: string
): (...args: never[]) => unknown {
  try {
    if (value === null || typeof value !== "object") invalid();
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (
      !descriptor ||
      !("value" in descriptor) ||
      typeof descriptor.value !== "function"
    ) {
      invalid();
    }
    return descriptor.value as (...args: never[]) => unknown;
  } catch {
    invalid();
  }
}

function invalid(): never {
  throw new Error("preview_shadow_activation_request_invalid");
}
