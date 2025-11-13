### ADR-025: Agent State Debouncing for Smooth Transitions
- **Date**: 2025-11-08
- **Decision**: Implement debounced state transitions with grace periods to prevent UI flickering during natural speech pauses
- **Problem**: Agent state indicator was flickering between "speaking" and "listening" during brief pauses in agent speech (breath pauses, sentence breaks), creating confusing turn-taking signals
- **Solution**:
  - Add 600-700ms grace period before transitioning away from "speaking" state
  - Immediate updates when agent starts speaking (no delay)
  - Separate `debouncedAgentState` for UI display while internal state updates immediately
  - Smart timer management that clears pending transitions when new speech detected
- **Implementation**:
  - Demo modal: 600ms grace period (`components/demo-modal.tsx`)
  - Interview page: 700ms grace period (`app/interview/components/audio-visualizer.tsx`)
  - Uses React useRef for timer and timestamp tracking (no re-renders)
  - TypeScript-safe with proper type annotations
- **Code Pattern**:
  ```typescript
  // Track when agent was last speaking
  if (currentState === "speaking") {
    lastSpeakingTimeRef.current = Date.now();
    setDebouncedAgentState("speaking"); // Immediate
    clearTimeout(stateChangeTimerRef.current);
  }
  // Apply grace period when stopping
  else if (currentState !== "speaking" && debouncedAgentState === "speaking") {
    const timeSinceLastSpeaking = Date.now() - lastSpeakingTimeRef.current;
    if (timeSinceLastSpeaking < GRACE_PERIOD_MS) {
      stateChangeTimerRef.current = setTimeout(() => {
        setDebouncedAgentState(currentState);
      }, GRACE_PERIOD_MS - timeSinceLastSpeaking);
    }
  }
  ```
- **Consequences**:
  - Smoother UX with no flickering indicators
  - Zero delay on user interruptions (can still interrupt immediately)
  - Natural conversation flow maintained
  - Applies to both demo and main interview agents
- **Related Issues**: Fixes #105

