# Launch The Adaptive Interviewer For Production Customers

Status: accepted

Date: 2026-08-21

## Decision

The product owner authorizes the adaptive interviewer for ordinary authenticated
Production interviews. We will not create another customer environment. The
existing durable interview start is the pre-room admission boundary: the web
server signs a closed, session-specific `candidate_default` admission with the
LiveKit shared secret, and the Production worker verifies it before constructing
the reviewed OpenAI Responses Director.

The Director remains advisory. Its recommendation can affect an interview only
through the existing synchronous influence gate, request assessor, deterministic
controller reducer, fresh lifecycle authority and canonical delivery path.
Transcript persistence, feedback evaluation and credit settlement are unchanged.

## Exact launch configuration

- stage `candidate_default`, environment `production`, cohort `canary`,
  exposure `default`;
- configuration SHA-256
  `21743eb810fed7d64c3564aa194e2f09ab75463e3318fbdc6f33936531ef6423`;
- selected adapter SHA-256
  `b8cc8547c6d2573b7d323b3327ab31bf74c237a1486c13e0e7780a63880e25ac`;
- repository rollout configuration SHA-256
  `ff50893d0bc9e3dea640e61323c79f4fe51381264ba98c6cec18f17b341cd042`;
- OpenAI Responses adapter v1, direct endpoint, model
  `gpt-5.4-mini-2026-03-17`, retry count zero;
- ten attempts, 100,000,000 nano-USD reserved per attempt,
  1,000,000,000 nano-USD per-session ceiling and 750 ms deadline.

## Rollback

Turning off the exact Production launch configuration stops new signed
admissions. Restoring the ordinary eight-key LiveKit worker snapshot removes
provider construction for newly assigned work and drains the replaced worker;
an already-running session settles through its reviewed lifecycle rather than
claiming an instant active-session flag mutation. No rollback deletes
transcript, feedback, credit or historical evidence.

## Evidence honesty

The owner accepts direct Production launch risk because there are currently no
other users. The earlier Shadow work proves isolation and contracts, not a full
28-cell live-quality matrix. The first owner Production interview is the launch
smoke, and no numerical feedback score will be inferred when rubric coverage is
insufficient.
