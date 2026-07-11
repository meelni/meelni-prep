/** Client retry queue for canonical transcript events. */

import type { TranscriptEvent } from "@meelni/agent";
import { isPersistableTranscriptEvent } from "@/lib/workflows/ingest-transcript-event";

export interface TranscriptPersistenceRequest {
  ownerId: string;
  sessionId: string;
  event: TranscriptEvent;
}

export interface TranscriptSaveResult {
  success: boolean;
  disposition?: "created" | "existing";
  turn?: unknown;
  error?: string;
}

interface QueuedTranscriptSave {
  id: string;
  request: TranscriptPersistenceRequest;
  attemptCount: number;
  enqueuedAt: Date;
  lastAttempt: Date;
  status?: "retrying";
}

type SerializedQueuedTranscriptSave = Omit<
  QueuedTranscriptSave,
  "enqueuedAt" | "lastAttempt"
> & { enqueuedAt: string; lastAttempt: string };

interface TranscriptQueueFailure {
  id: string;
  ownerId: string;
  sessionId: string;
  reason: "identity_conflict" | "capacity_exceeded" | "non_retryable";
  recordedAt: Date;
}

type SerializedTranscriptQueueFailure = Omit<
  TranscriptQueueFailure,
  "recordedAt"
> & { recordedAt: string };

interface SerializedTranscriptQueueState {
  items: SerializedQueuedTranscriptSave[];
  overflowedSessions: string[];
  failures?: SerializedTranscriptQueueFailure[];
}

const QUEUE_CONFIG = {
  retryDelayMs: 2_000,
  maxQueueSize: 1_000,
  retentionMs: 24 * 60 * 60 * 1_000,
  storageKey: "transcript_queue_v2",
} as const;

class TranscriptHttpError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
  }

  get retryable() {
    if (this.message === "transcript_session_capacity_exceeded") return false;
    return (
      this.status === 408 ||
      this.status === 425 ||
      this.status === 429 ||
      this.status >= 500
    );
  }
}

export class TranscriptQueue {
  private queue: QueuedTranscriptSave[] = [];
  private isProcessing = false;
  private processTimer: ReturnType<typeof setInterval> | null = null;
  private inFlight = new Map<string, Promise<TranscriptSaveResult>>();
  private overflowedSessions = new Set<string>();
  private failures: TranscriptQueueFailure[] = [];
  private boundOwnerId: string | null = null;
  private ownerGeneration = 0;

  constructor() {
    this.loadFromStorage();
  }

  add(request: TranscriptPersistenceRequest): boolean {
    this.bindOwner(request.ownerId);
    return this.enqueueForRetry(request);
  }

  private enqueueForRetry(request: TranscriptPersistenceRequest): boolean {
    this.pruneExpired();
    const id = queueIdentity(request);
    const existing = this.queue.find((item) => item.id === id);
    if (existing) {
      existing.status = "retrying";
      this.saveToStorage();
      return true;
    }

    if (this.queue.length >= QUEUE_CONFIG.maxQueueSize) {
      this.overflowedSessions.add(ownerSessionIdentity(request));
      this.saveToStorage();
      console.error("[TranscriptQueue] Retry queue capacity exceeded", {
        sessionId: request.sessionId,
      });
      return false;
    }

    this.queue.push({
      id,
      request,
      attemptCount: 0,
      enqueuedAt: new Date(),
      lastAttempt: new Date(),
      status: "retrying",
    });
    this.saveToStorage();
    void this.processQueue();
    return true;
  }

  async save(
    request: TranscriptPersistenceRequest
  ): Promise<TranscriptSaveResult> {
    this.bindOwner(request.ownerId);
    const generation = this.ownerGeneration;
    const id = queueIdentity(request);
    const existing = this.inFlight.get(id);
    if (existing) return existing;

    const save = this.saveOnce(request, generation).finally(() => {
      if (this.inFlight.get(id) === save) this.inFlight.delete(id);
    });
    this.inFlight.set(id, save);
    return save;
  }

  private async saveOnce(
    request: TranscriptPersistenceRequest,
    generation: number
  ): Promise<TranscriptSaveResult> {
    const id = queueIdentity(request);
    try {
      const result = await postTranscriptEvent(request);
      if (this.isCurrentOwner(request.ownerId, generation)) {
        this.removeQueuedItem(id);
        this.removeFailure(id);
      }
      return result;
    } catch (error) {
      if (!this.isCurrentOwner(request.ownerId, generation)) {
        return { success: false, error: "transcript_owner_changed" };
      }
      if (isRetryable(error)) {
        if (!this.enqueueForRetry(request)) {
          this.overflowedSessions.add(ownerSessionIdentity(request));
          this.saveToStorage();
        }
      } else if (isClosedSessionError(error)) {
        this.removeQueuedItem(id);
        this.removeFailure(id);
      } else {
        this.recordFailure(request, permanentFailureReason(error));
      }
      return {
        success: false,
        error: safeFailureStatus(error),
      };
    }
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessing || this.queue.length === 0) return;
    const generation = this.ownerGeneration;
    const ownerId = this.boundOwnerId;
    this.isProcessing = true;

    try {
      this.pruneExpired();
      while (this.queue.length > 0) {
        if (!ownerId || !this.isCurrentOwner(ownerId, generation)) break;
        const item = this.queue[0];
        item.attemptCount += 1;
        item.lastAttempt = new Date();
        try {
          await postTranscriptEvent(item.request);
          if (!this.isCurrentOwner(ownerId, generation)) break;
          this.removeQueuedItem(item.id);
          this.removeFailure(item.id);
          this.saveToStorage();
        } catch (error) {
          if (!this.isCurrentOwner(ownerId, generation)) break;
          if (!isRetryable(error)) {
            this.removeQueuedItem(item.id);
            if (!isClosedSessionError(error)) {
              this.recordFailure(item.request, permanentFailureReason(error));
            }
            continue;
          }
          item.status = "retrying";
          this.saveToStorage();
          break;
        }
      }
    } finally {
      this.isProcessing = false;
    }
  }

  async flush(
    ownerId: string,
    sessionId: string,
    timeoutMs = 5_000
  ): Promise<{ settled: boolean; pending: number; failed: number }> {
    this.bindOwner(ownerId);
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      await this.processQueue();
      const pending = this.pendingCount(ownerId, sessionId);
      const failed = this.failureCount(ownerId, sessionId);
      if (pending === 0 && failed === 0) {
        return { settled: true, pending: 0, failed: 0 };
      }
      await wait(100);
    }

    const pending = this.pendingCount(ownerId, sessionId);
    const failed = this.failureCount(ownerId, sessionId);
    return { settled: false, pending, failed };
  }

  private pendingCount(ownerId: string, sessionId: string): number {
    const queued = this.queue.filter(
      (item) =>
        item.request.ownerId === ownerId && item.request.sessionId === sessionId
    ).length;
    const inFlight = [...this.inFlight.keys()].filter((id) =>
      id.startsWith(`${ownerId}:${sessionId}:`)
    ).length;
    return queued + inFlight;
  }

  private failureCount(ownerId: string, sessionId: string): number {
    return (
      this.failures.filter(
        (failure) =>
          failure.ownerId === ownerId && failure.sessionId === sessionId
      ).length +
      (this.overflowedSessions.has(`${ownerId}:${sessionId}`) ? 1 : 0)
    );
  }

  private startBackgroundProcessing(): void {
    if (this.processTimer) return;
    this.processTimer = setInterval(() => {
      void this.processQueue();
    }, QUEUE_CONFIG.retryDelayMs);
  }

  stop(): void {
    if (this.processTimer) clearInterval(this.processTimer);
    this.processTimer = null;
  }

  getStatus(): {
    queueLength: number;
    isProcessing: boolean;
    failed: number;
  } {
    return {
      queueLength: this.queue.length,
      isProcessing: this.isProcessing,
      failed: this.failures.length + this.overflowedSessions.size,
    };
  }

  clear(): void {
    this.queue = [];
    this.overflowedSessions.clear();
    this.failures = [];
    this.saveToStorage();
  }

  clearSession(ownerId: string, sessionId: string): void {
    this.queue = this.queue.filter(
      (item) =>
        item.request.ownerId !== ownerId || item.request.sessionId !== sessionId
    );
    this.failures = this.failures.filter(
      (failure) =>
        failure.ownerId !== ownerId || failure.sessionId !== sessionId
    );
    this.overflowedSessions.delete(`${ownerId}:${sessionId}`);
    this.saveToStorage();
  }

  private saveToStorage(): void {
    if (typeof localStorage === "undefined") return;
    try {
      const state: SerializedTranscriptQueueState = {
        items: this.queue.map((item) => ({
          ...item,
          enqueuedAt: item.enqueuedAt.toISOString(),
          lastAttempt: item.lastAttempt.toISOString(),
        })),
        overflowedSessions: [...this.overflowedSessions],
        failures: this.failures.map((failure) => ({
          ...failure,
          recordedAt: failure.recordedAt.toISOString(),
        })),
      };
      localStorage.setItem(QUEUE_CONFIG.storageKey, JSON.stringify(state));
    } catch (error) {
      console.error("[TranscriptQueue] Failed to save retry queue", error);
    }
  }

  private loadFromStorage(): void {
    if (typeof localStorage === "undefined") return;
    try {
      localStorage.removeItem("transcript_queue");
      const stored = localStorage.getItem(QUEUE_CONFIG.storageKey);
      if (!stored) return;
      const parsed = JSON.parse(stored) as SerializedTranscriptQueueState;
      const now = Date.now();
      const migratedFailures: TranscriptQueueFailure[] = [];
      this.queue = (parsed.items ?? []).flatMap((item) => {
        if (!isTranscriptPersistenceRequest(item.request)) return [];
        const enqueuedAt = new Date(item.enqueuedAt ?? item.lastAttempt);
        const lastAttempt = new Date(item.lastAttempt);
        if (
          !Number.isFinite(enqueuedAt.getTime()) ||
          !Number.isFinite(lastAttempt.getTime()) ||
          now - enqueuedAt.getTime() > QUEUE_CONFIG.retentionMs
        ) {
          return [];
        }
        if ((item as { permanent?: boolean }).permanent) {
          migratedFailures.push({
            id: item.id,
            ownerId: item.request.ownerId,
            sessionId: item.request.sessionId,
            reason:
              (item as { error?: string }).error ===
              "transcript_event_identity_conflict"
                ? "identity_conflict"
                : "non_retryable",
            recordedAt: lastAttempt,
          });
          return [];
        }
        return [
          { ...item, enqueuedAt, lastAttempt, status: "retrying" as const },
        ];
      });
      this.overflowedSessions = new Set(parsed.overflowedSessions ?? []);
      this.failures = [
        ...migratedFailures,
        ...(parsed.failures ?? []).flatMap((failure) => {
          const recordedAt = new Date(failure.recordedAt);
          return isSafeFailure(failure) &&
            Number.isFinite(recordedAt.getTime()) &&
            now - recordedAt.getTime() <= QUEUE_CONFIG.retentionMs
            ? [{ ...failure, recordedAt }]
            : [];
        }),
      ];
      this.saveToStorage();
    } catch (error) {
      console.error("[TranscriptQueue] Failed to load retry queue", error);
      this.queue = [];
    }
  }

  bindOwner(ownerId: string): void {
    if (this.boundOwnerId === ownerId) {
      this.startBackgroundProcessing();
      return;
    }
    const retained = this.queue.filter(
      (item) => item.request.ownerId === ownerId
    );
    this.queue = retained;
    this.overflowedSessions = new Set(
      [...this.overflowedSessions].filter((key) =>
        key.startsWith(`${ownerId}:`)
      )
    );
    this.failures = this.failures.filter(
      (failure) => failure.ownerId === ownerId
    );
    this.boundOwnerId = ownerId;
    this.ownerGeneration += 1;
    this.saveToStorage();
    this.startBackgroundProcessing();
    void this.processQueue();
  }

  private recordFailure(
    request: TranscriptPersistenceRequest,
    reason: TranscriptQueueFailure["reason"]
  ): void {
    const id = queueIdentity(request);
    this.removeQueuedItem(id);
    const existing = this.failures.find((failure) => failure.id === id);
    if (existing) {
      existing.reason = reason;
      existing.recordedAt = new Date();
    } else {
      this.failures.push({
        id,
        ownerId: request.ownerId,
        sessionId: request.sessionId,
        reason,
        recordedAt: new Date(),
      });
    }
    this.saveToStorage();
  }

  private removeQueuedItem(id: string): void {
    const next = this.queue.filter((item) => item.id !== id);
    if (next.length !== this.queue.length) {
      this.queue = next;
      this.saveToStorage();
    }
  }

  private removeFailure(id: string): void {
    const next = this.failures.filter((failure) => failure.id !== id);
    if (next.length !== this.failures.length) {
      this.failures = next;
      this.saveToStorage();
    }
  }

  private isCurrentOwner(ownerId: string, generation: number): boolean {
    return this.boundOwnerId === ownerId && this.ownerGeneration === generation;
  }

  private pruneExpired(): void {
    const cutoff = Date.now() - QUEUE_CONFIG.retentionMs;
    const queue = this.queue.filter(
      (item) => item.enqueuedAt.getTime() >= cutoff
    );
    const failures = this.failures.filter(
      (failure) => failure.recordedAt.getTime() >= cutoff
    );
    if (
      queue.length !== this.queue.length ||
      failures.length !== this.failures.length
    ) {
      this.queue = queue;
      this.failures = failures;
      this.saveToStorage();
    }
  }
}

async function postTranscriptEvent(
  request: TranscriptPersistenceRequest
): Promise<TranscriptSaveResult> {
  const response = await fetch("/api/session/transcript", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sessionId: request.sessionId,
      event: request.event,
    }),
  });
  const data = (await response.json().catch(() => ({}))) as {
    error?: string;
    disposition?: "created" | "existing";
    turn?: unknown;
  };
  if (!response.ok) {
    throw new TranscriptHttpError(
      response.status,
      data.error || `Transcript save failed (${response.status})`
    );
  }
  return {
    success: true,
    disposition: data.disposition,
    turn: data.turn,
  };
}

function queueIdentity(request: TranscriptPersistenceRequest) {
  return `${request.ownerId}:${request.sessionId}:${request.event.event_id}`;
}

function ownerSessionIdentity(request: TranscriptPersistenceRequest) {
  return `${request.ownerId}:${request.sessionId}`;
}

function isRetryable(error: unknown): boolean {
  return !(error instanceof TranscriptHttpError) || error.retryable;
}

function isClosedSessionError(error: unknown): boolean {
  return (
    error instanceof TranscriptHttpError &&
    error.message === "transcript_session_closed"
  );
}

function permanentFailureReason(
  error: unknown
): TranscriptQueueFailure["reason"] {
  if (error instanceof TranscriptHttpError) {
    if (error.status === 409) return "identity_conflict";
    if (error.message === "transcript_session_capacity_exceeded") {
      return "capacity_exceeded";
    }
  }
  return "non_retryable";
}

function safeFailureStatus(error: unknown): string {
  if (isClosedSessionError(error)) return "transcript_session_closed";
  if (isRetryable(error)) return "transcript_save_retrying";
  return permanentFailureReason(error);
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTranscriptPersistenceRequest(
  value: unknown
): value is TranscriptPersistenceRequest {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<TranscriptPersistenceRequest>;
  return (
    typeof candidate.sessionId === "string" &&
    typeof candidate.ownerId === "string" &&
    candidate.ownerId.length > 0 &&
    isPersistableTranscriptEvent(candidate.event) &&
    candidate.event.session_id === candidate.sessionId
  );
}

function isSafeFailure(
  value: unknown
): value is SerializedTranscriptQueueFailure {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<SerializedTranscriptQueueFailure>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.ownerId === "string" &&
    typeof candidate.sessionId === "string" &&
    typeof candidate.recordedAt === "string" &&
    ["identity_conflict", "capacity_exceeded", "non_retryable"].includes(
      candidate.reason ?? ""
    )
  );
}

let transcriptQueue: TranscriptQueue | null = null;

export function getTranscriptQueue(): TranscriptQueue {
  transcriptQueue ??= new TranscriptQueue();
  return transcriptQueue;
}

export function clearTranscriptQueueStorage(): void {
  transcriptQueue?.clear();
  if (typeof localStorage !== "undefined") {
    localStorage.removeItem(QUEUE_CONFIG.storageKey);
    localStorage.removeItem("transcript_queue");
  }
}
