// @vitest-environment jsdom

import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  useAcknowledgedMicrophone,
  type InterviewMicrophoneParticipant,
} from "./use-acknowledged-microphone";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((settle, fail) => {
    resolve = settle;
    reject = fail;
  });
  return { promise, resolve, reject };
}

function microphoneFixture(
  update: (enabled: boolean) => Promise<unknown> = async () => ({})
) {
  let enabled = false;
  const setMicrophoneEnabled = vi.fn(async (nextEnabled: boolean) => {
    const result = await update(nextEnabled);
    enabled = nextEnabled;
    return result;
  });
  const participant: InterviewMicrophoneParticipant = {
    get isMicrophoneEnabled() {
      return enabled;
    },
    setMicrophoneEnabled,
  };
  return {
    participant,
    setMicrophoneEnabled,
    isEnabled: () => enabled,
  };
}

describe("acknowledged interview microphone", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("publishes exactly once when canonical conversation readiness arrives", async () => {
    const fixture = microphoneFixture();
    const onAutoActivationAcknowledged = vi.fn();
    const { rerender } = renderHook(
      ({ canUseMicrophone, autoActivate }) =>
        useAcknowledgedMicrophone({
          participant: fixture.participant,
          actualEnabled: fixture.isEnabled(),
          canUseMicrophone,
          autoActivate,
          onAutoActivationAcknowledged,
          onUserToggleAcknowledged: vi.fn(),
        }),
      {
        initialProps: { canUseMicrophone: false, autoActivate: true },
      }
    );

    expect(fixture.setMicrophoneEnabled).not.toHaveBeenCalled();

    rerender({ canUseMicrophone: true, autoActivate: true });
    await waitFor(() =>
      expect(onAutoActivationAcknowledged).toHaveBeenCalledTimes(1)
    );
    rerender({ canUseMicrophone: true, autoActivate: false });

    expect(fixture.setMicrophoneEnabled).toHaveBeenCalledTimes(1);
    expect(fixture.setMicrophoneEnabled).toHaveBeenCalledWith(true);
  });

  it("turns off for reconnect and never automatically re-enables afterward", async () => {
    const fixture = microphoneFixture();
    const onAutoActivationAcknowledged = vi.fn();
    const { rerender } = renderHook(
      ({ canUseMicrophone, autoActivate }) =>
        useAcknowledgedMicrophone({
          participant: fixture.participant,
          actualEnabled: fixture.isEnabled(),
          canUseMicrophone,
          autoActivate,
          onAutoActivationAcknowledged,
          onUserToggleAcknowledged: vi.fn(),
        }),
      {
        initialProps: { canUseMicrophone: true, autoActivate: true },
      }
    );

    await waitFor(() => expect(fixture.isEnabled()).toBe(true));
    rerender({ canUseMicrophone: true, autoActivate: false });
    rerender({ canUseMicrophone: false, autoActivate: false });
    await waitFor(() => expect(fixture.isEnabled()).toBe(false));

    rerender({ canUseMicrophone: true, autoActivate: false });
    await act(async () => Promise.resolve());

    expect(fixture.setMicrophoneEnabled.mock.calls).toEqual([[true], [false]]);
  });

  it("keeps the microphone off when stale readiness arrives after the deadline", async () => {
    const fixture = microphoneFixture();
    const onAutoActivationAcknowledged = vi.fn();
    const { rerender } = renderHook(
      ({ canUseMicrophone, autoActivate }) =>
        useAcknowledgedMicrophone({
          participant: fixture.participant,
          actualEnabled: fixture.isEnabled(),
          canUseMicrophone,
          autoActivate,
          onAutoActivationAcknowledged,
          onUserToggleAcknowledged: vi.fn(),
        }),
      {
        initialProps: { canUseMicrophone: true, autoActivate: true },
      }
    );

    await waitFor(() => expect(fixture.isEnabled()).toBe(true));
    rerender({ canUseMicrophone: false, autoActivate: false });
    await waitFor(() => expect(fixture.isEnabled()).toBe(false));
    rerender({ canUseMicrophone: false, autoActivate: true });
    await act(async () => Promise.resolve());

    expect(fixture.setMicrophoneEnabled.mock.calls).toEqual([[true], [false]]);
  });

  it("serializes a pending enable with a safety disable", async () => {
    const enable = deferred<unknown>();
    const fixture = microphoneFixture((enabled) =>
      enabled ? enable.promise : Promise.resolve(undefined)
    );
    const onAutoActivationAcknowledged = vi.fn();
    const { rerender } = renderHook(
      ({ canUseMicrophone }) =>
        useAcknowledgedMicrophone({
          participant: fixture.participant,
          actualEnabled: fixture.isEnabled(),
          canUseMicrophone,
          autoActivate: true,
          onAutoActivationAcknowledged,
          onUserToggleAcknowledged: vi.fn(),
        }),
      { initialProps: { canUseMicrophone: true } }
    );

    await waitFor(() =>
      expect(fixture.setMicrophoneEnabled).toHaveBeenCalledWith(true)
    );
    rerender({ canUseMicrophone: false });
    expect(fixture.setMicrophoneEnabled).toHaveBeenCalledTimes(1);

    enable.resolve({});
    await waitFor(() =>
      expect(fixture.setMicrophoneEnabled.mock.calls).toEqual([[true], [false]])
    );
    expect(onAutoActivationAcknowledged).not.toHaveBeenCalled();
  });

  it("keeps actual state off and exposes recovery when enable is rejected", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const fixture = microphoneFixture(async (enabled) => {
      if (enabled) throw new Error("synthetic permission rejection");
      return undefined;
    });
    const onAutoActivationAcknowledged = vi.fn();
    const { result } = renderHook(() =>
      useAcknowledgedMicrophone({
        participant: fixture.participant,
        actualEnabled: fixture.isEnabled(),
        canUseMicrophone: true,
        autoActivate: true,
        onAutoActivationAcknowledged,
        onUserToggleAcknowledged: vi.fn(),
      })
    );

    await waitFor(() => expect(result.current.errorMessage).not.toBeNull());

    expect(result.current.enabled).toBe(false);
    expect(fixture.isEnabled()).toBe(false);
    expect(onAutoActivationAcknowledged).not.toHaveBeenCalled();
  });

  it("reports a user toggle only after provider acknowledgement", async () => {
    const enable = deferred<unknown>();
    const fixture = microphoneFixture((enabled) =>
      enabled ? enable.promise : Promise.resolve(undefined)
    );
    const onUserToggleAcknowledged = vi.fn();
    const { result } = renderHook(() =>
      useAcknowledgedMicrophone({
        participant: fixture.participant,
        actualEnabled: fixture.isEnabled(),
        canUseMicrophone: true,
        autoActivate: false,
        onAutoActivationAcknowledged: vi.fn(),
        onUserToggleAcknowledged,
      })
    );

    act(() => {
      result.current.toggle();
      result.current.toggle();
    });
    await waitFor(() =>
      expect(fixture.setMicrophoneEnabled).toHaveBeenCalledTimes(1)
    );
    expect(onUserToggleAcknowledged).not.toHaveBeenCalled();
    expect(result.current.enabled).toBe(false);

    enable.resolve({});
    await waitFor(() =>
      expect(onUserToggleAcknowledged).toHaveBeenCalledWith(true)
    );
  });
});
