"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { toSafeErrorLog } from "@/lib/privacy/safe-error";

export interface InterviewMicrophoneParticipant {
  readonly isMicrophoneEnabled: boolean;
  setMicrophoneEnabled(enabled: boolean): Promise<unknown>;
}

interface UseAcknowledgedMicrophoneInput {
  participant: InterviewMicrophoneParticipant;
  actualEnabled: boolean;
  canUseMicrophone: boolean;
  autoActivate: boolean;
  providerError?: Error;
  onAutoActivationAcknowledged: () => void;
  onUserToggleAcknowledged: (enabled: boolean) => void;
}

type MicrophoneRequestOrigin = "automatic" | "safety" | "user";

const MICROPHONE_UNAVAILABLE_MESSAGE =
  "Microphone unavailable. Check your browser permission or device, then try again.";

export function useAcknowledgedMicrophone({
  participant,
  actualEnabled,
  canUseMicrophone,
  autoActivate,
  providerError,
  onAutoActivationAcknowledged,
  onUserToggleAcknowledged,
}: UseAcknowledgedMicrophoneInput) {
  const [pending, setPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const canUseMicrophoneRef = useRef(canUseMicrophone);
  const pendingCountRef = useRef(0);
  const latestRequestIdRef = useRef(0);
  const scheduledTargetRef = useRef(actualEnabled);
  const operationQueueRef = useRef(Promise.resolve());
  const onAutoActivationAcknowledgedRef = useRef(onAutoActivationAcknowledged);
  const onUserToggleAcknowledgedRef = useRef(onUserToggleAcknowledged);

  canUseMicrophoneRef.current = canUseMicrophone;
  onAutoActivationAcknowledgedRef.current = onAutoActivationAcknowledged;
  onUserToggleAcknowledgedRef.current = onUserToggleAcknowledged;

  const enqueueMicrophoneRequest = useCallback(
    (
      requestedEnabled: boolean,
      origin: MicrophoneRequestOrigin,
      force = false
    ) => {
      const targetEnabled = requestedEnabled && canUseMicrophoneRef.current;
      if (!force && scheduledTargetRef.current === targetEnabled) return;

      scheduledTargetRef.current = targetEnabled;
      const requestId = ++latestRequestIdRef.current;
      pendingCountRef.current += 1;
      if (mountedRef.current) {
        setPending(true);
        if (origin !== "safety") setErrorMessage(null);
      }

      const runRequest = async () => {
        const staleEnable =
          targetEnabled &&
          (requestId !== latestRequestIdRef.current ||
            !canUseMicrophoneRef.current);
        if (staleEnable) return;
        if (participant.isMicrophoneEnabled === targetEnabled) return;

        try {
          await participant.setMicrophoneEnabled(targetEnabled);

          const acknowledged =
            participant.isMicrophoneEnabled === targetEnabled;
          if (!acknowledged) {
            throw new Error("LiveKit did not acknowledge microphone state");
          }

          const superseded =
            requestId !== latestRequestIdRef.current ||
            (targetEnabled && !canUseMicrophoneRef.current);
          if (superseded || !mountedRef.current) return;

          setErrorMessage(null);
          if (origin === "automatic" && targetEnabled) {
            onAutoActivationAcknowledgedRef.current();
          } else if (origin === "user") {
            onUserToggleAcknowledgedRef.current(targetEnabled);
          }
        } catch (error) {
          if (requestId !== latestRequestIdRef.current || !mountedRef.current) {
            return;
          }
          console.error("[Interview] microphone_update_failed", {
            code: targetEnabled
              ? "microphone_enable_failed"
              : "microphone_disable_failed",
            ...toSafeErrorLog(error),
          });
          setErrorMessage(MICROPHONE_UNAVAILABLE_MESSAGE);
        }
      };

      operationQueueRef.current = operationQueueRef.current
        .catch(() => undefined)
        .then(runRequest)
        .finally(() => {
          pendingCountRef.current = Math.max(0, pendingCountRef.current - 1);
          if (mountedRef.current && pendingCountRef.current === 0) {
            setPending(false);
          }
        });
    },
    [participant]
  );

  useEffect(() => {
    if (!canUseMicrophone) {
      enqueueMicrophoneRequest(false, "safety");
      return;
    }
    if (autoActivate) {
      enqueueMicrophoneRequest(true, "automatic");
    }
  }, [autoActivate, canUseMicrophone, enqueueMicrophoneRequest]);

  useEffect(() => {
    if (actualEnabled) {
      setErrorMessage(null);
    } else if (providerError && canUseMicrophone && !pending) {
      setErrorMessage(MICROPHONE_UNAVAILABLE_MESSAGE);
    }
  }, [actualEnabled, canUseMicrophone, pending, providerError]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      canUseMicrophoneRef.current = false;
      scheduledTargetRef.current = false;
      latestRequestIdRef.current += 1;
      operationQueueRef.current = operationQueueRef.current
        .catch(() => undefined)
        .then(async () => {
          if (participant.isMicrophoneEnabled) {
            await participant
              .setMicrophoneEnabled(false)
              .catch(() => undefined);
          }
        });
    };
  }, [participant]);

  const toggle = useCallback(() => {
    if (!canUseMicrophoneRef.current || pendingCountRef.current > 0) return;
    enqueueMicrophoneRequest(!participant.isMicrophoneEnabled, "user", true);
  }, [enqueueMicrophoneRequest, participant]);

  return {
    enabled: actualEnabled,
    pending,
    errorMessage,
    toggle,
  };
}
