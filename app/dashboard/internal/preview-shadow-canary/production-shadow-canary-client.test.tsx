// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_CONFIGURATION_SHA256,
  ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_SELECTED_CANDIDATE_SHA256,
} from "@meelni/agent";
import {
  PRODUCTION_WEB_SHADOW_CONNECTION_VERSION,
  PRODUCTION_WEB_SHADOW_LIVEKIT_URL,
} from "@/lib/interview/production-shadow-canary";

import { ProductionShadowCanaryClient } from "./production-shadow-canary-client";

vi.mock("@livekit/components-react", () => ({
  LiveKitRoom: ({ children }: { children: React.ReactNode }) => children,
  RoomAudioRenderer: () => null,
  useConnectionState: () => "disconnected",
  useDataChannel: () => undefined,
  useLocalParticipant: () => ({
    localParticipant: {
      isMicrophoneEnabled: false,
      setMicrophoneEnabled: vi.fn(),
    },
    isMicrophoneEnabled: false,
    lastMicrophoneError: undefined,
  }),
  useRoomContext: () => ({ disconnect: vi.fn() }),
  useVoiceAssistant: () => ({ agent: null, state: "idle" }),
  useConnectionQualityIndicator: () => ({ quality: "unknown" }),
  useTrackVolume: () => 0,
}));

const RUN = "1".repeat(64);
const LEASE = "2".repeat(64);
const BINDING = "3".repeat(64);
const CANDIDATE = "4".repeat(40);
const TOKEN = "header.private-payload.signature";

describe("Production web Shadow canary browser handoff", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("reads a private file locally without network or browser persistence", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const localStorageSpy = vi.spyOn(Storage.prototype, "setItem");
    render(
      <ProductionShadowCanaryClient
        expectedRunId={RUN}
        expectedCandidateGitSha={CANDIDATE}
      />
    );

    const input = screen.getByLabelText(/choose connection\.json/i);
    fireEvent.change(input, {
      target: {
        files: [privateFile(JSON.stringify(connection()))],
      },
    });

    await screen.findByText("Verified locally");
    expect(screen.queryByText(TOKEN)).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(localStorageSpy).not.toHaveBeenCalled();
    expect((input as HTMLInputElement).value).toBe("");
  });

  it("shows one generic error and exposes no credential for an invalid file", async () => {
    render(
      <ProductionShadowCanaryClient
        expectedRunId={RUN}
        expectedCandidateGitSha={CANDIDATE}
      />
    );
    const input = screen.getByLabelText(/choose connection\.json/i);
    fireEvent.change(input, {
      target: { files: [privateFile(`{"token":"${TOKEN}"}`)] },
    });

    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain(
        "invalid, expired, or belongs to another Shadow run"
      )
    );
    expect(screen.queryByText(TOKEN)).toBeNull();
  });
});

function connection() {
  return {
    contract_version: PRODUCTION_WEB_SHADOW_CONNECTION_VERSION,
    topology: "production_project_shadow",
    run_id: RUN,
    lease_id: LEASE,
    candidate_git_sha: CANDIDATE,
    preview_shadow_configuration_sha256:
      ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_CONFIGURATION_SHA256,
    selected_candidate_configuration_sha256:
      ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_SELECTED_CANDIDATE_SHA256,
    session_binding_sha256: BINDING,
    round: "product_sense",
    voice_condition: "baseline_final_turn",
    expires_at: new Date(Date.now() + 30 * 60 * 1_000)
      .toISOString()
      .replace(/\.\d{3}Z$/, ".000Z"),
    room: {
      roomName: `preview-shadow-${BINDING}`,
      token: TOKEN,
      url: PRODUCTION_WEB_SHADOW_LIVEKIT_URL,
    },
  };
}

function privateFile(contents: string): File {
  return {
    size: new TextEncoder().encode(contents).byteLength,
    text: async () => contents,
  } as File;
}
