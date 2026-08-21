# Design

The existing operator preserves the important authority ordering: owner
decision, durable allocation, one-use Production room action, then LiveKit
room and dispatch. On success it writes a private external v2 connection file
with exact source/config/session/expiry bindings and the short-lived browser
credential.

The Production web page is a server-gated owner tool and not a session
workflow. The browser reads the file locally, runs a strict bounded parser,
keeps the credential only in component memory, and mounts a dedicated
LiveKit/Meelni presentation that deliberately has no durable session API
dependencies. Disconnect clears memory and disables the microphone.

This avoids a new Production-to-staging control-plane channel, keeps normal
interview behavior untouched and still validates the actual deployed Meelni
web experience.

The route is enabled only by a one-use Production action that binds the exact
merged web candidate, READY source deployment, owner/run/worker values,
operation and bounded expiry. Vercel environment changes become active only
through the action's redeployment. An explicit disable redeploy and independent
one-hour server expiry close the route without changing ordinary interviews.
