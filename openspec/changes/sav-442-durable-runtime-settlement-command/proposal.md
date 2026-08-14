# SAV-442 durable runtime-settlement command

## Why

Explicit End currently stores the semantic cutoff but represents the remaining
runtime work only as a LiveKit packet. A lost packet, candidate disconnect, or
agent shutdown can therefore hide accepted settlement intent from the writer.

## What changes

- End acceptance atomically inserts one versioned settlement command for the
  current registered writer generation.
- The signed internal transcript boundary accepts strict metadata-only command
  pull and acknowledgement messages.
- The packet becomes a wake-up hint; the Python runtime also pulls on exact
  candidate disconnect and shutdown.
- The bounded finalizer waits on the durable command and terminally classifies
  a missing acknowledgement before freezing database evidence.

## Boundaries

- Canonical transcript rows and frozen writer watermarks remain evidence truth.
- No score policy, feedback UI, provider configuration, Production mutation,
  or SAV-439 attempt-history work is included.
- All fixtures are synthetic and content-free.
