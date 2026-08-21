import type {
  DurablePreviewShadowControlPlaneStore,
  DurablePreviewShadowSessionLease,
} from "@/lib/db/adaptive-interviewer-preview-shadow-control-plane";

export const PREVIEW_SHADOW_WORKER_REQUEST_VERSION =
  "adaptive-interviewer-preview-shadow-worker-request.v1" as const;

export type PreviewShadowWorkerResult =
  | {
      ok: true;
      action: "admit";
      admitted: true;
      run_id: string;
      lease_id: string;
      revision: number;
    }
  | {
      ok: true;
      action: "reconcile";
      outcome: "recorded" | "replayed";
      revision: number;
      stopped: boolean;
    };

export function createPreviewShadowWorkerWorkflow(input: {
  store: DurablePreviewShadowControlPlaneStore;
  verifyAdmission: (candidate: {
    lease: unknown;
    workerEvidenceCapability: string;
  }) => Promise<DurablePreviewShadowSessionLease>;
}) {
  const dependencies = exactRecord(input, ["store", "verifyAdmission"]);
  const store = dependencies.store as DurablePreviewShadowControlPlaneStore;
  const verifyAdmission = dependencies.verifyAdmission;
  if (typeof verifyAdmission !== "function") invalid();

  return Object.freeze({
    async handle(candidate: unknown): Promise<PreviewShadowWorkerResult> {
      const envelope = exactRecord(candidate, [
        "contract_version",
        "action",
        "payload",
      ]);
      if (
        envelope.contract_version !== PREVIEW_SHADOW_WORKER_REQUEST_VERSION
      ) {
        invalid();
      }
      if (envelope.action === "admit") {
        const payload = exactRecord(envelope.payload, [
          "lease",
          "worker_evidence_capability",
        ]);
        const lease = await verifyAdmission({
          lease: payload.lease,
          workerEvidenceCapability:
            payload.worker_evidence_capability as string,
        });
        return Object.freeze({
          ok: true as const,
          action: "admit" as const,
          admitted: true as const,
          run_id: lease.run_id,
          lease_id: lease.lease_id,
          revision: lease.allocation_ledger_revision,
        });
      }
      if (envelope.action === "reconcile") {
        const payload = exactRecord(envelope.payload, [
          "kind",
          "run_id",
          "expected_revision",
          "worker_evidence_capability",
          "evidence",
        ]);
        const common = {
          runId: payload.run_id as string,
          expectedRevision: payload.expected_revision as number,
          workerEvidenceCapability:
            payload.worker_evidence_capability as string,
        };
        if (payload.kind === "receipt") {
          const result = await store.reconcileSessionReceipt({
            ...common,
            receipt: payload.evidence,
          });
          return Object.freeze({
            ok: true as const,
            action: "reconcile" as const,
            outcome: result.outcome,
            revision: result.run.revision,
            stopped: result.run.stopped,
          });
        }
        if (payload.kind === "stop_incomplete") {
          const result = await store.recordStopIncompleteIncident({
            ...common,
            incident: payload.evidence,
          });
          return Object.freeze({
            ok: true as const,
            action: "reconcile" as const,
            outcome: result.outcome,
            revision: result.run.revision,
            stopped: result.run.stopped,
          });
        }
      }
      invalid();
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
    const result: Record<string, unknown> = {};
    for (const key of expected) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (
        !descriptor ||
        descriptor.enumerable !== true ||
        !("value" in descriptor)
      ) {
        invalid();
      }
      result[key] = descriptor.value;
    }
    return result;
  } catch {
    invalid();
  }
}

function invalid(): never {
  throw new Error("preview_shadow_worker_request_invalid");
}
