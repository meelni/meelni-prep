const OPIK_RUNTIME_VALUES = Object.freeze({
  OPIK_TRACING_ENABLED: "true",
  OPIK_WORKSPACE: "savi-singh",
  OPIK_PROJECT_NAME: "meelni",
  OPIK_CAPTURE_CONTENT: "true",
});

const OPIK_KEYS = Object.freeze([
  "OPIK_TRACING_ENABLED",
  "OPIK_API_KEY",
  "OPIK_WORKSPACE",
  "OPIK_PROJECT_NAME",
  "OPIK_CAPTURE_CONTENT",
]);

export function assertLiveKitProductionRuntimeSecrets(
  text,
  { includeTranscriptSecret }
) {
  const expectedKeys = includeTranscriptSecret
    ? ["MEELNI_TRANSCRIPT_INGEST_SECRET", ...OPIK_KEYS]
    : [...OPIK_KEYS];
  const values = parseExactEnvironment(text, expectedKeys);

  if (
    includeTranscriptSecret &&
    !/^[A-Za-z0-9_-]{32,}$/.test(values.MEELNI_TRANSCRIPT_INGEST_SECRET)
  ) {
    throw new Error("livekit_runtime_secrets_invalid");
  }
  if (!/^[A-Za-z0-9._-]{20,4096}$/.test(values.OPIK_API_KEY)) {
    throw new Error("livekit_runtime_secrets_invalid");
  }
  for (const [name, expected] of Object.entries(OPIK_RUNTIME_VALUES)) {
    if (values[name] !== expected) {
      throw new Error("livekit_runtime_secrets_invalid");
    }
  }
}

function parseExactEnvironment(text, expectedKeys) {
  if (typeof text !== "string" || /\r/.test(text)) {
    throw new Error("livekit_runtime_secrets_invalid");
  }
  const lines = text.endsWith("\n")
    ? text.slice(0, -1).split("\n")
    : text.split("\n");
  if (lines.length !== expectedKeys.length || lines.some((line) => !line)) {
    throw new Error("livekit_runtime_secrets_invalid");
  }

  const values = {};
  for (const line of lines) {
    const separator = line.indexOf("=");
    if (separator <= 0) throw new Error("livekit_runtime_secrets_invalid");
    const name = line.slice(0, separator);
    const value = line.slice(separator + 1);
    if (!expectedKeys.includes(name) || Object.hasOwn(values, name) || !value) {
      throw new Error("livekit_runtime_secrets_invalid");
    }
    values[name] = value;
  }
  if (expectedKeys.some((name) => !Object.hasOwn(values, name))) {
    throw new Error("livekit_runtime_secrets_invalid");
  }
  return values;
}
