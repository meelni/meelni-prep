// @vitest-environment jsdom

import React from "react";
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createTranscriptEvent } from "@meelni/agent";
import type { InterviewConnectionStatus } from "./session-recovery";
import { LiveKitRoomWrapper, type TranscriptTurn } from "./livekit-room";

const SESSION_ID = "550e8400-e29b-41d4-a716-446655440000";
const ROOM_NAME = "interview-synthetic-room";

type DataMessage = {
  payload: Uint8Array;
  from?: { identity: string; isAgent: boolean };
};

const mocks = vi.hoisted(() => ({
  connectionState: "connected",
  voiceAssistant: {
    agent: null as null | { identity: string; isActive: boolean },
    state: "connecting",
  },
  dataCallbacks: new Map<string, (message: DataMessage) => void>(),
  onConnected: null as null | (() => void),
  confirmReady: vi.fn(),
  track: vi.fn(),
}));

vi.mock("@livekit/components-react", async () => {
  const ReactModule = await import("react");
  return {
    LiveKitRoom: ({
      children,
      onConnected,
    }: {
      children: React.ReactNode;
      onConnected?: () => void;
    }) => {
      mocks.onConnected = onConnected ?? null;
      return children;
    },
    useConnectionState: () => mocks.connectionState,
    useVoiceAssistant: () => mocks.voiceAssistant,
    useDataChannel: (
      topic: string,
      callback: (message: DataMessage) => void
    ) => {
      ReactModule.useEffect(() => {
        mocks.dataCallbacks.set(topic, callback);
        return () => {
          if (mocks.dataCallbacks.get(topic) === callback) {
            mocks.dataCallbacks.delete(topic);
          }
        };
      }, [callback, topic]);
    },
  };
});

vi.mock("@/lib/interview/runtime-connection-confirmation", () => ({
  confirmInterviewRuntimeReady: mocks.confirmReady,
}));

vi.mock("@/lib/analytics/analytics-service", () => ({
  analytics: { track: mocks.track },
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

function roomElement(input?: {
  credentialGeneration?: number;
  onConnectionStateChange?: (status: InterviewConnectionStatus) => void;
  onTranscriptUpdate?: (turn: TranscriptTurn) => void;
}) {
  return (
    <LiveKitRoomWrapper
      token="synthetic-token"
      url="wss://synthetic.livekit.cloud"
      roomName={ROOM_NAME}
      sessionId={SESSION_ID}
      credentialGeneration={input?.credentialGeneration ?? 1}
      onTranscriptUpdate={input?.onTranscriptUpdate ?? vi.fn()}
      onAgentStateChange={vi.fn()}
      onConnectionStateChange={input?.onConnectionStateChange ?? vi.fn()}
      onTranscriptIntegrityChange={vi.fn()}
    >
      <div>Interview room</div>
    </LiveKitRoomWrapper>
  );
}

function canonicalDelayed() {
  return {
    status: "delayed" as const,
    reason: "readiness_deadline_exceeded" as const,
    attempts: 9,
    durationMs: 25_000,
  };
}

function canonicalReady() {
  return { status: "ready" as const, attempts: 1, durationMs: 30 };
}

function interviewerTranscript(sequence = 1) {
  return createTranscriptEvent({
    event_id: `synthetic-event-${sequence}`,
    writer_id: "synthetic-writer",
    writer_generation: 1,
    sequence,
    session_id: SESSION_ID,
    room_name: ROOM_NAME,
    speaker: "interviewer",
    text: "Synthetic interviewer fixture.",
    started_at: "2026-08-09T18:00:00.000Z",
    ended_at: "2026-08-09T18:00:01.000Z",
    audio_duration_ms: 1_000,
    section: "opening",
    delivery_state: "delivered",
  });
}

describe("LiveKit interviewer liveness reconciliation", () => {
  beforeEach(() => {
    mocks.connectionState = "connected";
    mocks.voiceAssistant = { agent: null, state: "connecting" };
    mocks.dataCallbacks.clear();
    mocks.onConnected = null;
    mocks.confirmReady.mockReset();
    mocks.track.mockReset();
  });

  afterEach(() => cleanup());

  it("reports a hung transport once at the connection SLO without rotating credentials", () => {
    vi.useFakeTimers();
    try {
      const statuses: InterviewConnectionStatus[] = [];
      mocks.connectionState = "connecting";
      render(
        roomElement({
          credentialGeneration: 7,
          onConnectionStateChange: (status) => statuses.push(status),
        })
      );

      act(() => vi.advanceTimersByTime(10_000));

      expect(
        statuses.filter((status) => status === "transport_delayed")
      ).toHaveLength(1);
      expect(
        mocks.track.mock.calls.filter(
          ([event, properties]) =>
            event === "interview_start_stage" &&
            properties?.stage === "transport_connection" &&
            properties?.outcome === "delayed"
        )
      ).toHaveLength(1);

      act(() => vi.advanceTimersByTime(30_000));
      expect(
        statuses.filter((status) => status === "transport_delayed")
      ).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  for (const conversationalState of ["speaking", "listening"] as const) {
    it(`keeps ${conversationalState} conversation available through late canonical success`, async () => {
      const statuses: string[] = [];
      mocks.confirmReady
        .mockResolvedValueOnce(canonicalDelayed())
        .mockResolvedValueOnce(canonicalReady());
      const element = () =>
        roomElement({
          onConnectionStateChange: (status) => statuses.push(status),
        });
      const view = render(element());

      await waitFor(() => expect(statuses).toContain("delayed"));

      mocks.voiceAssistant = {
        agent: { identity: "synthetic-agent", isActive: true },
        state: conversationalState,
      };
      view.rerender(element());

      await waitFor(() => expect(statuses).toContain("syncing"));
      await waitFor(() => expect(statuses.at(-1)).toBe("connected"));
      const syncingIndex = statuses.indexOf("syncing");
      expect(statuses.slice(syncingIndex)).not.toContain("delayed");
      expect(mocks.confirmReady).toHaveBeenCalledTimes(2);
    });
  }

  it("uses the first correlated agent transcript as verified liveness and prompts repair", async () => {
    const statuses: string[] = [];
    const transcriptUpdates = vi.fn();
    const repair = deferred<ReturnType<typeof canonicalReady>>();
    mocks.confirmReady
      .mockResolvedValueOnce(canonicalDelayed())
      .mockReturnValueOnce(repair.promise);
    render(
      roomElement({
        onConnectionStateChange: (status) => statuses.push(status),
        onTranscriptUpdate: transcriptUpdates,
      })
    );

    await waitFor(() => expect(statuses).toContain("delayed"));
    await waitFor(() =>
      expect(mocks.dataCallbacks.has("transcript")).toBe(true)
    );

    act(() => {
      mocks.dataCallbacks.get("transcript")?.({
        payload: new TextEncoder().encode(
          JSON.stringify(interviewerTranscript())
        ),
        from: { identity: "synthetic-agent", isAgent: true },
      });
    });

    await waitFor(() => expect(statuses).toContain("syncing"));
    expect(transcriptUpdates).toHaveBeenCalledTimes(1);
    expect(mocks.confirmReady).toHaveBeenCalledTimes(2);

    repair.resolve(canonicalReady());
    await waitFor(() => expect(statuses.at(-1)).toBe("connected"));
  });

  it("does not accept an interviewer-shaped packet from a non-agent participant as liveness", async () => {
    const statuses: string[] = [];
    mocks.confirmReady.mockResolvedValueOnce(canonicalDelayed());
    render(
      roomElement({
        onConnectionStateChange: (status) => statuses.push(status),
      })
    );

    await waitFor(() => expect(statuses.at(-1)).toBe("delayed"));
    await waitFor(() =>
      expect(mocks.dataCallbacks.has("transcript")).toBe(true)
    );

    act(() => {
      mocks.dataCallbacks.get("transcript")?.({
        payload: new TextEncoder().encode(
          JSON.stringify(interviewerTranscript())
        ),
        from: { identity: "synthetic-candidate", isAgent: false },
      });
    });

    expect(statuses.at(-1)).toBe("delayed");
    expect(statuses).not.toContain("syncing");
    expect(mocks.confirmReady).toHaveBeenCalledTimes(1);
  });

  it("keeps verified liveness across a reconnect credential remount", async () => {
    const statuses: string[] = [];
    const firstRepair = deferred<ReturnType<typeof canonicalReady>>();
    const reconnectRepair = deferred<ReturnType<typeof canonicalReady>>();
    mocks.confirmReady
      .mockResolvedValueOnce(canonicalDelayed())
      .mockReturnValueOnce(firstRepair.promise)
      .mockReturnValueOnce(reconnectRepair.promise);
    const element = (credentialGeneration: number) =>
      roomElement({
        credentialGeneration,
        onConnectionStateChange: (status) => statuses.push(status),
      });
    const view = render(element(1));

    await waitFor(() => expect(statuses.at(-1)).toBe("delayed"));
    mocks.voiceAssistant = {
      agent: { identity: "synthetic-agent", isActive: true },
      state: "speaking",
    };
    view.rerender(element(1));
    await waitFor(() => expect(statuses).toContain("syncing"));
    await waitFor(() => expect(mocks.confirmReady).toHaveBeenCalledTimes(2));

    mocks.voiceAssistant = { agent: null, state: "connecting" };
    view.rerender(element(2));

    await waitFor(() => expect(mocks.confirmReady).toHaveBeenCalledTimes(3));
    expect(statuses.at(-1)).toBe("syncing");
    expect(statuses.slice(statuses.lastIndexOf("syncing"))).not.toContain(
      "delayed"
    );
  });

  it("does not let an aborted stale confirmation overwrite recovered truth", async () => {
    const statuses: string[] = [];
    const first = deferred<ReturnType<typeof canonicalDelayed>>();
    const second = deferred<ReturnType<typeof canonicalReady>>();
    mocks.confirmReady
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const element = () =>
      roomElement({
        onConnectionStateChange: (status) => statuses.push(status),
      });
    const view = render(element());

    await waitFor(() => expect(mocks.confirmReady).toHaveBeenCalledTimes(1));
    mocks.connectionState = "reconnecting";
    view.rerender(element());
    await waitFor(() => expect(statuses.at(-1)).toBe("reconnecting"));
    mocks.connectionState = "connected";
    view.rerender(element());
    await waitFor(() => expect(mocks.confirmReady).toHaveBeenCalledTimes(2));

    second.resolve(canonicalReady());
    await waitFor(() => expect(statuses.at(-1)).toBe("recovered"));
    first.resolve(canonicalDelayed());
    await act(async () => Promise.resolve());

    expect(statuses.at(-1)).toBe("recovered");
    expect(statuses.slice(statuses.lastIndexOf("recovered") + 1)).not.toContain(
      "delayed"
    );
  });

  it("aborts canonical confirmation when the room unmounts", async () => {
    const pending = deferred<ReturnType<typeof canonicalReady>>();
    mocks.confirmReady.mockReturnValueOnce(pending.promise);
    const view = render(roomElement());

    await waitFor(() => expect(mocks.confirmReady).toHaveBeenCalledTimes(1));
    const signal = mocks.confirmReady.mock.calls[0]?.[0]?.signal as AbortSignal;
    expect(signal.aborted).toBe(false);

    view.unmount();

    expect(signal.aborted).toBe(true);
  });
});
