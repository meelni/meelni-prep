# Design

## Canonical thresholds

- Setup start request: target 3 seconds, browser upper bound 10 seconds.
- LiveKit transport connection: target 5 seconds, upper bound 10 seconds.
- Transport connected to canonical runtime ready: target 10 seconds, upper
  bound 25 seconds.
- One presence reconciliation request: hard deadline 3 seconds.
- Session and credential customer reads: hard deadline 8 seconds.

The 25-second readiness bound covers LiveKit Cloud's documented 10–20 second
agent cold-start range with delivery margin. Thresholds classify user-visible
latency; they do not claim Production SLO achievement before rollout evidence.

## State ownership

LiveKit connection means signaling and media transport are established. It does
not mean the interview is canonically active. Provider-verified candidate and
agent presence remains the activation boundary.

Readiness confirmation returns one of three outcomes:

- `ready`: canonical lifecycle is active/recovered;
- `terminal`: ownership or join authorization is gone; and
- `delayed`: the room remains transport-connected but provider reconciliation
  did not converge inside the customer upper bound.

Only a real LiveKit transport disconnection starts credential refresh. A
`delayed` canonical result keeps the room and token mounted, keeps microphone
input disabled, preserves End Interview, and schedules one later bounded
confirmation rather than overlapping probes.

## Request deadlines

The setup client aborts `/api/session/start` at the launch upper bound. The
stable start-attempt UUID remains stored because an abort is ambiguous: the
server may have committed. A retry replays the same intent and UUID.

Presence probes use a child abort controller with a three-second deadline while
also honoring component unmount. Session and token reads use the shared
customer deadline helper. No client wait can reach the platform function
ceiling.

## UI

The focused interview room remains mounted for delayed canonical readiness.
The connection indicator prioritizes canonical status over provider quality:
`Interviewer joining`, `Ready`, `Reconnecting`, `Connection restored`, or
`Disconnected`. After the readiness upper bound, calm inline copy explains the
delay. The microphone stays disabled; End Interview remains enabled.

## Telemetry

Start/readiness stage telemetry is versioned and allowlisted. It may contain
stage, outcome, duration, thresholds, and latency class. It must never contain
session, transcript, question, user, room, token, provider payload, or raw error
content.
