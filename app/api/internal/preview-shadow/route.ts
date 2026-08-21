import { NextResponse } from "next/server";

import ownerKeyRegistry from "@/config/adaptive-interviewer-preview-shadow-owner-keys.json";

import { db } from "@/lib/db";
import {
  createDurablePreviewShadowControlPlaneStore,
  PreviewShadowControlPlaneError,
  verifyDurablePreviewShadowSessionLeaseAdmission,
} from "@/lib/db/adaptive-interviewer-preview-shadow-control-plane";
import {
  createPreviewShadowWorkerWorkflow,
  PREVIEW_SHADOW_WORKER_REQUEST_VERSION,
} from "@/lib/workflows/adaptive-interviewer-preview-shadow-worker";
import { createDurablePreviewShadowControlPlaneWorkflow } from "@/lib/workflows/adaptive-interviewer-preview-shadow-control-plane";
import {
  createPreviewShadowActivationContext,
  createPreviewShadowActivationRequestWorkflow,
  currentPreviewShadowActivationTime,
  isPreviewShadowActivationRequest,
  parsePreviewShadowActivationRequest,
  PREVIEW_SHADOW_ACTIVATION_REQUEST_VERSION,
} from "@/lib/workflows/adaptive-interviewer-preview-shadow-activation";
import {
  authenticatePreviewShadowOwnerDecision,
  type PreviewShadowOwnerKeyRegistry,
} from "@/lib/security/adaptive-interviewer-preview-shadow-owner-decision";

const MAXIMUM_BODY_BYTES = 64 * 1_024;

export async function POST(request: Request) {
  if (!isTrustedPreviewShadowServer(process.env)) {
    return response({ error: "preview_shadow_worker_unavailable" }, 404);
  }
  if (!request.headers.get("content-type")?.startsWith("application/json")) {
    return response({ error: "preview_shadow_worker_media_type_invalid" }, 415);
  }
  const contentLength = request.headers.get("content-length");
  if (
    contentLength !== null &&
    (!/^\d+$/.test(contentLength) || Number(contentLength) > MAXIMUM_BODY_BYTES)
  ) {
    return response({ error: "preview_shadow_worker_payload_too_large" }, 413);
  }
  const raw = await readBounded(request);
  if (raw === null) {
    return response({ error: "preview_shadow_worker_payload_too_large" }, 413);
  }
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return response({ error: "preview_shadow_worker_request_invalid" }, 400);
  }
  const activationRequest = isPreviewShadowActivationRequest(body);
  try {
    if (activationRequest) parsePreviewShadowActivationRequest(body);
    const store = createDurablePreviewShadowControlPlaneStore(db);
    const result = activationRequest
      ? await createActivationWorkflow(store).handle(body)
      : await createPreviewShadowWorkerWorkflow({
          store,
          verifyAdmission: (candidate) =>
            verifyDurablePreviewShadowSessionLeaseAdmission(db, candidate),
        }).handle(body);
    return response(result, 200);
  } catch (error) {
    if (error instanceof PreviewShadowControlPlaneError) {
      const status =
        error.code === "preview_shadow_control_plane_unauthenticated"
          ? 401
          : error.code === "preview_shadow_control_plane_unavailable"
            ? 503
            : 409;
      return response({ error: error.code }, status, activationRequest);
    }
    return response(
      {
        error: activationRequest
          ? "preview_shadow_activation_request_invalid"
          : "preview_shadow_worker_request_invalid",
      },
      400,
      activationRequest
    );
  }
}

function createActivationWorkflow(
  store: ReturnType<typeof createDurablePreviewShadowControlPlaneStore>
) {
  const candidateGitSha = process.env.VERCEL_GIT_COMMIT_SHA ?? "";
  const controlPlane = createDurablePreviewShadowControlPlaneWorkflow({
    store,
    ownerDecisionVerifier: {
      verify: (request) => authenticatePreviewShadowOwnerDecision(request),
    },
    ownerKeyRegistry: ownerKeyRegistry as PreviewShadowOwnerKeyRegistry,
    clock: currentPreviewShadowActivationTime,
  });
  return createPreviewShadowActivationRequestWorkflow({
    controlPlane,
    context: createPreviewShadowActivationContext(candidateGitSha),
  });
}

function isTrustedPreviewShadowServer(
  env: Record<string, string | undefined>
): boolean {
  return (
    env.VERCEL_ENV === "preview" &&
    env.VERCEL_TARGET_ENV === "staging" &&
    env.MEELNI_ENV_PULL_ENVIRONMENT === "preview" &&
    env.MEELNI_PREVIEW_SHADOW_REHEARSAL_SERVER === "enabled"
  );
}

async function readBounded(request: Request): Promise<string | null> {
  const reader = request.body?.getReader();
  if (!reader) return "";
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let size = 0;
  let contents = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAXIMUM_BODY_BYTES) {
        await reader.cancel();
        return null;
      }
      contents += decoder.decode(value, { stream: true });
    }
    contents += decoder.decode();
    return contents;
  } catch {
    return null;
  }
}

function response(value: unknown, status: number, activation = false) {
  return NextResponse.json(
    {
      contract_version: activation
        ? PREVIEW_SHADOW_ACTIVATION_REQUEST_VERSION
        : PREVIEW_SHADOW_WORKER_REQUEST_VERSION,
      ...((value ?? {}) as Record<string, unknown>),
    },
    { status, headers: { "Cache-Control": "no-store" } }
  );
}
