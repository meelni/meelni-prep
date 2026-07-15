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
  overflowedSessions?: string[];
  overflowMarkers?: SerializedTranscriptQueueMarker[];
  failures?: SerializedTranscriptQueueFailure[];
  queueTombstones?: SerializedTranscriptQueueTombstone[];
  failureTombstones?: SerializedTranscriptQueueTombstone[];
  overflowTombstones?: SerializedTranscriptQueueTombstone[];
  generation?: number;
  ownerId?: string;
  revision?: number;
}

interface TranscriptQueueMarker {
  id: string;
  recordedAt: Date;
}

type SerializedTranscriptQueueMarker = Omit<
  TranscriptQueueMarker,
  "recordedAt"
> & { recordedAt: string };

interface TranscriptQueueTombstone {
  id: string;
  removedAt: Date;
}

type SerializedTranscriptQueueTombstone = Omit<
  TranscriptQueueTombstone,
  "removedAt"
> & { removedAt: string };

interface RestoredTranscriptQueueState {
  items: QueuedTranscriptSave[];
  overflowMarkers: TranscriptQueueMarker[];
  failures: TranscriptQueueFailure[];
  queueTombstones: TranscriptQueueTombstone[];
  failureTombstones: TranscriptQueueTombstone[];
  overflowTombstones: TranscriptQueueTombstone[];
  generation: number;
  ownerId: string | null;
  revision: number;
}

interface InFlightTranscriptSave {
  promise: Promise<TranscriptSaveResult>;
  sessionKey: string;
}

interface TranscriptQueueProcessing {
  generation: number;
  promise: Promise<void>;
}

const QUEUE_CONFIG = {
  retryDelayMs: 2_000,
  requestTimeoutMs: 10_000,
  maxConcurrentSessions: 4,
  maxQueueSize: 1_000,
  maxStorageShards: 64,
  retentionMs: 24 * 60 * 60 * 1_000,
  storageKey: "transcript_queue_v2",
  storageFenceKey: "transcript_queue_v2:generation",
  storageShardPrefix: "transcript_queue_v2:writer:",
} as const;

let storageWriterSequence = 0;

interface TranscriptQueueStorageFence {
  generation: number;
  ownerId: string | null;
}

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
  private readonly storageShardKey = `${QUEUE_CONFIG.storageShardPrefix}${createStorageWriterId()}`;
  private queue: QueuedTranscriptSave[] = [];
  private processing = new Map<string, TranscriptQueueProcessing>();
  private processTimer: ReturnType<typeof setInterval> | null = null;
  private inFlight = new Map<string, InFlightTranscriptSave>();
  private overflowedSessions = new Map<string, Date>();
  private failures: TranscriptQueueFailure[] = [];
  private queueTombstones = new Map<string, Date>();
  private failureTombstones = new Map<string, Date>();
  private overflowTombstones = new Map<string, Date>();
  private closedSessions = new Set<string>();
  private boundOwnerId: string | null = null;
  private ownerGeneration = 0;
  private storageGeneration = 0;
  private storageRevision = 0;
  private storageOwnerId: string | null = null;
  private ownerAbortController = new AbortController();
  private sessionAbortControllers = new Map<string, AbortController>();

  constructor() {
    this.loadFromStorage();
  }

  add(request: TranscriptPersistenceRequest): boolean {
    if (
      this.boundOwnerId !== request.ownerId ||
      !this.hasStorageLease(request.ownerId)
    )
      return false;
    return this.enqueueForRetry(request);
  }

  private enqueueForRetry(request: TranscriptPersistenceRequest): boolean {
    if (this.closedSessions.has(ownerSessionIdentity(request))) return false;
    this.pruneExpired();
    this.reconcileFromStorage();
    const id = queueIdentity(request);
    if (this.queueTombstones.has(id)) return true;
    const existing = this.queue.find((item) => item.id === id);
    if (existing) {
      existing.status = "retrying";
      this.saveToStorage();
      return true;
    }

    if (this.queue.length >= QUEUE_CONFIG.maxQueueSize) {
      this.markOverflow(ownerSessionIdentity(request));
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
    if (
      this.boundOwnerId !== request.ownerId ||
      !this.hasStorageLease(request.ownerId) ||
      this.closedSessions.has(ownerSessionIdentity(request))
    ) {
      return { success: false, error: "transcript_owner_changed" };
    }
    const generation = this.ownerGeneration;
    const id = queueIdentity(request);
    const existing = this.inFlight.get(id);
    if (existing) return existing.promise;

    const save = this.saveOnce(request, generation).finally(() => {
      if (this.inFlight.get(id)?.promise === save) this.inFlight.delete(id);
    });
    this.inFlight.set(id, {
      promise: save,
      sessionKey: ownerSessionIdentity(request),
    });
    return save;
  }

  private async saveOnce(
    request: TranscriptPersistenceRequest,
    generation: number
  ): Promise<TranscriptSaveResult> {
    const id = queueIdentity(request);
    try {
      const result = await postTranscriptEvent(
        request,
        this.requestSignals(request)
      );
      if (!this.isCurrentRequest(request, generation)) {
        return { success: false, error: "transcript_owner_changed" };
      }
      this.removeQueuedItem(id);
      this.removeFailure(id);
      return result;
    } catch (error) {
      if (!this.isCurrentRequest(request, generation)) {
        return { success: false, error: "transcript_owner_changed" };
      }
      if (isRetryable(error)) {
        if (!this.enqueueForRetry(request)) {
          this.markOverflow(ownerSessionIdentity(request));
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

  private async processQueue(sessionKey?: string): Promise<void> {
    if (this.queue.length === 0) return;
    this.pruneExpired();
    this.reconcileFromStorage();
    if (sessionKey) {
      await this.processSessionQueue(sessionKey);
      return;
    }
    const availableSlots = Math.max(
      0,
      QUEUE_CONFIG.maxConcurrentSessions - this.processing.size
    );
    const sessionKeys = [
      ...new Set(this.queue.map((item) => ownerSessionIdentity(item.request))),
    ]
      .filter((key) => !this.processing.has(key))
      .slice(0, availableSlots);
    await Promise.all(sessionKeys.map((key) => this.processSessionQueue(key)));
  }

  private processSessionQueue(sessionKey: string): Promise<void> {
    const generation = this.ownerGeneration;
    const active = this.processing.get(sessionKey);
    if (active?.generation === generation) return active.promise;

    const ownerId = this.boundOwnerId;
    const processing: TranscriptQueueProcessing = {
      generation,
      promise: Promise.resolve(),
    };
    this.processing.set(sessionKey, processing);
    processing.promise = (async () => {
      while (true) {
        if (!ownerId || !this.isCurrentOwner(ownerId, generation)) break;
        const item = this.queue.find(
          (candidate) => ownerSessionIdentity(candidate.request) === sessionKey
        );
        if (!item) break;
        item.attemptCount += 1;
        item.lastAttempt = new Date();
        try {
          await postTranscriptEvent(
            item.request,
            this.requestSignals(item.request)
          );
          if (
            !this.isCurrentOwner(ownerId, generation) ||
            this.closedSessions.has(sessionKey)
          )
            break;
          this.removeQueuedItem(item.id);
          this.removeFailure(item.id);
        } catch (error) {
          if (
            !this.isCurrentOwner(ownerId, generation) ||
            this.closedSessions.has(sessionKey)
          )
            break;
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
    })().finally(() => {
      if (this.processing.get(sessionKey) === processing) {
        this.processing.delete(sessionKey);
      }
    });
    return processing.promise;
  }

  async flush(
    ownerId: string,
    sessionId: string,
    timeoutMs = 5_000
  ): Promise<{ settled: boolean; pending: number; failed: number }> {
    if (this.boundOwnerId !== ownerId) {
      return { settled: false, pending: 0, failed: 1 };
    }
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const remainingMs = deadline - Date.now();
      await waitForPromiseWithin(
        this.processQueue(`${ownerId}:${sessionId}`),
        remainingMs
      );
      const pending = this.pendingCount(ownerId, sessionId);
      const failed = this.failureCount(ownerId, sessionId);
      if (pending === 0 && failed === 0) {
        return { settled: true, pending: 0, failed: 0 };
      }
      const retryDelayMs = Math.min(100, deadline - Date.now());
      if (retryDelayMs > 0) await wait(retryDelayMs);
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
    const sessionKey = `${ownerId}:${sessionId}`;
    const inFlight = [...this.inFlight.values()].filter(
      (item) => item.sessionKey === sessionKey
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
      isProcessing: this.processing.size > 0,
      failed: this.failures.length + this.overflowedSessions.size,
    };
  }

  clear(): void {
    this.stop();
    this.boundOwnerId = null;
    this.storageOwnerId = null;
    this.advanceGeneration();
    this.queue = [];
    this.overflowedSessions.clear();
    this.failures = [];
    this.queueTombstones.clear();
    this.failureTombstones.clear();
    this.overflowTombstones.clear();
    this.closedSessions.clear();
    this.inFlight.clear();
    this.storageGeneration += 1;
    this.storageRevision += 1;
    this.writeStorageState();
  }

  clearSession(ownerId: string, sessionId: string): void {
    const sessionKey = `${ownerId}:${sessionId}`;
    this.reconcileFromStorage();
    this.closedSessions.add(sessionKey);
    for (const item of this.queue) {
      if (ownerSessionIdentity(item.request) === sessionKey) {
        this.queueTombstones.set(item.id, new Date());
      }
    }
    this.queue = this.queue.filter(
      (item) => ownerSessionIdentity(item.request) !== sessionKey
    );
    for (const failure of this.failures) {
      if (`${failure.ownerId}:${failure.sessionId}` === sessionKey) {
        this.failureTombstones.set(failure.id, new Date());
      }
    }
    this.failures = this.failures.filter(
      (failure) => `${failure.ownerId}:${failure.sessionId}` !== sessionKey
    );
    this.clearOverflow(sessionKey);
    this.sessionAbortControllers.get(sessionKey)?.abort();
    this.sessionAbortControllers.delete(sessionKey);
    for (const [id, inFlight] of this.inFlight) {
      if (inFlight.sessionKey === sessionKey) this.inFlight.delete(id);
    }
    this.processing.delete(sessionKey);
    this.saveToStorage();
    if (this.boundOwnerId) {
      this.startBackgroundProcessing();
      void this.processQueue();
    }
  }

  private saveToStorage(): void {
    if (typeof localStorage === "undefined") return;
    try {
      if (this.boundOwnerId && !this.hasStorageLease(this.boundOwnerId)) return;
      const stored = this.readStorageState();
      if (
        stored &&
        this.boundOwnerId &&
        ((stored.ownerId !== null && stored.ownerId !== this.boundOwnerId) ||
          stored.generation !== this.storageGeneration)
      ) {
        return;
      }
      if (stored) this.mergeRestoredState(stored);
      this.pruneExpired(false);
      this.storageRevision = Math.max(
        this.storageRevision,
        stored?.revision ?? 0
      );
      this.storageRevision += 1;
      this.writeStorageState();
    } catch (error) {
      console.error("[TranscriptQueue] Failed to save retry queue", error);
    }
  }

  private loadFromStorage(): void {
    if (typeof localStorage === "undefined") return;
    try {
      localStorage.removeItem("transcript_queue");
      const stored = this.readStorageState();
      if (!stored) return;
      this.replaceWithRestoredState(stored);
      this.pruneExpired(false);
      this.storageRevision += 1;
      this.writeStorageState();
    } catch (error) {
      console.error("[TranscriptQueue] Failed to load retry queue", error);
      this.queue = [];
      this.overflowedSessions.clear();
      this.failures = [];
      localStorage.removeItem(QUEUE_CONFIG.storageKey);
      localStorage.removeItem("transcript_queue");
    }
  }

  private readStorageState(): RestoredTranscriptQueueState | null {
    if (typeof localStorage === "undefined") return null;
    const keys = [QUEUE_CONFIG.storageKey, ...transcriptQueueShardKeys()];
    const states: Array<{
      key: string;
      state: RestoredTranscriptQueueState;
      canonical: boolean;
    }> = [];
    for (const key of keys) {
      const stored = localStorage.getItem(key);
      if (!stored) continue;
      try {
        states.push({
          key,
          state: restoreTranscriptQueueState(JSON.parse(stored)),
          canonical: key === QUEUE_CONFIG.storageKey,
        });
      } catch {
        localStorage.removeItem(key);
      }
    }
    const shardStates = states.filter((entry) => !entry.canonical);
    for (const entry of shardStates) {
      if (isEmptyRestoredState(entry.state)) localStorage.removeItem(entry.key);
    }
    const retainedShards = shardStates.filter(
      (entry) => !isEmptyRestoredState(entry.state)
    );
    if (retainedShards.length > QUEUE_CONFIG.maxStorageShards) {
      for (const entry of retainedShards
        .sort(
          (left, right) =>
            right.state.generation - left.state.generation ||
            right.state.revision - left.state.revision ||
            right.key.localeCompare(left.key)
        )
        .slice(QUEUE_CONFIG.maxStorageShards)) {
        localStorage.removeItem(entry.key);
      }
    }
    return mergeStorageShards(states);
  }

  private writeStorageState(): void {
    if (typeof localStorage === "undefined") return;
    const state: SerializedTranscriptQueueState = {
      items: this.queue.map((item) => ({
        ...item,
        enqueuedAt: item.enqueuedAt.toISOString(),
        lastAttempt: item.lastAttempt.toISOString(),
      })),
      overflowMarkers: [...this.overflowedSessions].map(([id, recordedAt]) => ({
        id,
        recordedAt: recordedAt.toISOString(),
      })),
      failures: this.failures.map((failure) => ({
        ...failure,
        recordedAt: failure.recordedAt.toISOString(),
      })),
      queueTombstones: serializeTombstones(this.queueTombstones),
      failureTombstones: serializeTombstones(this.failureTombstones),
      overflowTombstones: serializeTombstones(this.overflowTombstones),
      generation: this.storageGeneration,
      ownerId: this.boundOwnerId ?? this.storageOwnerId ?? undefined,
      revision: this.storageRevision,
    };
    const serialized = JSON.stringify(state);
    const storageOwnerId = this.boundOwnerId ?? this.storageOwnerId;
    if (storageOwnerId !== null || this.storageGeneration > 0) {
      this.writeStorageFence({
        generation: this.storageGeneration,
        ownerId: storageOwnerId,
      });
    }
    // Each live queue owns a durable shard. The canonical key is only a
    // compatibility/read-optimization view, so concurrent canonical writes
    // cannot discard another tab's retained events.
    localStorage.setItem(this.storageShardKey, serialized);
    localStorage.setItem(QUEUE_CONFIG.storageKey, serialized);
  }

  private reconcileFromStorage(): void {
    if (!this.boundOwnerId || typeof localStorage === "undefined") return;
    try {
      if (!this.hasStorageLease(this.boundOwnerId)) return;
      const stored = this.readStorageState();
      if (
        !stored ||
        (stored.ownerId !== null && stored.ownerId !== this.boundOwnerId) ||
        stored.generation !== this.storageGeneration
      ) {
        return;
      }
      this.mergeRestoredState(stored);
      this.storageRevision = Math.max(this.storageRevision, stored.revision);
      this.pruneExpired(false);
    } catch (error) {
      console.error("[TranscriptQueue] Failed to reconcile retry queue", error);
    }
  }

  private replaceWithRestoredState(state: RestoredTranscriptQueueState): void {
    this.queue = state.items;
    this.overflowedSessions = new Map(
      state.overflowMarkers.map((marker) => [marker.id, marker.recordedAt])
    );
    this.failures = state.failures;
    this.queueTombstones = new Map(
      state.queueTombstones.map((marker) => [marker.id, marker.removedAt])
    );
    this.failureTombstones = new Map(
      state.failureTombstones.map((marker) => [marker.id, marker.removedAt])
    );
    this.overflowTombstones = new Map(
      state.overflowTombstones.map((marker) => [marker.id, marker.removedAt])
    );
    this.storageGeneration = state.generation;
    this.storageRevision = state.revision;
    this.storageOwnerId = state.ownerId;
  }

  private mergeRestoredState(state: RestoredTranscriptQueueState): void {
    const ownerId = this.boundOwnerId;
    mergeDateMap(this.queueTombstones, state.queueTombstones, "removedAt");
    mergeDateMap(this.failureTombstones, state.failureTombstones, "removedAt");
    mergeDateMap(
      this.overflowTombstones,
      state.overflowTombstones,
      "removedAt"
    );

    const queueById = new Map(this.queue.map((item) => [item.id, item]));
    for (const candidate of state.items) {
      if (ownerId && candidate.request.ownerId !== ownerId) continue;
      const current = queueById.get(candidate.id);
      if (!current || isNewerQueueItem(candidate, current)) {
        queueById.set(candidate.id, candidate);
      }
    }
    this.queue = [...queueById.values()].filter(
      (item) => !this.queueTombstones.has(item.id)
    );
    this.queue.sort(compareQueuedItems);
    if (this.queue.length > QUEUE_CONFIG.maxQueueSize) {
      const rejected = this.queue.splice(QUEUE_CONFIG.maxQueueSize);
      for (const item of rejected) {
        this.markOverflow(ownerSessionIdentity(item.request));
      }
    }

    const failuresById = new Map(
      this.failures.map((failure) => [failure.id, failure])
    );
    for (const candidate of state.failures) {
      if (ownerId && candidate.ownerId !== ownerId) continue;
      const current = failuresById.get(candidate.id);
      if (!current || candidate.recordedAt > current.recordedAt) {
        failuresById.set(candidate.id, candidate);
      }
    }
    this.failures = [...failuresById.values()]
      .filter((failure) => !this.failureTombstones.has(failure.id))
      .sort((left, right) =>
        left.recordedAt.getTime() === right.recordedAt.getTime()
          ? left.id.localeCompare(right.id)
          : right.recordedAt.getTime() - left.recordedAt.getTime()
      )
      .slice(0, QUEUE_CONFIG.maxQueueSize);

    for (const marker of state.overflowMarkers) {
      if (ownerId && !marker.id.startsWith(`${ownerId}:`)) continue;
      const current = this.overflowedSessions.get(marker.id);
      if (!current || marker.recordedAt > current) {
        this.overflowedSessions.set(marker.id, marker.recordedAt);
      }
    }
    for (const id of this.overflowTombstones.keys()) {
      this.overflowedSessions.delete(id);
    }
    this.boundMarkers();
  }

  bindOwner(ownerId: string): void {
    if (this.boundOwnerId === ownerId) {
      this.reconcileFromStorage();
      this.startBackgroundProcessing();
      return;
    }
    const stored = this.readStorageState();
    const fence = this.readStorageFence();
    const authorityGeneration = Math.max(
      stored?.generation ?? 0,
      fence?.generation ?? 0
    );
    const authorityOwner =
      fence && fence.generation >= (stored?.generation ?? 0)
        ? fence.ownerId
        : (stored?.ownerId ?? null);
    const ownerChangedAcrossTabs = Boolean(
      authorityOwner && authorityOwner !== ownerId
    );
    const storageWasCleared = Boolean(
      fence &&
        fence.ownerId === null &&
        fence.generation >= (stored?.generation ?? 0)
    );
    const resetsAuthority = ownerChangedAcrossTabs || storageWasCleared;
    if (resetsAuthority) {
      removeTranscriptQueueShards();
      this.storageGeneration = ownerChangedAcrossTabs
        ? authorityGeneration + 1
        : authorityGeneration;
      this.storageRevision = (stored?.revision ?? 0) + 1;
      this.storageOwnerId = ownerId;
      this.queue = [];
      this.overflowedSessions.clear();
      this.failures = [];
      this.queueTombstones.clear();
      this.failureTombstones.clear();
      this.overflowTombstones.clear();
    } else if (stored) {
      this.storageGeneration = stored.generation;
      this.storageRevision = stored.revision;
      this.mergeRestoredState(stored);
    }
    const retained = this.queue.filter(
      (item) => item.request.ownerId === ownerId
    );
    this.queue = retained;
    this.overflowedSessions = new Map(
      [...this.overflowedSessions].filter(([key]) =>
        key.startsWith(`${ownerId}:`)
      )
    );
    this.failures = this.failures.filter(
      (failure) => failure.ownerId === ownerId
    );
    this.boundOwnerId = ownerId;
    this.storageOwnerId = ownerId;
    this.advanceGeneration();
    this.closedSessions = new Set(
      [...this.closedSessions].filter((key) => key.startsWith(`${ownerId}:`))
    );
    if (resetsAuthority) this.writeStorageState();
    else this.saveToStorage();
    this.startBackgroundProcessing();
    void this.processQueue();
  }

  private advanceGeneration(): void {
    this.ownerAbortController.abort();
    this.ownerAbortController = new AbortController();
    for (const controller of this.sessionAbortControllers.values()) {
      controller.abort();
    }
    this.sessionAbortControllers.clear();
    this.ownerGeneration += 1;
    this.processing.clear();
    this.inFlight.clear();
  }

  private requestSignals(request: TranscriptPersistenceRequest): AbortSignal[] {
    const sessionKey = ownerSessionIdentity(request);
    let sessionController = this.sessionAbortControllers.get(sessionKey);
    if (!sessionController) {
      sessionController = new AbortController();
      this.sessionAbortControllers.set(sessionKey, sessionController);
    }
    return [this.ownerAbortController.signal, sessionController.signal];
  }

  private recordFailure(
    request: TranscriptPersistenceRequest,
    reason: TranscriptQueueFailure["reason"]
  ): void {
    const id = queueIdentity(request);
    this.removeQueuedItem(id);
    this.failureTombstones.delete(id);
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
      this.queueTombstones.set(id, new Date());
      this.saveToStorage();
    }
  }

  private removeFailure(id: string): void {
    const next = this.failures.filter((failure) => failure.id !== id);
    if (next.length !== this.failures.length) {
      this.failures = next;
      this.failureTombstones.set(id, new Date());
      this.saveToStorage();
    }
  }

  private markOverflow(sessionKey: string): void {
    this.overflowTombstones.delete(sessionKey);
    this.overflowedSessions.set(sessionKey, new Date());
    this.boundMarkers();
  }

  private clearOverflow(sessionKey: string): void {
    if (this.overflowedSessions.delete(sessionKey)) {
      this.overflowTombstones.set(sessionKey, new Date());
    }
  }

  private boundMarkers(): void {
    this.overflowedSessions = new Map(
      [...this.overflowedSessions]
        .sort(([leftId, left], [rightId, right]) =>
          left.getTime() === right.getTime()
            ? leftId.localeCompare(rightId)
            : right.getTime() - left.getTime()
        )
        .slice(0, QUEUE_CONFIG.maxQueueSize)
    );
  }

  private isCurrentOwner(ownerId: string, generation: number): boolean {
    return (
      this.boundOwnerId === ownerId &&
      this.ownerGeneration === generation &&
      this.hasStorageLease(ownerId)
    );
  }

  private hasStorageLease(ownerId: string): boolean {
    if (typeof localStorage === "undefined") return true;
    try {
      const fence = this.readStorageFence();
      if (fence) {
        return (
          fence.ownerId === ownerId &&
          fence.generation === this.storageGeneration
        );
      }
      const stored = this.readStorageState();
      return (
        !stored?.ownerId ||
        (stored.ownerId === ownerId &&
          stored.generation === this.storageGeneration)
      );
    } catch {
      return false;
    }
  }

  private readStorageFence(): TranscriptQueueStorageFence | null {
    return readTranscriptQueueStorageFence();
  }

  private writeStorageFence(fence: TranscriptQueueStorageFence): void {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(QUEUE_CONFIG.storageFenceKey, JSON.stringify(fence));
  }

  private isCurrentRequest(
    request: TranscriptPersistenceRequest,
    generation: number
  ): boolean {
    return (
      this.isCurrentOwner(request.ownerId, generation) &&
      !this.closedSessions.has(ownerSessionIdentity(request))
    );
  }

  private pruneExpired(persist = true): void {
    const cutoff = Date.now() - QUEUE_CONFIG.retentionMs;
    const queue = this.queue.filter(
      (item) => item.enqueuedAt.getTime() >= cutoff
    );
    const failures = this.failures.filter(
      (failure) => failure.recordedAt.getTime() >= cutoff
    );
    const overflowedSessions = new Map(
      [...this.overflowedSessions].filter(
        ([, recordedAt]) => recordedAt.getTime() >= cutoff
      )
    );
    pruneDateMap(this.queueTombstones, cutoff);
    pruneDateMap(this.failureTombstones, cutoff);
    pruneDateMap(this.overflowTombstones, cutoff);
    if (
      queue.length !== this.queue.length ||
      failures.length !== this.failures.length ||
      overflowedSessions.size !== this.overflowedSessions.size
    ) {
      this.queue = queue;
      this.failures = failures;
      this.overflowedSessions = overflowedSessions;
      if (persist) this.saveToStorage();
    }
  }
}

function restoreTranscriptQueueState(
  value: unknown
): RestoredTranscriptQueueState {
  if (!value || typeof value !== "object") {
    throw new Error("Invalid transcript queue state");
  }
  const parsed = value as SerializedTranscriptQueueState;
  const now = Date.now();
  const cutoff = now - QUEUE_CONFIG.retentionMs;
  const migratedFailures: TranscriptQueueFailure[] = [];
  const items = (Array.isArray(parsed.items) ? parsed.items : []).flatMap(
    (item) => {
      if (!isTranscriptPersistenceRequest(item?.request)) return [];
      if (item.id !== queueIdentity(item.request)) return [];
      const enqueuedAt = new Date(item.enqueuedAt ?? item.lastAttempt);
      const lastAttempt = new Date(item.lastAttempt);
      if (
        !Number.isFinite(enqueuedAt.getTime()) ||
        !Number.isFinite(lastAttempt.getTime()) ||
        enqueuedAt.getTime() < cutoff
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
        {
          ...item,
          attemptCount: Number.isSafeInteger(item.attemptCount)
            ? Math.max(0, item.attemptCount)
            : 0,
          enqueuedAt,
          lastAttempt,
          status: "retrying" as const,
        },
      ];
    }
  );
  const failures = [
    ...migratedFailures,
    ...(Array.isArray(parsed.failures) ? parsed.failures : []).flatMap(
      (failure) => {
        const recordedAt = new Date(failure?.recordedAt);
        return isSafeFailure(failure) &&
          Number.isFinite(recordedAt.getTime()) &&
          recordedAt.getTime() >= cutoff
          ? [{ ...failure, recordedAt }]
          : [];
      }
    ),
  ];
  const overflowMarkers = [
    ...(Array.isArray(parsed.overflowMarkers)
      ? parsed.overflowMarkers.flatMap((marker) => {
          const recordedAt = new Date(marker?.recordedAt);
          return isSafeSessionKey(marker?.id) &&
            Number.isFinite(recordedAt.getTime()) &&
            recordedAt.getTime() >= cutoff
            ? [{ id: marker.id, recordedAt }]
            : [];
        })
      : []),
    ...(Array.isArray(parsed.overflowedSessions)
      ? parsed.overflowedSessions.flatMap((id) =>
          isSafeSessionKey(id) ? [{ id, recordedAt: new Date(now) }] : []
        )
      : []),
  ];
  return {
    items: dedupeQueueItems(items).slice(0, QUEUE_CONFIG.maxQueueSize),
    overflowMarkers: dedupeMarkers(overflowMarkers).slice(
      0,
      QUEUE_CONFIG.maxQueueSize
    ),
    failures: dedupeFailures(failures).slice(0, QUEUE_CONFIG.maxQueueSize),
    queueTombstones: restoreTombstones(parsed.queueTombstones, cutoff),
    failureTombstones: restoreTombstones(parsed.failureTombstones, cutoff),
    overflowTombstones: restoreTombstones(parsed.overflowTombstones, cutoff),
    generation:
      Number.isSafeInteger(parsed.generation) && (parsed.generation ?? -1) >= 0
        ? parsed.generation!
        : 0,
    ownerId:
      typeof parsed.ownerId === "string" && parsed.ownerId.length > 0
        ? parsed.ownerId
        : null,
    revision:
      Number.isSafeInteger(parsed.revision) && (parsed.revision ?? -1) >= 0
        ? parsed.revision!
        : 0,
  };
}

function transcriptQueueShardKeys(): string[] {
  if (typeof localStorage === "undefined") return [];
  const keys: string[] = [];
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (key?.startsWith(QUEUE_CONFIG.storageShardPrefix)) keys.push(key);
  }
  return keys.sort();
}

function createStorageWriterId(): string {
  storageWriterSequence += 1;
  return typeof globalThis.crypto?.randomUUID === "function"
    ? globalThis.crypto.randomUUID()
    : `${Date.now()}:${storageWriterSequence}:${Math.random().toString(36).slice(2)}`;
}

function removeTranscriptQueueShards(): void {
  if (typeof localStorage === "undefined") return;
  for (const key of transcriptQueueShardKeys()) localStorage.removeItem(key);
}

function readTranscriptQueueStorageFence(): TranscriptQueueStorageFence | null {
  if (typeof localStorage === "undefined") return null;
  const value = localStorage.getItem(QUEUE_CONFIG.storageFenceKey);
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<TranscriptQueueStorageFence>;
    return Number.isSafeInteger(parsed.generation) &&
      (parsed.generation ?? -1) >= 0 &&
      (parsed.ownerId === null ||
        (typeof parsed.ownerId === "string" && parsed.ownerId.length > 0))
      ? { generation: parsed.generation!, ownerId: parsed.ownerId! }
      : null;
  } catch {
    return null;
  }
}

function mergeStorageShards(
  entries: Array<{
    state: RestoredTranscriptQueueState;
    canonical: boolean;
  }>
): RestoredTranscriptQueueState | null {
  if (entries.length === 0) return null;
  const base = [...entries].sort(
    (left, right) =>
      right.state.generation - left.state.generation ||
      right.state.revision - left.state.revision ||
      Number(right.canonical) - Number(left.canonical) ||
      (right.state.ownerId ?? "").localeCompare(left.state.ownerId ?? "")
  )[0].state;
  const compatible = entries
    .map((entry) => entry.state)
    .filter(
      (state) =>
        state.generation === base.generation &&
        (!base.ownerId || !state.ownerId || state.ownerId === base.ownerId)
    );
  const queueTombstones = dedupeTombstones(
    compatible.flatMap((state) => state.queueTombstones)
  );
  const failureTombstones = dedupeTombstones(
    compatible.flatMap((state) => state.failureTombstones)
  );
  const overflowTombstones = dedupeTombstones(
    compatible.flatMap((state) => state.overflowTombstones)
  );
  const queueRemoved = new Set(queueTombstones.map((marker) => marker.id));
  const failuresRemoved = new Set(failureTombstones.map((marker) => marker.id));
  const overflowRemoved = new Set(
    overflowTombstones.map((marker) => marker.id)
  );
  return {
    items: dedupeQueueItems(compatible.flatMap((state) => state.items))
      .filter((item) => !queueRemoved.has(item.id))
      .slice(0, QUEUE_CONFIG.maxQueueSize),
    overflowMarkers: dedupeMarkers(
      compatible.flatMap((state) => state.overflowMarkers)
    )
      .filter((marker) => !overflowRemoved.has(marker.id))
      .slice(0, QUEUE_CONFIG.maxQueueSize),
    failures: dedupeFailures(compatible.flatMap((state) => state.failures))
      .filter((failure) => !failuresRemoved.has(failure.id))
      .slice(0, QUEUE_CONFIG.maxQueueSize),
    queueTombstones,
    failureTombstones,
    overflowTombstones,
    generation: base.generation,
    ownerId: base.ownerId,
    revision: Math.max(...compatible.map((state) => state.revision)),
  };
}

function isEmptyRestoredState(state: RestoredTranscriptQueueState): boolean {
  return (
    state.items.length === 0 &&
    state.overflowMarkers.length === 0 &&
    state.failures.length === 0 &&
    state.queueTombstones.length === 0 &&
    state.failureTombstones.length === 0 &&
    state.overflowTombstones.length === 0
  );
}

function dedupeTombstones(
  tombstones: TranscriptQueueTombstone[]
): TranscriptQueueTombstone[] {
  const byId = new Map<string, TranscriptQueueTombstone>();
  for (const marker of tombstones) {
    const current = byId.get(marker.id);
    if (!current || marker.removedAt > current.removedAt) {
      byId.set(marker.id, marker);
    }
  }
  return [...byId.values()]
    .sort((left, right) => right.removedAt.getTime() - left.removedAt.getTime())
    .slice(0, QUEUE_CONFIG.maxQueueSize);
}

function restoreTombstones(
  values: SerializedTranscriptQueueTombstone[] | undefined,
  cutoff: number
): TranscriptQueueTombstone[] {
  if (!Array.isArray(values)) return [];
  const byId = new Map<string, TranscriptQueueTombstone>();
  for (const value of values) {
    const removedAt = new Date(value?.removedAt);
    if (
      typeof value?.id !== "string" ||
      value.id.length === 0 ||
      !Number.isFinite(removedAt.getTime()) ||
      removedAt.getTime() < cutoff
    )
      continue;
    const current = byId.get(value.id);
    if (!current || removedAt > current.removedAt) {
      byId.set(value.id, { id: value.id, removedAt });
    }
  }
  return [...byId.values()]
    .sort((left, right) => right.removedAt.getTime() - left.removedAt.getTime())
    .slice(0, QUEUE_CONFIG.maxQueueSize);
}

function serializeTombstones(
  values: Map<string, Date>
): SerializedTranscriptQueueTombstone[] {
  return [...values]
    .sort(([leftId, left], [rightId, right]) =>
      left.getTime() === right.getTime()
        ? leftId.localeCompare(rightId)
        : right.getTime() - left.getTime()
    )
    .slice(0, QUEUE_CONFIG.maxQueueSize)
    .map(([id, removedAt]) => ({ id, removedAt: removedAt.toISOString() }));
}

function mergeDateMap(
  target: Map<string, Date>,
  incoming: TranscriptQueueTombstone[],
  field: "removedAt"
): void {
  for (const marker of incoming) {
    const date = marker[field];
    const current = target.get(marker.id);
    if (!current || date > current) target.set(marker.id, date);
  }
}

function pruneDateMap(values: Map<string, Date>, cutoff: number): void {
  for (const [id, recordedAt] of values) {
    if (recordedAt.getTime() < cutoff) values.delete(id);
  }
  if (values.size <= QUEUE_CONFIG.maxQueueSize) return;
  const retained = [...values]
    .sort(([, left], [, right]) => right.getTime() - left.getTime())
    .slice(0, QUEUE_CONFIG.maxQueueSize);
  values.clear();
  for (const [id, recordedAt] of retained) values.set(id, recordedAt);
}

function dedupeQueueItems(
  items: QueuedTranscriptSave[]
): QueuedTranscriptSave[] {
  const byId = new Map<string, QueuedTranscriptSave>();
  for (const item of items) {
    const current = byId.get(item.id);
    if (!current || isNewerQueueItem(item, current)) byId.set(item.id, item);
  }
  return [...byId.values()].sort(compareQueuedItems);
}

function dedupeFailures(
  failures: TranscriptQueueFailure[]
): TranscriptQueueFailure[] {
  const byId = new Map<string, TranscriptQueueFailure>();
  for (const failure of failures) {
    const current = byId.get(failure.id);
    if (!current || failure.recordedAt > current.recordedAt) {
      byId.set(failure.id, failure);
    }
  }
  return [...byId.values()].sort(
    (left, right) => right.recordedAt.getTime() - left.recordedAt.getTime()
  );
}

function dedupeMarkers(markers: TranscriptQueueMarker[]) {
  const byId = new Map<string, TranscriptQueueMarker>();
  for (const marker of markers) {
    const current = byId.get(marker.id);
    if (!current || marker.recordedAt > current.recordedAt) {
      byId.set(marker.id, marker);
    }
  }
  return [...byId.values()].sort(
    (left, right) => right.recordedAt.getTime() - left.recordedAt.getTime()
  );
}

function compareQueuedItems(
  left: QueuedTranscriptSave,
  right: QueuedTranscriptSave
) {
  return left.enqueuedAt.getTime() === right.enqueuedAt.getTime()
    ? left.id.localeCompare(right.id)
    : left.enqueuedAt.getTime() - right.enqueuedAt.getTime();
}

function isNewerQueueItem(
  candidate: QueuedTranscriptSave,
  current: QueuedTranscriptSave
) {
  if (candidate.lastAttempt.getTime() !== current.lastAttempt.getTime()) {
    return candidate.lastAttempt > current.lastAttempt;
  }
  return candidate.attemptCount > current.attemptCount;
}

function isSafeSessionKey(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0) return false;
  const separator = value.indexOf(":");
  return separator > 0 && separator < value.length - 1;
}

async function postTranscriptEvent(
  request: TranscriptPersistenceRequest,
  cancellationSignals: AbortSignal[]
): Promise<TranscriptSaveResult> {
  const controller = new AbortController();
  const abort = (signal: AbortSignal) => {
    clearTimeout(timeout);
    controller.abort(signal.reason);
  };
  const timeout = setTimeout(
    () => controller.abort(),
    QUEUE_CONFIG.requestTimeoutMs
  );
  const listeners = cancellationSignals.map((signal) => {
    const listener = () => abort(signal);
    if (signal.aborted) listener();
    else signal.addEventListener("abort", listener, { once: true });
    return { signal, listener };
  });
  let response: Response;
  let data: {
    error?: string;
    disposition?: "created" | "existing";
    turn?: unknown;
  };
  try {
    response = await fetch("/api/session/transcript", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: request.sessionId,
        event: request.event,
      }),
      signal: controller.signal,
    });
    data = (await response.json().catch(() => ({}))) as typeof data;
  } finally {
    clearTimeout(timeout);
    for (const { signal, listener } of listeners) {
      signal.removeEventListener("abort", listener);
    }
  }
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

function waitForPromiseWithin(
  promise: Promise<void>,
  timeoutMs: number
): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(resolve, timeoutMs);
    promise.then(
      () => {
        clearTimeout(timeout);
        resolve();
      },
      (error) => {
        clearTimeout(timeout);
        reject(error);
      }
    );
  });
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
  const existingFence = readTranscriptQueueStorageFence();
  if (transcriptQueue) transcriptQueue.clear();
  if (typeof localStorage !== "undefined") {
    const clearedFence = readTranscriptQueueStorageFence();
    removeTranscriptQueueShards();
    localStorage.removeItem(QUEUE_CONFIG.storageKey);
    localStorage.removeItem("transcript_queue");
    localStorage.setItem(
      QUEUE_CONFIG.storageFenceKey,
      JSON.stringify(
        clearedFence ?? {
          generation: (existingFence?.generation ?? 0) + 1,
          ownerId: null,
        }
      )
    );
  }
}
