# Adaptive Interviewer Production Launch

## Preconditions

1. Exact candidate passes local validation, exact-range security review, ready
   PR review and terminal hosted CI.
2. Human owner records Production/default-on GO for the exact merged candidate.
3. Production web and ordinary interview worker use the same launch
   configuration SHA-256.
4. Ordinary eight-key worker snapshot is held as the rollback target.

## Release order

1. Merge through branch protection.
2. Apply the guarded Production web launch configuration and redeploy the exact
   merged source.
3. Apply the guarded adaptive ordinary-worker secret snapshot and deploy the
   same source to the canonical Production interview agent.
4. Verify web source, worker source/version and all five exact flags.
5. The owner starts one ordinary Production interview from the real product.
6. Confirm room admission, Director planned/admitted/delivery counters,
   transcript settlement, feedback outcome and credit settlement without
   recording transcript content in operational evidence.

## Stop and rollback

If admission verification, provider construction, latency, lifecycle, delivery,
transcript, feedback or credit evidence is unexpected:

1. disable Director influence in the guarded Production web/worker config;
2. restore the ordinary eight-key worker snapshot and deploy it;
3. remove the Production launch admission config from the web and redeploy;
4. let in-flight ordinary interviews settle through existing lifecycle paths;
5. record sanitized evidence and keep SAV-476 open.

Never use a raw `lk agent deploy`, unguarded Vercel environment mutation or
secret value in terminal/chat evidence for this release.
