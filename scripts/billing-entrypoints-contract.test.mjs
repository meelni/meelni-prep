import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import test from "node:test";

const repoRoot = process.cwd();
const scannedRoots = ["app", "lib", "components", "packages"];

const directCreditsImport =
  /from\s+["'](?:@\/lib\/billing\/credits|(?:\.\.?\/)+billing\/credits|\.\/credits)["']/;

const allowedFiles = new Set([
  "lib/billing/credits.test.ts",
  "lib/billing/credits.ts",
  "lib/billing/credit-ledger-contracts.ts",
  "lib/billing/credit-ledger-reservations.ts",
  "lib/billing/credit-ledger-service.ts",
  "lib/billing/credit-ledger-subscriptions.ts",
  "lib/billing/credit-ledger-trial.ts",
  "lib/billing/subscription-invoice.test.ts",
  "lib/billing/trial.test.ts",
]);

test("runtime billing callers use explicit credit-ledger entrypoints", () => {
  const offenders = [];

  for (const file of listSourceFiles(scannedRoots)) {
    const relativeFile = relative(repoRoot, file).split(sep).join("/");
    if (allowedFiles.has(relativeFile)) continue;

    const source = readFileSync(file, "utf8");
    if (directCreditsImport.test(source)) {
      offenders.push(relativeFile);
    }
  }

  assert.deepEqual(offenders, []);
});

function listSourceFiles(roots) {
  const files = [];

  for (const root of roots) {
    walk(join(repoRoot, root), files);
  }

  return files.filter((file) => /\.(?:ts|tsx|mjs|js)$/.test(file));
}

function walk(path, files) {
  const stats = statSync(path);
  if (stats.isFile()) {
    files.push(path);
    return;
  }

  if (!stats.isDirectory()) return;

  for (const entry of readdirSync(path)) {
    if (entry === "node_modules" || entry === ".next") continue;
    walk(join(path, entry), files);
  }
}
