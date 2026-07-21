import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { parse } from "yaml";

const workflowDirectory = ".github/workflows";
const workflowFiles = readdirSync(workflowDirectory)
  .filter((filename) => /\.ya?ml$/.test(filename))
  .map((filename) => ({
    path: `${workflowDirectory}/${filename}`,
    source: readFileSync(`${workflowDirectory}/${filename}`, "utf8"),
  }));
const packageSource = readFileSync("package.json", "utf8");
const packageManifest = JSON.parse(packageSource);
const costControl = readFileSync("docs/operations/ci-cost-control.md", "utf8");
const intake = readFileSync(
  "docs/agent-tasks/SAV-279-ci-registry-trusted-validate.md",
  "utf8"
);
const shipCommand = readFileSync(".claude/commands/ship.md", "utf8");
const agentCommandSources = readdirSync(".claude/commands")
  .filter((filename) => filename.endsWith(".md"))
  .map((filename) => ({
    path: `.claude/commands/${filename}`,
    source: readFileSync(`.claude/commands/${filename}`, "utf8"),
  }));
const excludedScanDirectories = new Set([
  ".git",
  ".next",
  ".turbo",
  "coverage",
  "node_modules",
  "playwright-report",
  "test-results",
]);
const executableBasenames = new Set([
  "Dockerfile",
  "GNUmakefile",
  "Justfile",
  "Makefile",
  "Taskfile",
]);

const mergeAuthorityPatterns = [
  { label: "GitHub CLI pull-request merge", pattern: /\bgh\s+pr\s+merge\b/ },
  {
    label: "GitHub pull-request merge endpoint",
    pattern: /\/pulls\/(?:[^\s"'`/]+|\$\{[^}]+\})\/merge\b/,
  },
  {
    label: "Octokit pull-request merge",
    pattern: /\b(?:github|octokit)(?:\.rest)?\.pulls\.merge\s*\(/,
  },
  {
    label: "GitHub auto-merge mutation",
    pattern: /\b(?:enable|disable|merge)PullRequest(?:AutoMerge)?\b/,
  },
  {
    label: "Git push alias",
    pattern:
      /\balias\.[^\s=]+(?:\s*=\s*|\s+)(?:"[^"]*\bpush\b[^"]*"|'[^']*\bpush\b[^']*'|[^\n;&|]*\bpush\b)/,
  },
  {
    label: "Git send-pack ref update",
    pattern: /\bgit\s+send-pack\b/,
  },
  {
    label: "GitHub repository merge or ref update",
    pattern:
      /\b(?:github|octokit)(?:\.rest)?\.(?:repos\.merge|git\.updateRef)\s*\(/,
  },
  {
    label: "GitHub repository merges endpoint",
    pattern:
      /\/repos\/(?:[^\s"'`/]+|\{[^}]+\})\/(?:[^\s"'`/]+|\{[^}]+\})\/merges\b/,
  },
  {
    label: "dynamically joined pull-request merge endpoint",
    pattern: /["'`]\/pulls\/["'`][\s\S]{0,160}["'`]\/merge["'`]/,
  },
];

function normalizedExecutableSource(source) {
  return source.replace(/(?:\\|`)\r?\n[\t ]*/g, " ");
}

function shellWords(command) {
  return (command.match(/"(?:\\.|[^"])*"|'[^']*'|[^\s]+/g) ?? []).map((word) =>
    (word.startsWith('"') && word.endsWith('"')) ||
    (word.startsWith("'") && word.endsWith("'"))
      ? word.slice(1, -1)
      : word
  );
}

function gitPushCommands(source) {
  const globalValueOptions = new Set([
    "--config-env",
    "--git-dir",
    "--namespace",
    "--super-prefix",
    "--work-tree",
    "-C",
    "-c",
  ]);
  const globalBooleanOptions = new Set([
    "--bare",
    "--glob-pathspecs",
    "--help",
    "--icase-pathspecs",
    "--literal-pathspecs",
    "--no-literal-pathspecs",
    "--no-optional-locks",
    "--no-pager",
    "--no-replace-objects",
    "--noglob-pathspecs",
    "--paginate",
    "--version",
    "-P",
    "-p",
  ]);
  const commands = [];

  for (const fragment of source.split(/\r?\n|&&|\|\||[;|]/)) {
    const words = shellWords(fragment);
    for (let gitIndex = 0; gitIndex < words.length; gitIndex += 1) {
      if (!/(?:^|\/)git$/.test(words[gitIndex])) continue;
      let index = gitIndex + 1;
      let ambiguousGlobalOption = false;
      while (index < words.length && words[index].startsWith("-")) {
        const option = words[index];
        if (globalValueOptions.has(option)) {
          index += 2;
        } else if (
          globalBooleanOptions.has(option) ||
          /^--(?:config-env|git-dir|namespace|super-prefix|work-tree)=/.test(
            option
          )
        ) {
          index += 1;
        } else {
          ambiguousGlobalOption = true;
          index += 1;
        }
      }
      if (/[$`]/.test(words[index] ?? "")) {
        commands.push("$AMBIGUOUS");
        continue;
      }
      if (words[index] !== "push") continue;
      const suffix = words.slice(index + 1).join(" ");
      commands.push(ambiguousGlobalOption ? `$AMBIGUOUS ${suffix}` : suffix);
    }
  }
  return commands;
}

function assertNoGithubCliMerge(source, label) {
  const globalValueOptions = new Set(["--hostname", "--repo", "-R"]);
  const globalBooleanOptions = new Set([
    "--help",
    "--no-update-notifier",
    "--version",
  ]);
  for (const fragment of source.split(/\r?\n|&&|\|\||[;|]/)) {
    const words = shellWords(fragment);
    for (let ghIndex = 0; ghIndex < words.length; ghIndex += 1) {
      if (!/(?:^|\/)gh$/.test(words[ghIndex])) continue;
      let index = ghIndex + 1;
      let ambiguousGlobalOption = false;
      while (index < words.length && words[index].startsWith("-")) {
        const option = words[index];
        if (globalValueOptions.has(option)) {
          index += 2;
        } else if (
          globalBooleanOptions.has(option) ||
          /^--(?:hostname|repo)=/.test(option)
        ) {
          index += 1;
        } else {
          ambiguousGlobalOption = true;
          index += 1;
        }
      }
      if (words[index] === "pr" && words[index + 1] === "merge") {
        assert.fail(
          `${label} exposes ${ambiguousGlobalOption ? "an ambiguous " : "a "}GitHub CLI pull-request merge`
        );
      }
    }
  }
}

function nestedShellSources(source) {
  const nested = [];
  for (const fragment of source.split(/\r?\n|&&|\|\||[;|]/)) {
    const words = shellWords(fragment);
    for (let index = 0; index < words.length; index += 1) {
      const executable = words[index].split("/").at(-1);
      if (
        ["bash", "dash", "fish", "ksh", "pwsh", "sh", "zsh"].includes(
          executable
        ) &&
        (/^-.*c/.test(words[index + 1] ?? "") ||
          /^-(?:Command|EncodedCommand)$/i.test(words[index + 1] ?? "")) &&
        words[index + 2]
      ) {
        nested.push(words[index + 2]);
      }
      if (executable === "eval" && words[index + 1]) {
        nested.push(words[index + 1]);
      }
    }
  }
  return nested;
}

function explicitPushRefspecs(command, label) {
  const booleanOptions = new Set([
    "--all",
    "--atomic",
    "--delete",
    "--dry-run",
    "--follow-tags",
    "--force",
    "--force-if-includes",
    "--force-with-lease",
    "--mirror",
    "--no-atomic",
    "--no-thin",
    "--porcelain",
    "--prune",
    "--quiet",
    "--set-upstream",
    "--signed",
    "--tags",
    "--thin",
    "--verbose",
    "-d",
    "-f",
    "-n",
    "-q",
    "-u",
    "-v",
  ]);
  const valueOptions = new Set([
    "--exec",
    "--push-option",
    "--receive-pack",
    "-o",
  ]);
  const positionals = [];
  const words = shellWords(command);
  let positionalOnly = false;

  for (let index = 0; index < words.length; index += 1) {
    const word = words[index];
    if (!positionalOnly && word === "--") {
      positionalOnly = true;
    } else if (!positionalOnly && valueOptions.has(word)) {
      index += 1;
      assert.ok(words[index], `${label} exposes an incomplete git push option`);
    } else if (
      !positionalOnly &&
      (booleanOptions.has(word) ||
        /^(?:--force-with-lease|--signed)=/.test(word))
    ) {
      continue;
    } else if (!positionalOnly && word.startsWith("-")) {
      assert.fail(`${label} exposes an ambiguous git push option ${word}`);
    } else {
      positionals.push(word);
    }
  }

  assert.ok(
    positionals.length >= 2,
    `${label} exposes a git push without an explicit refspec`
  );
  return positionals.slice(1);
}

function assertNonMainRefspec(refspec, label) {
  const normalized = refspec.replace(/^\+/, "");
  assert.doesNotMatch(
    normalized,
    /[*?]/,
    `${label} exposes a wildcard git push refspec`
  );
  const separator = normalized.lastIndexOf(":");
  const destination = (
    separator === -1 ? normalized : normalized.slice(separator + 1)
  ).replace(/^refs\/heads\//, "");
  assert.match(
    destination,
    /^[A-Za-z0-9][A-Za-z0-9._/-]*$/,
    `${label} exposes a non-literal git push destination`
  );
  assert.notEqual(destination, "HEAD", `${label} exposes an inferred push`);
  assert.notEqual(destination, "main", `${label} exposes a push to main`);
}

function assertNoMainPushAuthority(source, label) {
  for (const command of gitPushCommands(source)) {
    assert.doesNotMatch(
      command,
      /[$`]/,
      `${label} exposes a dynamically targeted git push`
    );
    for (const refspec of explicitPushRefspecs(command, label)) {
      assertNonMainRefspec(refspec, label);
    }
  }
}

function assertNoMergeAuthority(source, label) {
  const pending = [normalizedExecutableSource(source)];
  const inspected = new Set();
  while (pending.length > 0) {
    const candidateSource = pending.pop();
    if (inspected.has(candidateSource)) continue;
    inspected.add(candidateSource);
    assertNoMainPushAuthority(candidateSource, label);
    assertNoGithubCliMerge(candidateSource, label);
    for (const candidate of mergeAuthorityPatterns) {
      assert.doesNotMatch(
        candidateSource,
        candidate.pattern,
        `${label} exposes ${candidate.label}`
      );
    }
    pending.push(...nestedShellSources(candidateSource));
  }
}

function assertPackageScriptsHaveNoMergeAuthority(manifest) {
  assert.ok(manifest?.scripts && typeof manifest.scripts === "object");
  for (const [name, source] of Object.entries(manifest.scripts)) {
    assert.equal(typeof source, "string", `package script ${name} is invalid`);
    assertNoMergeAuthority(source, `package.json script ${name}`);
  }
}

function permissionValue(permissions, name) {
  if (permissions === "write-all") return "write";
  if (permissions === "read-all") return "read";
  if (permissions === undefined) return "repository-default";
  if (!permissions || typeof permissions !== "object") return "none";
  return permissions[name] ?? "none";
}

const credentialKeyPattern =
  /(?:^|[-_])(?:app[-_]?id|credential|gh[-_]?token|github[-_]?token|password|pat|private[-_]?key|secret|token)(?:$|[-_])/i;

function canonicalWorkflowExpressions(source) {
  return [...source.matchAll(/\$\{\{([\s\S]*?)\}\}/g)].map((match) =>
    match[1].replace(/\s+/g, "").toLowerCase()
  );
}

function assertNoExternalCredentialSource(value, label) {
  for (const scalar of scalarValues(value)) {
    for (const expression of canonicalWorkflowExpressions(scalar)) {
      assert.doesNotMatch(
        expression,
        /\b(?:env|inputs|matrix|needs|secrets|vars)\b/,
        `${label} must not derive runtime authority from external inputs`
      );
      for (const match of expression.matchAll(/\bgithub\b/g)) {
        assert.match(
          expression.slice(match.index),
          /^github\.(?:event\.(?:pull_request\.number|repository\.default_branch)|event_name|repository|run_attempt|run_id|token)(?![.\w[*])/,
          `${label} must use an allowlisted GitHub context value`
        );
      }
      for (const match of expression.matchAll(/\bgithub\.event\b/g)) {
        assert.match(
          expression.slice(match.index),
          /^github\.event\.(?:pull_request\.number|repository\.default_branch)(?![.\w[])/,
          `${label} must not pass event payload data into a runtime authority sink`
        );
      }
    }
  }
}

function assertNoWriteCredentialDelegation(value, label, options = {}) {
  const inspect = (current, key = "") => {
    if (typeof current === "string") {
      assert.doesNotMatch(
        current,
        /\$\{\{[\s\S]*\bsecrets\b[\s\S]*\}\}/i,
        `${label} must not receive repository-write secrets`
      );
      assert.doesNotMatch(
        current,
        /\$\{\{(?=[\s\S]*\bvars\b)(?=[\s\S]*(?:PAT|TOKEN))[\s\S]*\}\}/i,
        `${label} must not receive repository-write token variables`
      );
      const genericKeyIsCredential =
        /^(?:credential|key)$/i.test(key) && !options.allowGenericKey;
      const credentialDestination =
        credentialKeyPattern.test(key) || genericKeyIsCredential;
      const expressions = canonicalWorkflowExpressions(current);
      for (const expression of expressions) {
        for (const githubMatch of expression.matchAll(/\bgithub\b/g)) {
          assert.match(
            expression.slice(githubMatch.index + "github".length),
            /^\./,
            `${label} must not serialize or dynamically index the github context`
          );
        }
      }
      if (
        expressions.some((expression) => /\bgithub\.token\b/.test(expression))
      ) {
        assert.ok(
          credentialDestination,
          `${label} must pass github.token only to an explicit credential input`
        );
      }
      if (credentialDestination) {
        assert.deepEqual(
          expressions,
          ["github.token"],
          `${label} credential input must be the permission-scoped github.token`
        );
        assert.match(current, /^\s*\$\{\{[\s\S]*\}\}\s*$/);
      }
      return;
    }
    if (Array.isArray(current)) {
      for (const entry of current) inspect(entry, key);
      return;
    }
    if (!current || typeof current !== "object") return;
    for (const [childKey, childValue] of Object.entries(current)) {
      inspect(childValue, childKey);
    }
  };
  inspect(value);
}

function scalarValues(value) {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(scalarValues);
  if (!value || typeof value !== "object") return [];
  return Object.values(value).flatMap(scalarValues);
}

const trustedPublisherCommands = new Set([
  'node scripts/revalidate-stacked-prs-ci.mjs --event-path "$GITHUB_EVENT_PATH"',
  "node scripts/revalidate-stacked-prs-ci.mjs",
  "node scripts/check-migration-collisions-event-ci.mjs",
  "node scripts/check-migration-collisions-ci.mjs",
  "node scripts/registry-only-validate-ci.mjs --sweep",
  "exit 1",
]);
const trustedPublisherConditionByJob = {
  "audit-draft-impact":
    "github.event_name == 'pull_request_target' && github.event.pull_request.draft == true && (github.event.action == 'opened' || github.event.action == 'reopened' || github.event.action == 'synchronize' || (github.event.action == 'edited' && github.event.changes.base != null))",
  "refresh-registry-body-edits":
    "github.event_name == 'pull_request_target' && github.event.pull_request.draft == true && github.event.action == 'edited' && github.event.changes.body != null && github.event.changes.base == null",
  "revalidate-all":
    "github.event_name == 'push' || (github.event_name == 'workflow_dispatch' && inputs.operation == 'revalidate')",
  "verify-migrations":
    "github.event_name == 'pull_request_target' && (github.event.action == 'closed' || (github.event.pull_request.draft == false && (github.event.action != 'edited' || github.event.changes.base != null)))",
  "verify-stack":
    "github.event_name == 'pull_request_target' && (github.event.action == 'closed' || (github.event.pull_request.draft == false && (github.event.action != 'edited' || github.event.changes.body != null || github.event.changes.base != null)))",
};
const trustedPublisherJobConditions = new Set(
  Object.values(trustedPublisherConditionByJob)
);
const trustedFailureCondition =
  "always() && (steps.stack_audit.outcome != 'success' || steps.migration_audit.outcome != 'success' || steps.registry_validate_sweep.outcome != 'success')";
const trustedFixtureCondition = [...trustedPublisherJobConditions][0];
const resumableAuditContract = (stackCommand, migrationCommand) => [
  { continueOnError: true, id: "stack_audit", run: stackCommand },
  {
    continueOnError: true,
    id: "migration_audit",
    if: "always()",
    run: migrationCommand,
  },
  {
    continueOnError: true,
    id: "registry_validate_sweep",
    if: "always()",
    run: "node scripts/registry-only-validate-ci.mjs --sweep",
  },
  { if: trustedFailureCondition, run: "exit 1" },
];
const trustedPublisherJobContracts = {
  "audit-draft-impact": resumableAuditContract(
    'node scripts/revalidate-stacked-prs-ci.mjs --event-path "$GITHUB_EVENT_PATH"',
    "node scripts/check-migration-collisions-event-ci.mjs"
  ),
  "refresh-registry-body-edits": [
    { run: "node scripts/registry-only-validate-ci.mjs --sweep" },
  ],
  "revalidate-all": resumableAuditContract(
    "node scripts/revalidate-stacked-prs-ci.mjs",
    "node scripts/check-migration-collisions-ci.mjs"
  ),
  "verify-migrations": [
    { run: "node scripts/check-migration-collisions-event-ci.mjs" },
  ],
  "verify-stack": [
    {
      run: 'node scripts/revalidate-stacked-prs-ci.mjs --event-path "$GITHUB_EVENT_PATH"',
    },
    { run: "node scripts/registry-only-validate-ci.mjs --sweep" },
  ],
};

function assertTrustedPublisherProvenance(job, label, jobName) {
  const steps = job.steps ?? [];
  assert.ok(Array.isArray(steps) && steps.length > 0, `${label} needs steps`);
  assert.equal(
    job["runs-on"],
    "ubuntu-latest",
    `${label} needs a hosted runner`
  );
  assert.ok(
    trustedPublisherJobConditions.has(job.if),
    `${label} must use an approved fail-closed event condition`
  );
  if (Object.hasOwn(trustedPublisherConditionByJob, jobName)) {
    assert.equal(
      job.if,
      trustedPublisherConditionByJob[jobName],
      `${label} must retain its exact fail-closed event condition`
    );
  }
  assert.equal(
    job["continue-on-error"],
    undefined,
    `${label} must fail closed at the job boundary`
  );
  for (const field of [
    "container",
    "defaults",
    "env",
    "services",
    "strategy",
    "uses",
    "with",
  ]) {
    assert.equal(
      job[field],
      undefined,
      `${label} must not override trusted execution`
    );
  }
  const checkoutIndexes = steps.flatMap((step, index) =>
    typeof step?.uses === "string" && step.uses.startsWith("actions/checkout@")
      ? [index]
      : []
  );
  assert.deepEqual(
    checkoutIndexes,
    [0],
    `${label} must have exactly one first-step trusted checkout`
  );
  assert.match(
    steps[1]?.uses ?? "",
    /^actions\/setup-node@[a-f0-9]{40}$/,
    `${label} must have pinned Node setup as its second step`
  );

  for (const [index, step] of steps.entries()) {
    const stepLabel = `${label} step ${index + 1}`;
    assert.equal(
      step["working-directory"],
      undefined,
      `${stepLabel} must execute from the trusted repository root`
    );
    if (step.uses !== undefined) {
      assert.equal(step.run, undefined, `${stepLabel} cannot mix uses and run`);
      assert.equal(
        step.if,
        undefined,
        `${stepLabel} must not condition trusted action setup`
      );
      assert.equal(
        step["continue-on-error"],
        undefined,
        `${stepLabel} must fail closed during trusted action setup`
      );
      if (index === 0) {
        assert.match(
          step.uses,
          /^actions\/checkout@[a-f0-9]{40}$/,
          `${stepLabel} checkout must be pinned to a commit`
        );
        assert.equal(
          step.with?.ref,
          "${{ github.event.repository.default_branch }}",
          `${stepLabel} must check out the trusted default branch`
        );
        assert.deepEqual(
          Object.keys(step.with ?? {}).sort(),
          ["fetch-depth", "persist-credentials", "ref"].filter((key) =>
            Object.hasOwn(step.with ?? {}, key)
          ),
          `${stepLabel} must not redirect or alter the trusted checkout`
        );
      } else {
        assert.match(
          step.uses,
          /^actions\/setup-node@[a-f0-9]{40}$/,
          `${stepLabel} may only use the pinned Node setup action`
        );
        assert.deepEqual(
          step.with,
          { "node-version": 22 },
          `${stepLabel} must use the fixed trusted Node runtime`
        );
      }
      assert.equal(
        step.env,
        undefined,
        `${stepLabel} must not alter action execution`
      );
      continue;
    }
    assert.equal(
      typeof step.run,
      "string",
      `${stepLabel} needs a trusted command`
    );
    assert.ok(
      trustedPublisherCommands.has(step.run.trim()),
      `${stepLabel} may only run a fixed trusted publisher command`
    );
    assert.equal(
      step.shell,
      undefined,
      `${stepLabel} must use the default shell`
    );
    const allowedEnvironment = {
      GITHUB_DEFAULT_BRANCH: "${{ github.event.repository.default_branch }}",
      GITHUB_REPOSITORY: "${{ github.repository }}",
      GITHUB_TOKEN: "${{ github.token }}",
    };
    for (const [key, value] of Object.entries(step.env ?? {})) {
      assert.equal(
        value,
        allowedEnvironment[key],
        `${stepLabel} has an untrusted environment override`
      );
    }
    const resumableAuditSteps = {
      migration_audit: [
        "node scripts/check-migration-collisions-event-ci.mjs",
        "node scripts/check-migration-collisions-ci.mjs",
      ],
      registry_validate_sweep: [
        "node scripts/registry-only-validate-ci.mjs --sweep",
      ],
      stack_audit: [
        'node scripts/revalidate-stacked-prs-ci.mjs --event-path "$GITHUB_EVENT_PATH"',
        "node scripts/revalidate-stacked-prs-ci.mjs",
      ],
    };
    if (step["continue-on-error"] !== undefined) {
      assert.equal(
        step["continue-on-error"],
        true,
        `${stepLabel} has an unsupported failure control`
      );
      assert.ok(
        resumableAuditSteps[step.id]?.includes(step.run.trim()),
        `${stepLabel} may resume only a named trusted audit`
      );
    }
    const expectedCondition =
      step.run.trim() === "exit 1"
        ? trustedFailureCondition
        : ["migration_audit", "registry_validate_sweep"].includes(step.id)
          ? "always()"
          : undefined;
    assert.equal(
      step.if,
      expectedCondition,
      `${stepLabel} has an unsupported execution condition`
    );
  }
  const resumableSteps = steps.filter(
    (step) => step["continue-on-error"] === true
  );
  if (resumableSteps.length > 0) {
    assert.deepEqual(
      resumableSteps.map((step) => step.id).sort(),
      ["migration_audit", "registry_validate_sweep", "stack_audit"],
      `${label} must run the complete resumable audit set`
    );
    assert.equal(
      steps.at(-1)?.run?.trim(),
      "exit 1",
      `${label} must end with the fail-closed audit aggregator`
    );
  }
  assert.ok(
    Object.hasOwn(trustedPublisherJobContracts, jobName),
    `${label} must be an approved trusted publisher job`
  );
  assert.deepEqual(
    steps.slice(2).map((step) => ({
      ...(step["continue-on-error"] === undefined
        ? {}
        : { continueOnError: step["continue-on-error"] }),
      ...(step.id === undefined ? {} : { id: step.id }),
      ...(step.if === undefined ? {} : { if: step.if }),
      run: step.run?.trim(),
    })),
    trustedPublisherJobContracts[jobName],
    `${label} must retain its complete trusted publisher sequence`
  );
}

function assertWorkflowHasNoMergeAuthority({ path, source }) {
  const workflow = parse(source);
  assert.ok(
    workflow && typeof workflow === "object" && workflow.jobs,
    `${path} must parse as a workflow with jobs`
  );
  const { jobs, ...workflowLevelFields } = workflow;
  assertNoWriteCredentialDelegation(workflowLevelFields, path);
  assertNoExternalCredentialSource(workflow.env, `${path} workflow env`);

  for (const [jobName, job] of Object.entries(jobs)) {
    const permissions = job.permissions ?? workflow.permissions;
    for (const permission of ["contents", "id-token", "pull-requests"]) {
      assert.ok(
        ["read", "none"].includes(permissionValue(permissions, permission)),
        `${path} job ${jobName} must explicitly prevent ${permission}: write`
      );
    }
    if (permissions && typeof permissions === "object") {
      for (const [permission, access] of Object.entries(permissions)) {
        assert.ok(
          access !== "write" || ["checks", "statuses"].includes(permission),
          `${path} job ${jobName} must not grant ${permission}: write`
        );
      }
    }
    assert.equal(
      job.secrets,
      undefined,
      `${path} job ${jobName} must not delegate reusable-workflow secrets`
    );
    const { steps = [], ...jobLevelFields } = job;
    assertNoWriteCredentialDelegation(jobLevelFields, `${path} job ${jobName}`);
    for (const field of [
      "container",
      "defaults",
      "env",
      "services",
      "strategy",
      "uses",
      "with",
    ]) {
      assertNoExternalCredentialSource(
        job[field],
        `${path} job ${jobName} ${field}`
      );
    }
    if (
      ["checks", "statuses"].some(
        (permission) => permissionValue(permissions, permission) === "write"
      )
    ) {
      assert.equal(
        workflow.defaults,
        undefined,
        `${path} must not override trusted publisher defaults`
      );
      assert.equal(
        workflow.env,
        undefined,
        `${path} must not override trusted publisher environment`
      );
      assertTrustedPublisherProvenance(job, `${path} job ${jobName}`, jobName);
    }
    for (const scalar of scalarValues(jobLevelFields)) {
      assertNoMergeAuthority(scalar, `${path} job ${jobName}`);
    }
    for (const [stepIndex, step] of steps.entries()) {
      assertNoWriteCredentialDelegation(
        step,
        `${path} job ${jobName} step ${stepIndex + 1}`,
        {
          allowGenericKey:
            typeof step.uses === "string" &&
            step.uses.startsWith("actions/cache@"),
        }
      );
      const { id, if: condition, name, ...runtimeStepFields } = step;
      void id;
      void condition;
      void name;
      assertNoExternalCredentialSource(
        runtimeStepFields,
        `${path} job ${jobName} step ${stepIndex + 1}`
      );
      for (const scalar of scalarValues(step)) {
        assertNoMergeAuthority(
          scalar,
          `${path} job ${jobName} step ${stepIndex + 1}`
        );
      }
    }
  }
}

function assertCompositeActionHasNoMergeAuthority({ path, source }) {
  const action = parse(source);
  assert.equal(
    action?.runs?.using,
    "composite",
    `${path} must be a parsed composite action`
  );
  for (const [stepIndex, step] of (action.runs.steps ?? []).entries()) {
    for (const scalar of scalarValues(step)) {
      assertNoMergeAuthority(scalar, `${path} step ${stepIndex + 1}`);
    }
  }
}

function isExecutableFileName(filename) {
  return (
    /\.(?:bash|c?js|fish|mjs|mk|pl|ps1|py|rb|sh|ts|tsx|zsh)$/.test(filename) ||
    executableBasenames.has(filename)
  );
}

function isExecutableSource(filename, source) {
  return isExecutableFileName(filename) || source.startsWith("#!");
}

function executableFiles(root) {
  if (!existsSync(root)) return [];
  const files = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = `${root}/${entry.name}`;
    if (entry.isDirectory() && !excludedScanDirectories.has(entry.name)) {
      files.push(...executableFiles(path));
    } else if (
      entry.isFile() &&
      path !== "./scripts/registry-only-native-merge-contract.test.mjs"
    ) {
      const source = readFileSync(path, "utf8");
      if (isExecutableSource(entry.name, source)) files.push(path);
    }
  }
  return files;
}

function compositeActionFiles(root) {
  if (!existsSync(root)) return [];
  const files = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = `${root}/${entry.name}`;
    if (entry.isDirectory()) {
      files.push(...compositeActionFiles(path));
    } else if (entry.isFile() && /^action\.ya?ml$/.test(entry.name)) {
      files.push(path);
    }
  }
  return files;
}

function assertExecutableSourcesHaveNoMergeAuthority(files) {
  for (const path of files) {
    assert.ok(statSync(path).isFile());
    assertNoMergeAuthority(readFileSync(path, "utf8"), path);
  }
}

test("hosted automation exposes no repository-write merge authority", () => {
  for (const path of [
    ".github/workflows/registry-merge.yml",
    "scripts/registry-only-merge-preflight.mjs",
    "scripts/registry-only-merge-recovery.mjs",
  ]) {
    assert.equal(existsSync(path), false, `${path} must stay removed`);
    assert.equal(packageSource.includes(path.split("/").at(-1)), false);
  }
  for (const workflow of workflowFiles) {
    assertWorkflowHasNoMergeAuthority(workflow);
  }
  for (const path of compositeActionFiles(".github/actions")) {
    assertCompositeActionHasNoMergeAuthority({
      path,
      source: readFileSync(path, "utf8"),
    });
  }
  assertExecutableSourcesHaveNoMergeAuthority(executableFiles("."));
  assertPackageScriptsHaveNoMergeAuthority(packageManifest);
  assert.doesNotMatch(packageSource, /registry-only-merge/);
  assert.equal(
    existsSync(".claude/commands/merge.md"),
    false,
    "the retired direct-push agent command must stay removed"
  );
  assert.match(
    shipCommand,
    /\[ -z "\$branch" \] \|\| \[ "\$branch" = "main" \]/
  );
  assert.match(shipCommand, /git push origin "\$branch"/);
  assert.doesNotMatch(
    shipCommand,
    /git push origin \$\(git branch --show-current\)/
  );
});

test("active agent push instructions fail closed on main and detached HEAD", (t) => {
  const pushInstructions = agentCommandSources.flatMap(({ path, source }) =>
    source
      .split(/\r?\n/)
      .filter((line) => /\bgit\s+push\b/.test(line))
      .map((line) => `${path}:${line.trim()}`)
  );
  assert.deepEqual(pushInstructions, [
    '.claude/commands/ship.md:git push origin "$branch"',
  ]);

  const snippet = shipCommand.match(
    /branch="\$\(git branch --show-current\)"[\s\S]*?git push origin "\$branch"/
  )?.[0];
  assert.equal(
    typeof snippet,
    "string",
    "ship must expose one guarded push block"
  );

  const root = mkdtempSync(join(tmpdir(), "sav-279-agent-push-"));
  t.after(() => rmSync(root, { force: true, recursive: true }));
  const repository = join(root, "repository");
  const remote = join(root, "remote.git");
  const runGit = (cwd, ...args) => {
    const result = spawnSync("git", args, { cwd, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    return result.stdout.trim();
  };
  runGit(root, "init", "--bare", remote);
  runGit(root, "init", repository);
  runGit(repository, "config", "user.email", "fixture@example.invalid");
  runGit(repository, "config", "user.name", "SAV-279 fixture");
  runGit(repository, "commit", "--allow-empty", "-m", "fixture");
  runGit(repository, "branch", "-M", "main");
  runGit(repository, "remote", "add", "origin", remote);

  let result = spawnSync("/bin/sh", ["-eu", "-c", snippet], {
    cwd: repository,
    encoding: "utf8",
  });
  assert.notEqual(result.status, 0, "main must be rejected before push");
  assert.notEqual(
    spawnSync("git", [
      "--git-dir",
      remote,
      "show-ref",
      "--verify",
      "refs/heads/main",
    ]).status,
    0,
    "main must not reach the remote"
  );

  runGit(repository, "switch", "-c", "codex/fixture");
  result = spawnSync("/bin/sh", ["-eu", "-c", snippet], {
    cwd: repository,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(
    runGit(remote, "show-ref", "--verify", "refs/heads/codex/fixture"),
    `${runGit(repository, "rev-parse", "HEAD")} refs/heads/codex/fixture`
  );

  runGit(repository, "checkout", "--detach");
  result = spawnSync("/bin/sh", ["-eu", "-c", snippet], {
    cwd: repository,
    encoding: "utf8",
  });
  assert.notEqual(
    result.status,
    0,
    "detached HEAD must be rejected before push"
  );
});

test("parsed workflow guard rejects write-enabled merge authority", () => {
  for (const run of ["gh pr merge 365 --merge", "git push origin HEAD:main"]) {
    assert.throws(
      () =>
        assertWorkflowHasNoMergeAuthority({
          path: "adversarial.yml",
          source: `
name: Adversarial
permissions:
  contents: write
jobs:
  merge:
    runs-on: ubuntu-latest
    steps:
      - run: ${run}
`,
        }),
      /must explicitly prevent contents: write/
    );
  }
});

test("parsed workflow guard rejects repository-default token authority", () => {
  assert.throws(
    () =>
      assertWorkflowHasNoMergeAuthority({
        path: "implicit-permissions.yml",
        source: `
name: Implicit permissions
jobs:
  merge:
    runs-on: ubuntu-latest
    steps:
      - run: gh pr merge 365 --merge
`,
      }),
    /must explicitly prevent contents: write/
  );
});

test("workflow guard rejects write scopes and delegated credentials", () => {
  for (const [fixtureIndex, source] of [
    `
name: Reusable secret inheritance
permissions:
  contents: read
jobs:
  merge:
    uses: owner/repository/.github/workflows/reusable.yml@pinned
    secrets: inherit
`,
    `
name: Secret PAT
permissions:
  contents: read
jobs:
  merge:
    runs-on: ubuntu-latest
    env:
      GH_TOKEN: \${{ secrets.REPOSITORY_WRITE_PAT }}
    steps:
      - run: echo guarded
`,
    `
name: Bracket secret PAT
permissions:
  contents: read
jobs:
  merge:
    runs-on: ubuntu-latest
    env:
      GH_TOKEN: \${{ secrets['REPOSITORY_WRITE_PAT'] }}
    steps:
      - run: echo guarded
`,
    `
name: Dynamic secret key
permissions:
  contents: read
jobs:
  merge:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/create-github-app-token@pinned
        with:
          private-key: \${{ secrets[format('{0}_KEY', inputs.environment)] }}
`,
    `
name: Token variable
permissions:
  contents: read
jobs:
  merge:
    runs-on: ubuntu-latest
    env:
      GH_TOKEN: \${{ vars['REPOSITORY_TOKEN'] }}
    steps:
      - run: echo guarded
`,
    `
name: Serialized secrets context
permissions:
  contents: read
jobs:
  merge:
    runs-on: ubuntu-latest
    env:
      MATERIAL: \${{ toJSON(secrets) }}
    steps:
      - run: echo guarded
`,
    `
name: Credential input
permissions:
  contents: read
jobs:
  merge:
    runs-on: ubuntu-latest
    env:
      GH_TOKEN: \${{ inputs.token }}
    steps:
      - run: echo guarded
`,
    `
name: Write permission
permissions:
  contents: read
jobs:
  merge:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write
    steps:
      - run: echo guarded
`,
    `
name: Indirect write permission
permissions:
  contents: read
jobs:
  mutate:
    runs-on: ubuntu-latest
    permissions:
      actions: write
      contents: read
    steps:
      - run: echo guarded
`,
  ].entries()) {
    assert.throws(
      () =>
        assertWorkflowHasNoMergeAuthority({
          path: "credential-authority.yml",
          source,
        }),
      /must not|must explicitly prevent|must not grant|credential input/,
      `credential fixture ${fixtureIndex} must fail closed`
    );
  }
});

test("workflow guard rejects input-derived credentials under arbitrary names", () => {
  for (const key of [
    "auth-token",
    "access-token",
    "github-app-token",
    "key",
    "credential",
  ]) {
    assert.throws(
      () =>
        assertWorkflowHasNoMergeAuthority({
          path: "input-credential.yml",
          source: `
name: Input credential
permissions:
  contents: read
jobs:
  use-credential:
    runs-on: ubuntu-latest
    steps:
      - uses: owner/action@0123456789abcdef0123456789abcdef01234567
        with:
          ${key}: \${{ inputs.credential }}
`,
        }),
      /external inputs|credential input/
    );
  }
});

test("workflow guard rejects disguised github.token delegation", () => {
  for (const value of [
    "\${{ github.token }}",
    "\${{ github . token }}",
    "\${{ GitHub.token }}",
    "\${{ github['token'] }}",
    "\${{ toJSON(github) }}",
    "\${{ GitHub.event.inputs.credential }}",
    "\${{ github . event . inputs . credential }}",
    "\${{ GitHub.event[format('{0}{1}', 'in', 'puts')].credential }}",
    "\${{ github.event[format('{0}{1}', 'in', 'puts')].credential }}",
    "\${{ toJSON(github.*) }}",
    "\${{ join(github.*, '') }}",
  ]) {
    assert.throws(
      () =>
        assertWorkflowHasNoMergeAuthority({
          path: "disguised-github-token.yml",
          source: `
name: Disguised GitHub token
permissions:
  contents: read
jobs:
  delegate:
    runs-on: ubuntu-latest
    steps:
      - uses: owner/action@0123456789abcdef0123456789abcdef01234567
        with:
          data: ${value}
`,
        }),
      /allowlisted GitHub context|event payload|external inputs|explicit credential input|serialize or dynamically index/
    );
  }
});

test("checks-write jobs reject untrusted code and artifact provenance", () => {
  for (const hostileStep of [
    `
      - uses: actions/checkout@df4cb1c069e1874edd31b4311f1884172cec0e10
        with:
          ref: refs/pull/\${{ github.event.pull_request.number }}/head`,
    `
      - uses: actions/download-artifact@0123456789abcdef0123456789abcdef01234567`,
    `
      - run: git fetch origin refs/pull/\${{ github.event.pull_request.number }}/head && npm test`,
  ]) {
    assert.throws(
      () =>
        assertWorkflowHasNoMergeAuthority({
          path: "untrusted-publisher.yml",
          source: `
name: Untrusted publisher
permissions:
  contents: read
jobs:
  publish:
    runs-on: ubuntu-latest
    if: ${trustedFixtureCondition}
    permissions:
      contents: read
      checks: write
    steps:
      - uses: actions/checkout@df4cb1c069e1874edd31b4311f1884172cec0e10
        with:
          ref: \${{ github.event.repository.default_branch }}
      - uses: actions/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e
        with:
          node-version: 22
${hostileStep}
`,
        }),
      /exactly one first-step trusted checkout|pinned Node setup action|fixed trusted publisher command|event payload/
    );
  }
});

test("checks-write jobs reject redirected checkout and execution controls", () => {
  for (const publisherMutation of [
    `
    defaults:
      run:
        shell: python
`,
    `
    env:
      NODE_OPTIONS: --require /tmp/untrusted.cjs
`,
    `
    steps:
      - uses: actions/checkout@df4cb1c069e1874edd31b4311f1884172cec0e10
        with:
          repository: attacker/repository
          ref: \${{ github.event.repository.default_branch }}
      - uses: actions/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e
        with:
          node-version: 22
`,
  ]) {
    const steps = publisherMutation.includes("steps:")
      ? ""
      : `    steps:
      - uses: actions/checkout@df4cb1c069e1874edd31b4311f1884172cec0e10
        with:
          ref: \${{ github.event.repository.default_branch }}
      - uses: actions/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e
        with:
          node-version: 22
`;
    assert.throws(
      () =>
        assertWorkflowHasNoMergeAuthority({
          path: "redirected-publisher.yml",
          source: `
name: Redirected publisher
permissions:
  contents: read
jobs:
  publish:
    runs-on: ubuntu-latest
    if: ${trustedFixtureCondition}
    permissions:
      contents: read
      checks: write
${publisherMutation}${steps}`,
        }),
      /must not override trusted execution|must not redirect or alter the trusted checkout/
    );
  }
});

test("checks-write jobs reject inherited workflow execution controls", () => {
  for (const workflowControl of [
    `defaults:
  run:
    shell: bash -c 'false; bash {0}'
`,
    `env:
  NODE_OPTIONS: --require ./untrusted.cjs
`,
  ]) {
    assert.throws(
      () =>
        assertWorkflowHasNoMergeAuthority({
          path: "inherited-control.yml",
          source: `
name: Inherited execution control
${workflowControl}permissions:
  contents: read
jobs:
  publish:
    runs-on: ubuntu-latest
    if: ${trustedFixtureCondition}
    permissions:
      contents: read
      checks: write
    steps:
      - uses: actions/checkout@df4cb1c069e1874edd31b4311f1884172cec0e10
        with:
          ref: \${{ github.event.repository.default_branch }}
`,
        }),
      /must not override trusted publisher/
    );
  }
});

test("checks-write jobs reject skip and fail-open controls", () => {
  for (const [jobControl, stepControl] of [
    ["    continue-on-error: true\n", ""],
    ["", "        if: false\n"],
    ["", "        continue-on-error: true\n"],
  ]) {
    assert.throws(
      () =>
        assertWorkflowHasNoMergeAuthority({
          path: "fail-open-control.yml",
          source: `
name: Fail-open control
permissions:
  contents: read
jobs:
  publish:
    runs-on: ubuntu-latest
    if: ${trustedFixtureCondition}
${jobControl}    permissions:
      contents: read
      checks: write
    steps:
      - uses: actions/checkout@df4cb1c069e1874edd31b4311f1884172cec0e10
        with:
          ref: \${{ github.event.repository.default_branch }}
      - uses: actions/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e
        with:
          node-version: 22
      - run: node scripts/check-migration-collisions-event-ci.mjs
${stepControl}`,
        }),
      /fail closed at the job boundary|unsupported execution condition|resume only a named trusted audit/
    );
  }
});

test("checks-write jobs require pinned Node setup before publisher commands", () => {
  assert.throws(
    () =>
      assertWorkflowHasNoMergeAuthority({
        path: "missing-node-setup.yml",
        source: `
name: Missing Node setup
permissions:
  contents: read
jobs:
  verify-stack:
    runs-on: ubuntu-latest
    if: ${trustedPublisherConditionByJob["verify-stack"]}
    permissions:
      contents: read
      checks: write
    steps:
      - uses: actions/checkout@df4cb1c069e1874edd31b4311f1884172cec0e10
        with:
          ref: \${{ github.event.repository.default_branch }}
      - run: node scripts/registry-only-validate-ci.mjs --sweep
        env:
          GITHUB_TOKEN: \${{ github.token }}
          GITHUB_DEFAULT_BRANCH: \${{ github.event.repository.default_branch }}
      - run: node scripts/revalidate-stacked-prs-ci.mjs --event-path "$GITHUB_EVENT_PATH"
        env:
          GITHUB_TOKEN: \${{ github.token }}
      - run: node scripts/registry-only-validate-ci.mjs --sweep
        env:
          GITHUB_TOKEN: \${{ github.token }}
          GITHUB_DEFAULT_BRANCH: \${{ github.event.repository.default_branch }}
`,
      }),
    /pinned Node setup as its second step/
  );
});

test("parsed workflow guard scans multiline step scalars without JSON escaping", () => {
  for (const fixture of [
    {
      source: `
name: Multiline command
permissions:
  contents: read
jobs:
  merge:
    runs-on: ubuntu-latest
    steps:
      - run: |
          echo preparing
          git -C . push origin main
`,
      error: /push to main/,
    },
    {
      source: `
name: Multiline GitHub CLI command
permissions:
  contents: read
jobs:
  merge:
    runs-on: ubuntu-latest
    steps:
      - run: |
          echo preparing
          gh pr merge 365 --merge
`,
      error: /GitHub CLI pull-request merge/,
    },
    {
      source: `
name: Multiline GitHub Script command
permissions:
  contents: read
jobs:
  merge:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/github-script@pinned
        with:
          script: |
            core.info("preparing")
            await github.request("PUT /repos/{owner}/{repo}/pulls/365/merge")
`,
      error: /GitHub pull-request merge endpoint/,
    },
  ]) {
    assert.throws(
      () =>
        assertWorkflowHasNoMergeAuthority({
          path: "multiline.yml",
          source: fixture.source,
        }),
      fixture.error
    );
  }
});

test("reusable-workflow job-level executable scalars are scanned", () => {
  assert.throws(
    () =>
      assertWorkflowHasNoMergeAuthority({
        path: "reusable-caller.yml",
        source: `
name: Reusable caller
permissions:
  contents: read
jobs:
  merge:
    uses: owner/repository/.github/workflows/reusable.yml@pinned
    with:
      command: gh --repo meelni/meelni-prep pr merge 365 --merge
`,
      }),
    /GitHub CLI pull-request merge/
  );
});

test("executable-source guard rejects merge-capable scripts regardless of filename", () => {
  for (const source of [
    "gh pr merge 365 --merge",
    "git push origin HEAD:main",
    "await octokit.rest.pulls.merge({ owner, repo, pull_number });",
    'await github.request("PUT /repos/{owner}/{repo}/pulls/365/merge");',
    "git push origin main",
    "git push --force origin +main",
    "git push origin \\\n      HEAD:main",
    "git push origin $TARGET_REF",
    "git push",
    "git push origin",
    "git push --force",
    "git push -f origin",
    "git -C . push origin main",
    "git -c push.default=current push origin main",
    "gh --repo meelni/meelni-prep pr merge 365 --merge",
    "await github.graphql(`mutation { mergePullRequest(input: $input) { clientMutationId } }`)",
    'sh -c "git push origin HEAD:main"',
    'git "$SUBCOMMAND" origin HEAD:main',
    'git -c alias.land="push origin HEAD:main" land',
  ]) {
    assert.throws(
      () => assertNoMergeAuthority(source, "arbitrary-script.mjs"),
      /exposes/
    );
  }
});

test("executable-source scope includes alternate shell and build script forms", () => {
  for (const path of [
    "release.bash",
    "release.zsh",
    "release.fish",
    "release.ps1",
    "Makefile",
    "tasks.mk",
  ]) {
    assert.equal(isExecutableFileName(path), true, `${path} must be scanned`);
  }
  const extensionlessScript = "#!/usr/bin/env bash\ngit push origin main";
  assert.equal(
    isExecutableSource("release", extensionlessScript),
    true,
    "extensionless shebang scripts must be scanned"
  );
  assert.throws(
    () => assertNoMergeAuthority(extensionlessScript, "release"),
    /push to main/
  );
  const discovered = executableFiles(".");
  assert.ok(
    discovered.includes("./scripts/check-stacked-pr.test.mjs"),
    "ordinary test executables must be scanned"
  );
  assert.equal(
    discovered.includes(
      "./scripts/registry-only-native-merge-contract.test.mjs"
    ),
    false,
    "only the structured adversarial fixture file is excluded"
  );
});

test("package scripts are parsed and scanned individually", () => {
  assert.throws(
    () =>
      assertPackageScriptsHaveNoMergeAuthority({
        scripts: {
          land: "sh -c 'gh --repo meelni/meelni-prep pr merge 365 --merge'",
        },
      }),
    /GitHub CLI pull-request merge/
  );
});

test("composite action manifests are parsed as executable sources", () => {
  for (const fixture of [
    {
      path: ".github/actions/adversarial/action.yml",
      command: "git push origin main",
      error: /push to main/,
    },
    {
      path: ".github/actions/adversarial/action.yaml",
      command: "gh pr merge 365 --merge",
      error: /GitHub CLI pull-request merge/,
    },
  ]) {
    assert.throws(
      () =>
        assertCompositeActionHasNoMergeAuthority({
          path: fixture.path,
          source: `
name: Adversarial composite
runs:
  using: composite
  steps:
    - shell: bash
      run: |
        echo preparing
        ${fixture.command}
`,
        }),
      fixture.error
    );
  }
});

test("SAV-279 hands merge authority back to native protected GitHub", () => {
  for (const source of [costControl, intake]) {
    assert.match(source, /GitHub's native protected pull-request merge/);
    assert.match(source, /validation evidence, not merge authorization/);
    assert.match(source, /merge queue is not\s+currently configured/i);
    assert.match(source, /does not\s+support `merge_group`/);
    assert.doesNotMatch(source, /repository-dispatch merge operation/);
  }
});
