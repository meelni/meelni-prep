import type {
  PreviewShadowActivationContext,
  PreviewShadowOwnerKeyRegistry,
  AuthenticatedPreviewShadowOwnerDecision,
} from "@/lib/security/adaptive-interviewer-preview-shadow-owner-decision";
import {
  PreviewShadowControlPlaneError,
  type DurablePreviewShadowControlPlaneStore,
  type DurablePreviewShadowRun,
} from "@/lib/db/adaptive-interviewer-preview-shadow-control-plane";

export interface DurablePreviewShadowOwnerDecisionVerifier {
  verify(input: {
    artifact: unknown;
    authorization: unknown;
    context: PreviewShadowActivationContext;
    keyRegistry: PreviewShadowOwnerKeyRegistry;
    now: Date;
  }): AuthenticatedPreviewShadowOwnerDecision;
}

export interface DurablePreviewShadowControlPlaneWorkflow {
  activate(input: {
    artifact: unknown;
    authorization: unknown;
    context: PreviewShadowActivationContext;
    runControlCapability: string;
  }): Promise<{
    outcome: "activated" | "replayed";
    run: DurablePreviewShadowRun;
  }>;
}

/**
 * Server-owned construction only. No default verifier, key registry, clock,
 * database, environment lookup, or runtime registration exists here.
 */
export function createDurablePreviewShadowControlPlaneWorkflow(input: {
  store: DurablePreviewShadowControlPlaneStore;
  ownerDecisionVerifier: DurablePreviewShadowOwnerDecisionVerifier;
  ownerKeyRegistry: PreviewShadowOwnerKeyRegistry;
  clock: () => Date;
}): DurablePreviewShadowControlPlaneWorkflow {
  const dependencies = exactRecord(input, [
    "store",
    "ownerDecisionVerifier",
    "ownerKeyRegistry",
    "clock",
  ]);
  const store = dependencies.store as DurablePreviewShadowControlPlaneStore;
  const verifier =
    dependencies.ownerDecisionVerifier as DurablePreviewShadowOwnerDecisionVerifier;
  const keyRegistry =
    dependencies.ownerKeyRegistry as PreviewShadowOwnerKeyRegistry;
  const clock = dependencies.clock as () => Date;
  const activateStore = dataMethod(
    store,
    "activate"
  ) as DurablePreviewShadowControlPlaneStore["activate"];
  const verifyOwnerDecision = dataMethod(
    verifier,
    "verify"
  ) as DurablePreviewShadowOwnerDecisionVerifier["verify"];
  if (typeof clock !== "function") invalid();

  return Object.freeze({
    async activate(candidate: {
      artifact: unknown;
      authorization: unknown;
      context: PreviewShadowActivationContext;
      runControlCapability: string;
    }) {
      const request = exactRecord(candidate, [
        "artifact",
        "authorization",
        "context",
        "runControlCapability",
      ]);
      let authenticated: AuthenticatedPreviewShadowOwnerDecision;
      try {
        authenticated = verifyOwnerDecision.call(verifier, {
          artifact: request.artifact,
          authorization: request.authorization,
          context: request.context as PreviewShadowActivationContext,
          keyRegistry,
          now: clock(),
        });
      } catch {
        throw new PreviewShadowControlPlaneError(
          "preview_shadow_control_plane_unauthenticated"
        );
      }
      return activateStore.call(store, {
        authenticatedOwnerDecision: authenticated,
        runControlCapability: request.runControlCapability as string,
      });
    },
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
  throw new PreviewShadowControlPlaneError(
    "preview_shadow_control_plane_invalid"
  );
}
