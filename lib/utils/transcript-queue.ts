/**
 * Client-side Transcript Persistence Queue
 *
 * Manages a queue of failed transcript saves with automatic retry logic.
 * This ensures no transcript data is lost during network issues or temporary
 * database unavailability.
 */

import { TranscriptTurnInput, QueuedTranscriptSave, TranscriptSaveResult } from "@/lib/types/session";

/**
 * Queue configuration
 */
const QUEUE_CONFIG = {
  maxRetries: 5, // Maximum retry attempts per item
  retryDelayMs: 2000, // Delay between retry attempts
  maxQueueSize: 100, // Maximum items in queue before dropping oldest
  storageKey: "transcript_queue", // LocalStorage key
};

/**
 * Transcript Persistence Queue Manager
 */
export class TranscriptQueue {
  private queue: QueuedTranscriptSave[] = [];
  private isProcessing = false;
  private processTimer: NodeJS.Timeout | null = null;

  constructor() {
    // Load queue from localStorage on initialization
    this.loadFromStorage();

    // Start background processing
    this.startBackgroundProcessing();
  }

  /**
   * Add a transcript turn to the queue
   */
  add(turn: TranscriptTurnInput): void {
    const queuedItem: QueuedTranscriptSave = {
      id: this.generateId(),
      turn,
      attemptCount: 0,
      lastAttempt: new Date(),
    };

    this.queue.push(queuedItem);

    // Enforce max queue size
    if (this.queue.length > QUEUE_CONFIG.maxQueueSize) {
      const removed = this.queue.shift();
      console.warn(
        `[TranscriptQueue] Queue full, dropped oldest item:`,
        removed?.id
      );
    }

    this.saveToStorage();
    this.processQueue(); // Try to process immediately
  }

  /**
   * Save a transcript turn with automatic retry on failure
   */
  async save(turn: TranscriptTurnInput): Promise<TranscriptSaveResult> {
    try {
      const response = await fetch("/api/session/transcript", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: turn.sessionId,
          speaker: turn.speaker,
          text: turn.text,
          startedAt: turn.startedAt?.toISOString(),
          endedAt: turn.endedAt?.toISOString(),
          audioMs: turn.audioMs,
          latencyMs: turn.latencyMs,
          section: turn.section,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.error || `HTTP ${response.status}: ${response.statusText}`
        );
      }

      const data = await response.json();

      return {
        success: true,
        turn: data.turn,
      };
    } catch (error) {
      // Add to queue for retry
      this.add(turn);

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Process queued items
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessing || this.queue.length === 0) {
      return;
    }

    this.isProcessing = true;

    // Process items one at a time
    while (this.queue.length > 0) {
      const item = this.queue[0];

      // Check if max retries exceeded
      if (item.attemptCount >= QUEUE_CONFIG.maxRetries) {
        console.error(
          `[TranscriptQueue] Max retries exceeded for item ${item.id}, dropping`
        );
        this.queue.shift();
        this.saveToStorage();
        continue;
      }

      try {
        // Attempt to save
        item.attemptCount++;
        item.lastAttempt = new Date();

        const response = await fetch("/api/session/transcript", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId: item.turn.sessionId,
            speaker: item.turn.speaker,
            text: item.turn.text,
            startedAt: item.turn.startedAt?.toISOString(),
            endedAt: item.turn.endedAt?.toISOString(),
            audioMs: item.turn.audioMs,
            latencyMs: item.turn.latencyMs,
            section: item.turn.section,
          }),
        });

        if (response.ok) {
          // Success! Remove from queue
          console.log(
            `[TranscriptQueue] Successfully saved queued item ${item.id} on attempt ${item.attemptCount}`
          );
          this.queue.shift();
          this.saveToStorage();
        } else {
          // Failed, update error and keep in queue
          const errorData = await response.json().catch(() => ({}));
          item.error = errorData.error || `HTTP ${response.status}`;
          this.saveToStorage();

          console.warn(
            `[TranscriptQueue] Failed to save item ${item.id} (attempt ${item.attemptCount}/${QUEUE_CONFIG.maxRetries}):`,
            item.error
          );

          // Break to wait before next retry
          break;
        }
      } catch (error) {
        // Network error or exception
        item.error = error instanceof Error ? error.message : String(error);
        this.saveToStorage();

        console.warn(
          `[TranscriptQueue] Error saving item ${item.id} (attempt ${item.attemptCount}/${QUEUE_CONFIG.maxRetries}):`,
          item.error
        );

        // Break to wait before next retry
        break;
      }
    }

    this.isProcessing = false;
  }

  /**
   * Start background processing timer
   */
  private startBackgroundProcessing(): void {
    this.processTimer = setInterval(() => {
      this.processQueue();
    }, QUEUE_CONFIG.retryDelayMs);
  }

  /**
   * Stop background processing
   */
  stop(): void {
    if (this.processTimer) {
      clearInterval(this.processTimer);
      this.processTimer = null;
    }
  }

  /**
   * Get current queue status
   */
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

  /**
   * Clear all queued items
   */
  clear(): void {
    this.queue = [];
    this.saveToStorage();
  }

  /**
   * Generate a unique ID for queue items
   */
  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Save queue to localStorage
   */
  private saveToStorage(): void {
    if (typeof window === "undefined") return;

    try {
      localStorage.setItem(
        QUEUE_CONFIG.storageKey,
        JSON.stringify(
          this.queue.map((item) => ({
            ...item,
            turn: {
              ...item.turn,
              startedAt: item.turn.startedAt?.toISOString(),
              endedAt: item.turn.endedAt?.toISOString(),
            },
            lastAttempt: item.lastAttempt.toISOString(),
          }))
        )
      );
    } catch (error) {
      console.error("[TranscriptQueue] Failed to save to localStorage:", error);
    }
  }

  /**
   * Load queue from localStorage
   */
  private loadFromStorage(): void {
    if (typeof window === "undefined") return;

    try {
      const stored = localStorage.getItem(QUEUE_CONFIG.storageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        this.queue = parsed.map((item: any) => ({
          ...item,
          turn: {
            ...item.turn,
            startedAt: item.turn.startedAt ? new Date(item.turn.startedAt) : undefined,
            endedAt: item.turn.endedAt ? new Date(item.turn.endedAt) : undefined,
          },
          lastAttempt: new Date(item.lastAttempt),
        }));

        if (this.queue.length > 0) {
          console.log(
            `[TranscriptQueue] Loaded ${this.queue.length} items from storage`
          );
        }
      }
    } catch (error) {
      console.error("[TranscriptQueue] Failed to load from localStorage:", error);
      this.queue = [];
    }
  }
}

/**
 * Singleton instance
 */
let transcriptQueue: TranscriptQueue | null = null;

/**
 * Get the transcript queue instance
 */
export function getTranscriptQueue(): TranscriptQueue {
  if (!transcriptQueue) {
    transcriptQueue = new TranscriptQueue();
  }
  return transcriptQueue;
}
