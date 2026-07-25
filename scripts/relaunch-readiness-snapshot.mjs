#!/usr/bin/env node

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const DEFAULT_REPO = "meelni/meelni-prep";
export const V10_LEDGER_REF =
  "refs/heads/meelni-ledger/sav-248-authorized-paid-calibration.v16";
export const V10_LEDGER_REF_API_PATH =
  "heads/meelni-ledger/sav-248-authorized-paid-calibration.v16";
export const SAVIII_GITHUB_USER_ID = 24397508;

const REQUIRED_RULESETS = {
  ledgerImmutable: {
    name: "Meelni SAV-248 v16 calibration ledger immutable",
    rules: ["deletion", "non_fast_forward"],
    bypassActors: [],
  },
  activationActor: {
    name: "Meelni SAV-248 v16 calibration activation actor",
    rules: ["creation", "update"],
    bypassActors: [
      {
        actor_id: SAVIII_GITHUB_USER_ID,
        actor_type: "User",
        bypass_mode: "always",
      },
    ],
  },
};

export async function buildRelaunchReadinessSnapshot({
  cwd = process.cwd(),
  now = new Date(),
  repo = DEFAULT_REPO,
  fetch = true,
  runCommand = defaultRunCommand,
} = {}) {
  if (fetch) {
    await runCommand("git", ["fetch", "origin", "main", "--quiet"], { cwd });
  }

  const [
    branch,
    currentHead,
    originMain,
    statusPorcelain,
    openPullRequests,
    openIssues,
    rawRulesets,
    ledgerRef,
  ] = await Promise.all([
    runCommand("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd }),
    runCommand("git", ["rev-parse", "HEAD"], { cwd }),
    runCommand("git", ["rev-parse", "origin/main"], { cwd }),
    runCommand("git", ["status", "--porcelain"], { cwd }),
    runJson(runCommand, "gh", [
      "pr",
      "list",
      "--repo",
      repo,
      "--state",
      "open",
      "--json",
      "number,title,isDraft,headRefName,updatedAt,url",
    ]),
    runJson(runCommand, "gh", [
      "issue",
      "list",
      "--repo",
      repo,
      "--state",
      "open",
      "--json",
      "number,title,updatedAt,url",
    ]),
    runJson(runCommand, "gh", [
      "api",
      `repos/${repo}/rulesets?includes_parents=true&targets=branch&per_page=100`,
    ]),
    getLedgerRef(runCommand, repo),
  ]);
  const detailedRulesets = await hydrateMatchingRulesetDetails(
    runCommand,
    repo,
    rawRulesets
  );

  const git = {
    branch: branch.trim(),
    currentHead: currentHead.trim(),
    originMain: originMain.trim(),
    localMatchesOriginMain: currentHead.trim() === originMain.trim(),
    dirty: statusPorcelain.trim().length > 0,
    dirtyEntries: statusPorcelain
      .split("\n")
      .map((line) => line.trimEnd())
      .filter(Boolean),
  };
  const rulesets = summarizeRulesets(detailedRulesets);

  return {
    generatedAt: now.toISOString(),
    repo,
    readOnly: true,
    launchAuthority: {
      launchGoNoGoOwnerOnly: true,
      relaunchDefaultOnAuthorized: false,
      providerMutationAuthorized: false,
    },
    git,
    github: {
      openPullRequestCount: openPullRequests.length,
      openPullRequests,
      openIssueCount: openIssues.length,
      openIssues,
      queueClean: openPullRequests.length === 0 && openIssues.length === 0,
    },
    calibrationV10Guardrails: {
      ledgerRefName: V10_LEDGER_REF,
      rulesets,
      ledgerRef,
      readyForOwnerAuthorizedCalibration:
        rulesets.allExact === true && ledgerRef.present === true,
    },
  };
}

export function summarizeRulesets(rawRulesets) {
  const rulesets = Array.isArray(rawRulesets) ? rawRulesets : [];

  const summaries = Object.fromEntries(
    Object.entries(REQUIRED_RULESETS).map(([key, required]) => {
      const match = rulesets.find((ruleset) => ruleset?.name === required.name);
      return [key, summarizeRuleset(match, required)];
    })
  );

  return {
    required: summaries,
    allExact: Object.values(summaries).every((summary) => summary.exact),
    matchingRulesets: rulesets
      .filter((ruleset) => /SAV-248 v16 calibration/i.test(ruleset?.name ?? ""))
      .map((ruleset) => ({
        id: ruleset.id,
        name: ruleset.name,
        target: ruleset.target,
        enforcement: ruleset.enforcement,
      })),
  };
}

async function hydrateMatchingRulesetDetails(runCommand, repo, rawRulesets) {
  if (!Array.isArray(rawRulesets)) {
    return [];
  }

  return Promise.all(
    rawRulesets.map(async (ruleset) => {
      if (!shouldFetchRulesetDetail(ruleset)) {
        return ruleset;
      }

      try {
        return await runJson(runCommand, "gh", [
          "api",
          `repos/${repo}/rulesets/${ruleset.id}`,
        ]);
      } catch (error) {
        return {
          ...ruleset,
          detailLookupFailed: true,
          detailLookupReason: classifyRulesetDetailFailure(error),
        };
      }
    })
  );
}

function shouldFetchRulesetDetail(ruleset) {
  return (
    ruleset?.id &&
    /SAV-248 v16 calibration/i.test(ruleset?.name ?? "") &&
    (!Array.isArray(ruleset.rules) ||
      !Array.isArray(ruleset.bypass_actors) ||
      !ruleset.conditions?.ref_name)
  );
}

function summarizeRuleset(ruleset, required) {
  if (!ruleset) {
    return {
      present: false,
      exact: false,
      name: required.name,
      reason: "missing",
    };
  }

  const actualRuleTypes = new Set(
    (ruleset.rules ?? []).map((rule) => rule.type).filter(Boolean)
  );
  const expectedRuleTypes = new Set(required.rules);
  const actualBypassActors = ruleset.bypass_actors ?? [];
  const includedRefs = ruleset.conditions?.ref_name?.include ?? [];
  const excludedRefs = ruleset.conditions?.ref_name?.exclude ?? [];

  const exact =
    ruleset.target === "branch" &&
    ruleset.enforcement === "active" &&
    setEquals(actualRuleTypes, expectedRuleTypes) &&
    includesOnly(includedRefs, [V10_LEDGER_REF]) &&
    excludedRefs.length === 0 &&
    bypassActorsMatch(actualBypassActors, required.bypassActors);

  return {
    present: true,
    exact,
    id: ruleset.id,
    name: ruleset.name,
    target: ruleset.target,
    enforcement: ruleset.enforcement,
    ...(ruleset.detailLookupFailed
      ? {
          detailLookupFailed: true,
          detailLookupReason: ruleset.detailLookupReason,
        }
      : {}),
    includedRefs,
    excludedRefs,
    ruleTypes: [...actualRuleTypes].sort(),
    bypassActors: actualBypassActors.map((actor) => ({
      actor_id: actor.actor_id,
      actor_type: actor.actor_type,
      bypass_mode: actor.bypass_mode,
    })),
  };
}

async function getLedgerRef(runCommand, repo) {
  try {
    const ref = await runJson(runCommand, "gh", [
      "api",
      `repos/${repo}/git/ref/${V10_LEDGER_REF_API_PATH}`,
    ]);

    return {
      present: true,
      ref: ref.ref,
      objectSha: ref.object?.sha,
      objectType: ref.object?.type,
    };
  } catch (error) {
    return {
      present: false,
      reason: classifyMissingRef(error),
    };
  }
}

async function runJson(runCommand, file, args) {
  const stdout = await runCommand(file, args);
  return JSON.parse(stdout || "null");
}

async function defaultRunCommand(file, args, options = {}) {
  const { stdout } = await execFileAsync(file, args, {
    cwd: options.cwd,
    maxBuffer: 10 * 1024 * 1024,
  });
  return stdout;
}

function classifyMissingRef(error) {
  const text = `${error?.stdout ?? ""}\n${error?.stderr ?? ""}\n${
    error?.message ?? ""
  }`;
  if (/not found|404/i.test(text)) {
    return "not_found";
  }

  return "lookup_failed";
}

function classifyRulesetDetailFailure(error) {
  const text = `${error?.stdout ?? ""}\n${error?.stderr ?? ""}\n${
    error?.message ?? ""
  }`;
  if (/not found|404/i.test(text)) {
    return "not_found";
  }

  return "lookup_failed";
}

function setEquals(a, b) {
  if (a.size !== b.size) {
    return false;
  }

  return [...a].every((value) => b.has(value));
}

function includesOnly(actual, expected) {
  return (
    actual.length === expected.length &&
    expected.every((ref) => actual.includes(ref))
  );
}

function bypassActorsMatch(actual, expected) {
  if (actual.length !== expected.length) {
    return false;
  }

  return expected.every((requiredActor) =>
    actual.some(
      (actor) =>
        actor.actor_id === requiredActor.actor_id &&
        actor.actor_type === requiredActor.actor_type &&
        actor.bypass_mode === requiredActor.bypass_mode
    )
  );
}

function parseArgs(argv) {
  const options = {
    repo: DEFAULT_REPO,
    fetch: true,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--repo") {
      options.repo = argv[++index];
    } else if (arg === "--no-fetch") {
      options.fetch = false;
    } else if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function printHelp() {
  console.log(`Usage: npm run relaunch:readiness-snapshot -- [--repo owner/name] [--no-fetch]

Creates a read-only JSON snapshot of GitHub queue state, git state, and the
SAV-248 v16 calibration guardrail prerequisites. This command does not mutate
GitHub, providers, Linear, feature flags, ledger refs, or owner authorizations.`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
      printHelp();
      process.exit(0);
    }

    const snapshot = await buildRelaunchReadinessSnapshot(options);
    console.log(JSON.stringify(snapshot, null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
