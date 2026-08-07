/** @type {import("dependency-cruiser").IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "no-unresolvable-imports",
      severity: "error",
      from: {},
      to: {
        couldNotResolve: true,
      },
    },
    {
      name: "no-undeclared-packages",
      severity: "error",
      from: {},
      to: {
        dependencyTypes: ["npm-no-pkg", "npm-unknown"],
      },
    },
    {
      name: "no-package-deep-imports",
      severity: "error",
      comment:
        "Consumers should import workspace packages through their public entrypoints.",
      from: {
        pathNot: "^packages/(core|agent|integrations|test-fixtures)/",
      },
      to: {
        path: "^packages/(core|agent|test-fixtures)/src/(?!index[.]ts$)|^packages/integrations/src/(?!(?:index|opik)[.]ts$)",
      },
    },
    {
      name: "core-stays-provider-independent",
      severity: "error",
      from: {
        path: "^packages/core/",
      },
      to: {
        path: "^(app|components|lib|agent|packages/(agent|integrations))/",
      },
    },
    {
      name: "agent-package-stays-runtime-contracts",
      severity: "error",
      from: {
        path: "^packages/agent/",
      },
      to: {
        path: "^(app|components|lib|packages/integrations)/",
      },
    },
    {
      name: "integrations-do-not-import-app-code",
      severity: "error",
      from: {
        path: "^packages/integrations/",
      },
      to: {
        path: "^(app|components|lib)/",
      },
    },
    {
      name: "no-circular-dependencies",
      severity: "warn",
      from: {},
      to: {
        circular: true,
      },
    },
  ],
  options: {
    combinedDependencies: true,
    doNotFollow: {
      path: ["node_modules"],
    },
    exclude: {
      path: [
        "^node_modules/",
        "^\\.next/",
        "^out/",
        "^build/",
        "^scripts/generated/",
        "^coverage/",
        "^agent/venv/",
        "^archive/",
        "^\\.vercel/",
      ],
    },
    enhancedResolveOptions: {
      extensions: [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json"],
    },
    tsConfig: {
      fileName: "tsconfig.json",
    },
  },
};
