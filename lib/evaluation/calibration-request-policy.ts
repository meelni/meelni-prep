import { createHash } from "node:crypto";

import {
  CALIBRATION_MAX_COMPLETION_TOKENS,
  CALIBRATION_MAX_SDK_RETRIES,
  CALIBRATION_OFFICIAL_OPENAI_ENDPOINT,
  CALIBRATION_PRICING_CONTRACT,
  CALIBRATION_REQUEST_TIMEOUT_MS,
  CALIBRATION_SERVICE_TIER,
} from "./calibration-budget";
import {
  FEEDBACK_PROVIDER_RESPONSE_FORMAT_VERSION,
  getFeedbackProviderResponseFormatContractHash,
} from "./provider-response-format";

export const FEEDBACK_CALIBRATION_REQUEST_POLICY_VERSION =
  "feedback-calibration-request-policy.v1" as const;
export const FEEDBACK_CALIBRATION_TEMPERATURE = 0.2 as const;

/**
 * Exact paid calibration request controls. The prompt and per-case input are
 * bound separately in the activated plan; this contract pins every remaining
 * provider request parameter that can change model behavior or spend.
 */
export function getFeedbackCalibrationRequestPolicy() {
  return {
    contractVersion: FEEDBACK_CALIBRATION_REQUEST_POLICY_VERSION,
    provider: "openai" as const,
    model: CALIBRATION_PRICING_CONTRACT.model,
    endpoint: CALIBRATION_OFFICIAL_OPENAI_ENDPOINT,
    serviceTier: CALIBRATION_SERVICE_TIER,
    temperature: FEEDBACK_CALIBRATION_TEMPERATURE,
    maxCompletionTokens: CALIBRATION_MAX_COMPLETION_TOKENS,
    maximumSdkRetries: CALIBRATION_MAX_SDK_RETRIES,
    redirectPolicy: "error" as const,
    requestTimeoutMs: CALIBRATION_REQUEST_TIMEOUT_MS,
    responseFormatVersion: FEEDBACK_PROVIDER_RESPONSE_FORMAT_VERSION,
    responseFormatHash: getFeedbackProviderResponseFormatContractHash(),
  };
}

export function getFeedbackCalibrationRequestPolicyHash(): string {
  return createHash("sha256")
    .update(JSON.stringify(getFeedbackCalibrationRequestPolicy()))
    .digest("hex");
}
