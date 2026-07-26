import { appendFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const FULL_SELECTION = Object.freeze({
  repository: false,
  static: true,
  tests: true,
  database: true,
  production: true,
});

const DOC_EXTENSIONS = new Set([
  ".gif",
  ".jpeg",
  ".jpg",
  ".json",
  ".md",
  ".mdx",
  ".pdf",
  ".png",
  ".svg",
  ".txt",
  ".webp",
  ".yaml",
  ".yml",
]);

const FORMATTED_DOC_EXTENSIONS = new Set([
  ".json",
  ".md",
  ".mdx",
  ".yaml",
  ".yml",
]);

const TOP_LEVEL_DOCS = new Set(["AGENTS.md", "DESIGN.md", "README.md"]);
const APPLICATION_ROOT_FILES = new Set([
  "components.json",
  "middleware.ts",
  "next.config.ts",
  "playwright.config.ts",
  "postcss.config.mjs",
]);

export function classifyChanges(entries) {
  if (!Array.isArray(entries) || entries.length === 0) {
    return full("empty-diff");
  }

  const changedPaths = [];
  for (const entry of entries) {
    if (
      !entry ||
      !["A", "M"].includes(entry.status) ||
      !Array.isArray(entry.paths) ||
      entry.paths.length !== 1
    ) {
      return full("non-additive-change");
    }

    const [path] = entry.paths;
    if (!isSafeRelativePath(path)) {
      return full("malformed-path");
    }
    changedPaths.push(path);
  }

  if (changedPaths.every(isDocumentationPath)) {
    return {
      mode: "documentation",
      reason: "documentation-only",
      files: changedPaths,
      selected: {
        repository: true,
        static: false,
        tests: false,
        database: false,
        production: false,
      },
    };
  }

  const selected = {
    repository: false,
    static: true,
    tests: true,
    database: false,
    production: false,
  };

  for (const path of changedPaths) {
    if (isDocumentationPath(path)) {
      continue;
    }
    if (path.startsWith("agent/")) {
      continue;
    }
    if (isMigrationPath(path)) {
      selected.database = true;
      continue;
    }
    if (isApplicationPath(path)) {
      selected.production = true;
      continue;
    }
    return full(`full-coverage:${topLevel(path)}`, changedPaths);
  }

  return {
    mode: "targeted",
    reason: "owned-paths",
    files: changedPaths,
    selected,
  };
}

export function parseNameStatus(output) {
  if (typeof output !== "string" || output.length === 0) {
    return [];
  }

  const tokens = output.split("\0");
  if (tokens.at(-1) === "") {
    tokens.pop();
  }

  const entries = [];
  for (let index = 0; index < tokens.length; ) {
    const statusToken = tokens[index++];
    if (!/^[A-Z][0-9]*$/.test(statusToken)) {
      throw new Error("Malformed git name-status output");
    }

    const status = statusToken[0];
    const pathCount = status === "R" || status === "C" ? 2 : 1;
    const paths = tokens.slice(index, index + pathCount);
    if (paths.length !== pathCount || paths.some((path) => path.length === 0)) {
      throw new Error("Incomplete git name-status output");
    }
    index += pathCount;
    entries.push({ status, paths });
  }
  return entries;
}

export function isDocumentationPath(path) {
  if (TOP_LEVEL_DOCS.has(path)) {
    return true;
  }
  if (
    !path.startsWith("docs/") &&
    !path.startsWith("openspec/") &&
    !path.startsWith(".agents/")
  ) {
    return false;
  }
  return DOC_EXTENSIONS.has(extension(path));
}

export function trackedTopLevelOwnership(name) {
  if (TOP_LEVEL_DOCS.has(name)) return "documentation";
  if (["docs", "openspec", ".agents"].includes(name)) return "documentation";
  if (name === "agent") return "agent";
  if (
    ["app", "apps", "components", "content", "public", "tests"].includes(
      name
    ) ||
    APPLICATION_ROOT_FILES.has(name)
  ) {
    return "application";
  }
  return "full";
}

function detectChanges() {
  if (process.env.GITHUB_EVENT_NAME === "workflow_dispatch") {
    return full("manual-dispatch");
  }

  const result = spawnSync(
    "git",
    [
      "diff-tree",
      "--no-commit-id",
      "--name-status",
      "-r",
      "-z",
      "HEAD^1",
      "HEAD",
    ],
    { encoding: "utf8" }
  );
  if (result.status !== 0) {
    return full("git-diff-unavailable");
  }

  try {
    return classifyChanges(parseNameStatus(result.stdout));
  } catch {
    return full("git-diff-malformed");
  }
}

function writeGitHubOutput(path, classification) {
  const values = {
    mode: classification.mode,
    reason: classification.reason,
    ...classification.selected,
  };
  const lines = Object.entries(values).map(
    ([key, value]) => `${key}=${String(value)}`
  );
  appendFileSync(path, `${lines.join("\n")}\n`, "utf8");
}

function validateDocumentation(classification) {
  if (classification.mode !== "documentation") {
    console.error(
      `Documentation validation requires a documentation-only diff; classified ${classification.mode}.`
    );
    return 1;
  }

  const formattedFiles = classification.files.filter((path) =>
    FORMATTED_DOC_EXTENSIONS.has(extension(path))
  );
  if (formattedFiles.length === 0) {
    console.log("Documentation assets require no Prettier validation.");
    return 0;
  }

  const prettier = spawnSync(
    process.platform === "win32"
      ? "node_modules/.bin/prettier.cmd"
      : "node_modules/.bin/prettier",
    ["--check", ...formattedFiles],
    { stdio: "inherit" }
  );
  return prettier.status ?? 1;
}

function full(reason, files = []) {
  return {
    mode: "full",
    reason,
    files,
    selected: { ...FULL_SELECTION },
  };
}

function isMigrationPath(path) {
  return (
    /^lib\/db\/migrations\/.+\.(?:sql|json)$/.test(path) ||
    /^supabase\/migrations\/.+\.sql$/.test(path)
  );
}

function isApplicationPath(path) {
  return (
    /^(?:app|apps|components|content|public|tests\/browser)\//.test(path) ||
    APPLICATION_ROOT_FILES.has(path)
  );
}

function isSafeRelativePath(path) {
  return (
    typeof path === "string" &&
    path.length > 0 &&
    !path.startsWith("/") &&
    !path.includes("\\") &&
    !path.split("/").includes("..")
  );
}

function extension(path) {
  const match = path.toLowerCase().match(/(\.[a-z0-9]+)$/);
  return match?.[1] ?? "";
}

function topLevel(path) {
  return path.split("/", 1)[0] || "unknown";
}

function main() {
  const classification = detectChanges();
  const outputIndex = process.argv.indexOf("--github-output");

  if (outputIndex !== -1) {
    const outputPath = process.argv[outputIndex + 1];
    if (!outputPath) {
      console.error("--github-output requires a path");
      return 1;
    }
    writeGitHubOutput(outputPath, classification);
  }

  console.log(
    `CI classification: ${classification.mode} (${classification.reason})`
  );

  if (process.argv.includes("--validate-docs")) {
    return validateDocumentation(classification);
  }
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = main();
}
