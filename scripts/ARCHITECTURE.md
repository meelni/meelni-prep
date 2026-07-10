# Question Sync Architecture

The former script architecture described the retired text-only, direct-database, and verbose-output implementation. It has been removed to avoid maintaining a second source of truth.

The durable behavior contract is [Question bank](../docs/contracts/question-bank.md). Deployment, authorization, transaction semantics, composite identity, verification, and rollback are defined in [Question sync operations](../docs/operations/question-sync.md).
