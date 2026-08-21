# Design: Control-Plane Activation Environment

Introduce a pure control-plane environment parser containing the existing
64-KiB bound, `DATABASE_URL` identity policy and exact Preview/staging markers.
The `activate` and durable `stop` commands consume only this result.

The Preview LiveKit parser composes the control-plane parser and then requires
the existing canonical Preview URL, public URL, agent name, API key and API
secret. The Production-project parser stays independent and unchanged. Every
parser reads only the explicit owner-only external file supplied by the
operator; there is no ambient fallback.
