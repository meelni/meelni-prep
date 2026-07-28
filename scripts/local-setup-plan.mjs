export function createNodeInstallPlan({
  nodeModulesExists,
  packageLockExists,
}) {
  if (!packageLockExists) {
    throw new Error(
      "package-lock.json is required for deterministic local setup."
    );
  }

  return nodeModulesExists
    ? {
        label: "incremental npm install",
        args: ["install", "--no-audit", "--no-fund"],
      }
    : {
        label: "clean npm ci",
        args: ["ci", "--no-audit", "--no-fund"],
      };
}
