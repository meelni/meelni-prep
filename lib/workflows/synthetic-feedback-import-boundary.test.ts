import assert from "node:assert/strict";
import test from "node:test";

const PRODUCTION_CONFIGURATION_KEYS = [
  "DATABASE_URL",
  "INNGEST_EVENT_KEY",
  "INNGEST_SIGNING_KEY",
  "OPENAI_API_KEY",
  "OPENAI_BASE_URL",
  "OPIK_API_KEY",
  "OPIK_LOG_LEVEL",
  "SUPABASE_SERVICE_ROLE_KEY",
] as const;

test("provider-free worker never reads inherited Production/provider configuration", async () => {
  const inheritedEnvironment = process.env;
  const reads = new Set<string>();
  process.env = new Proxy(inheritedEnvironment, {
    get(target, property, receiver) {
      if (
        typeof property === "string" &&
        PRODUCTION_CONFIGURATION_KEYS.includes(
          property as (typeof PRODUCTION_CONFIGURATION_KEYS)[number]
        )
      ) {
        reads.add(property);
        return "synthetic-inherited-configuration-must-stay-unread";
      }
      return Reflect.get(target, property, receiver);
    },
  });
  try {
    const { createSyntheticFeedbackBundle } = await import(
      "./synthetic-feedback-runner"
    );
    const bundle = await createSyntheticFeedbackBundle([
      "normal-product-sense",
    ]);
    assert.equal(bundle.artifacts.length, 1);
  } finally {
    process.env = inheritedEnvironment;
  }

  assert.deepEqual(
    PRODUCTION_CONFIGURATION_KEYS.filter((key) => reads.has(key)),
    []
  );
});

test("provider-free execution never mutates the parent environment", async () => {
  const inheritedEnvironment = process.env;
  process.env = new Proxy(inheritedEnvironment, {
    get(target, property, receiver) {
      if (property === "OPENAI_API_KEY") {
        return "concurrent-production-sentinel";
      }
      return Reflect.get(target, property, receiver);
    },
  });
  try {
    const { createSyntheticFeedbackBundle } = await import(
      "./synthetic-feedback-runner"
    );
    const pending = createSyntheticFeedbackBundle(["normal-product-sense"]);
    assert.equal(process.env.OPENAI_API_KEY, "concurrent-production-sentinel");
    const bundle = await pending;
    assert.equal(bundle.artifacts.length, 1);
    assert.equal(process.env.OPENAI_API_KEY, "concurrent-production-sentinel");
  } finally {
    process.env = inheritedEnvironment;
  }
});
