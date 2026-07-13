export const REQUIRED_NODE_VERSION = "22.22.0";

export function validateNodeRuntime(version = process.version) {
  const actualVersion = String(version).replace(/^v/, "");

  if (actualVersion === REQUIRED_NODE_VERSION) {
    return {
      ok: true,
      message: `Node v${actualVersion} matches the pinned runtime.`,
    };
  }

  return {
    ok: false,
    message:
      `Node v${actualVersion} is incompatible; Meelni requires exactly Node v${REQUIRED_NODE_VERSION}. ` +
      "Run `fnm use` or `nvm use` from the repository root, then retry.",
  };
}

export function assertNodeRuntime(version = process.version) {
  const result = validateNodeRuntime(version);

  if (!result.ok) {
    throw new Error(result.message);
  }

  return result;
}
