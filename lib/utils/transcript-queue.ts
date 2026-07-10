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
  lastAttempt: Date;
  error?: string;
  permanent?: boolean;
}

type SerializedQueuedTranscriptSave = Omit<
  QueuedTranscriptSave,
  "lastAttempt"
> & { lastAttempt: string };

interface SerializedTranscriptQueueState {
  items: SerializedQueuedTranscriptSave[];
  overflowedSessions: string[];
}

const QUEUE_CONFIG = {
  retryDelayMs: 2_000,
  maxQueueSize: 1_000,
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
  private boundOwnerId: string | null = null;

  constructor() {
    this.loadFromStorage();
  }

  add(request: TranscriptPersistenceRequest): boolean {
    this.bindOwner(request.ownerId);
    const id = queueIdentity(request);
    const existing = this.queue.find((item) => item.id === id);
    if (existing) {
      existing.permanent = false;
      existing.error = undefined;
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
      lastAttempt: new Date(),
    });
    this.saveToStorage();
    void this.processQueue();
    return true;
  }

  async save(
    request: TranscriptPersistenceRequest
  ): Promise<TranscriptSaveResult> {
    this.bindOwner(request.ownerId);
    const id = queueIdentity(request);
    const existing = this.inFlight.get(id);
    if (existing) return existing;

    const save = this.saveOnce(request).finally(() => {
      this.inFlight.delete(id);
    });
    this.inFlight.set(id, save);
    return save;
  }

  private async saveOnce(
    request: TranscriptPersistenceRequest
  ): Promise<TranscriptSaveResult> {
    const id = queueIdentity(request);
    try {
      const result = await postTranscriptEvent(request);
      this.removeQueuedItem(id);
      return result;
    } catch (error) {
      if (isRetryable(error)) {
        if (!this.add(request)) {
          this.overflowedSessions.add(ownerSessionIdentity(request));
          this.saveToStorage();
        }
      } else {
        this.recordPermanentFailure(
          request,
          error instanceof Error ? error.message : String(error)
        );
      }
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessing || this.queue.length === 0) return;
    this.isProcessing = true;

    try {
      while (this.queue.length > 0) {
        const itemIndex = this.queue.findIndex((item) => !item.permanent);
        if (itemIndex < 0) break;
        const item = this.queue[itemIndex];
        item.attemptCount += 1;
        item.lastAttempt = new Date();
        try {
          await postTranscriptEvent(item.request);
          this.queue.splice(itemIndex, 1);
          this.saveToStorage();
        } catch (error) {
          item.error = error instanceof Error ? error.message : String(error);
          if (!isRetryable(error)) {
            item.permanent = true;
            this.saveToStorage();
            continue;
          }
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
        !item.permanent &&
        item.request.ownerId === ownerId &&
        item.request.sessionId === sessionId
    ).length;
    const inFlight = [...this.inFlight.keys()].filter((id) =>
      id.startsWith(`${ownerId}:${sessionId}:`)
    ).length;
    return queued + inFlight;
  }

  private failureCount(ownerId: string, sessionId: string): number {
    return (
      this.queue.filter(
        (item) =>
          item.permanent &&
          item.request.ownerId === ownerId &&
          item.request.sessionId === sessionId
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
    items: QueuedTranscriptSave[];
  } {
    return {
      queueLength: this.queue.length,
      isProcessing: this.isProcessing,
      items: [...this.queue],
    };
  }

  clear(): void {
    this.queue = [];
    this.overflowedSessions.clear();
    this.saveToStorage();
  }

  private saveToStorage(): void {
    if (typeof localStorage === "undefined") return;
    try {
      const state: SerializedTranscriptQueueState = {
        items: this.queue.map((item) => ({
          ...item,
          lastAttempt: item.lastAttempt.toISOString(),
        })),
        overflowedSessions: [...this.overflowedSessions],
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
      this.queue = (parsed.items ?? []).flatMap((item) =>
        isTranscriptPersistenceRequest(item.request)
          ? [{ ...item, lastAttempt: new Date(item.lastAttempt) }]
          : []
      );
      this.overflowedSessions = new Set(parsed.overflowedSessions ?? []);
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
    this.boundOwnerId = ownerId;
    this.saveToStorage();
    this.startBackgroundProcessing();
    void this.processQueue();
  }

  private recordPermanentFailure(
    request: TranscriptPersistenceRequest,
    error: string
  ): void {
    const id = queueIdentity(request);
    const existing = this.queue.find((item) => item.id === id);
    if (existing) {
      existing.error = error;
      existing.permanent = true;
      existing.lastAttempt = new Date();
    } else {
      this.queue.push({
        id,
        request,
        attemptCount: 1,
        lastAttempt: new Date(),
        error,
        permanent: true,
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

let transcriptQueue: TranscriptQueue | null = null;

export function getTranscriptQueue(): TranscriptQueue {
  transcriptQueue ??= new TranscriptQueue();
  return transcriptQueue;
}
