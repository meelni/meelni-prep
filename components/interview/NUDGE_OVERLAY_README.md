# NudgeOverlay Prototype

`NudgeOverlay` is dormant reference code. It is not wired into the
authenticated full mock interview.

The canonical full-mock contract is defined in
`docs/contracts/livekit-room-metadata.md`:

- `hintMode` is normalized to `off` at the TypeScript and Python boundaries;
- the room exposes no hint toggle;
- transcript turns do not call `/api/nudges/analyze`;
- no nudge overlay is rendered; and
- no hint display or dismissal analytics are emitted.

Do not reconnect this component to `/interview` as an implementation shortcut.
Any future guided-practice experience needs a separately accepted product and
runtime contract, a supported non-`off` mode, privacy-minimized analytics at the
actual display seam, accessibility verification, and provider-free regression
tests before this prototype can become production behavior.
