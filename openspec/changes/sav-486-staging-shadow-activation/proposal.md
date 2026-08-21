# Proposal: Staging-Side Shadow Activation

Allow the exact owner-signed Preview-shadow activation to execute within the
trusted staging server so the Preview database password remains inside Vercel.
Preserve the existing owner verifier, durable one-use CAS and every separate
LiveKit/Production boundary.
