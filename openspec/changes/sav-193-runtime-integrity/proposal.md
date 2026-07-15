# SAV-193 runtime integrity

## Why

The relaunch runtime can currently lose transcript evidence while still appearing settled: hard-deadline watermarks are timestamped after the accepted cutoff, reconnect cleanup deletes the room before requesting settlement, and a replacement writer can hide an earlier writer's missing evidence. Browser settings and logs also overstate privacy controls or expose content.

## Outcome

Every audible runtime writer is registered before output, every writer generation proves its own terminal persistence state, reconnect cleanup requests and observes settlement before room deletion, and incomplete evidence fails closed without feedback. The browser does not own transcript persistence or retry storage.

## Boundaries

- No feature-flag default change, Production action, live-mode provider action, customer transcript, or calibration call.
- Analytics-consent implementation remains a separate workstream.
- Legacy transcript rows remain readable; relaunch runtime writes use the stronger contract.
