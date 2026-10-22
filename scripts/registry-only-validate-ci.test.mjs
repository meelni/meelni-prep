import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { parse } from "yaml";

import {
  classifyRegistryOnlyPullRequest,
  publishRegistryOnlyValidate,
  REGISTRY_PATH,
  REQUIRED_VALIDATE_CHECK_NAME,
  registryProofGeneration,
  registryValidateExternalId,
  sweepRegistryOnlyValidate,
  verifyProposedRegistryManifest,
} from "./registry-only-validate-ci.mjs";

const REPOSITORY = "meelni/meelni-prep";
const REPOSITORY_ID = 24680;
const HEAD_SHA = "a".repeat(40);
const BASE_SHA = "b".repeat(40);
const ROOT_TREE_SHA = "1".repeat(40);
const GITHUB_TREE_SHA = "2".repeat(40);

function gitBlobSha(content) {
  const bytes = Buffer.from(content);
  return createHash("sha1")
    .update(`blob ${bytes.length}\0`)
    .update(bytes)
    .digest("hex");
}

function repository(overrides = {}) {
  return { id: REPOSITORY_ID, full_name: REPOSITORY, ...overrides };
}

function pullRequest(overrides = {}) {
  return {
    number: 368,
    state: "open",
    draft: false,
    head: {
      sha: HEAD_SHA,
      ref: "codex/register-stacks",
      repo: repository(),
    },
    base: { sha: BASE_SHA, ref: "main", repo: repository() },
    ...overrides,
  };
}

function event(overrides = {}) {
  return {
    action: "synchronize",
    repository: { ...repository(), default_branch: "main" },
    pull_request: pullRequest(),
    ...overrides,
  };
}

function env(eventName = "pull_request") {
  return {
    GITHUB_EVENT_NAME: eventName,
    GITHUB_REPOSITORY: REPOSITORY,
    GITHUB_REPOSITORY_ID: String(REPOSITORY_ID),
    GITHUB_TOKEN: "test-token",
    GITHUB_DEFAULT_BRANCH: "main",
  };
}

function registryFile(overrides = {}) {
  return {
    filename: REGISTRY_PATH,
    status: "modified",
    sha: gitBlobSha(manifest()),
    ...overrides,
  };
}

function manifest(stacks = []) {
  return `${JSON.stringify({ version: 2, repository: REPOSITORY, stacks })}\n`;
}

function manifestPayload(content = manifest()) {
  const bytes = Buffer.from(content);
  return {
    sha: gitBlobSha(content),
    encoding: "base64",
    size: bytes.length,
    content: bytes.toString("base64"),
  };
}

function apiFixture({
  currentPull = pullRequest(),
  files,
  proposedManifest = manifest(),
  openPulls = [pullRequest()],
  pullsByNumber = {},
  filesByNumber = {},
  objectOverrides = {},
} = {}) {
  const calls = [];
  let currentPullReads = 0;
  const proposedBlobSha = gitBlobSha(proposedManifest);
  const resolvedFiles = files ?? [registryFile({ sha: proposedBlobSha })];
  const api = async ({ path, method = "GET", body }) => {
    calls.push({ path, method, body });
    if (path === "/check-runs" && method === "POST") {
      return { id: 901, ...body };
    }
    if (path === "/check-runs/901" && method === "PATCH") {
      return { id: 901, ...body };
    }
    const pullMatch = path.match(/^\/pulls\/(\d+)$/);
    if (pullMatch?.[1] === "368") {
      currentPullReads += 1;
      return typeof currentPull === "function"
        ? currentPull(currentPullReads)
        : currentPull;
    }
    if (pullMatch) {
      const number = Number(pullMatch[1]);
      return (
        pullsByNumber[number] ??
        openPulls.find((pull) => pull.number === number) ??
        (() => {
          throw new Error(`missing_pull_fixture:${number}`);
        })()
      );
    }
    const filesMatch = path.match(/^\/pulls\/(\d+)\/files\?/);
    if (filesMatch?.[1] === "368") return resolvedFiles;
    if (filesMatch) {
      const number = Number(filesMatch[1]);
      return (
        filesByNumber[number] ?? [
          { filename: `docs/pr-${number}.md`, status: "modified" },
        ]
      );
    }
    if (path === `/git/commits/${HEAD_SHA}`) {
      return {
        sha: HEAD_SHA,
        tree: { sha: ROOT_TREE_SHA },
        ...objectOverrides.commit,
      };
    }
    if (path === `/git/trees/${ROOT_TREE_SHA}`) {
      return {
        sha: ROOT_TREE_SHA,
        truncated: false,
        tree: [
          {
            path: ".github",
            mode: "040000",
            type: "tree",
            sha: GITHUB_TREE_SHA,
          },
        ],
        ...objectOverrides.rootTree,
      };
    }
    if (path === `/git/trees/${GITHUB_TREE_SHA}`) {
      return {
        sha: GITHUB_TREE_SHA,
        truncated: false,
        tree: [
          {
            path: "stacked-prs.json",
            mode: "100644",
            type: "blob",
            sha: proposedBlobSha,
          },
        ],
        ...objectOverrides.githubTree,
      };
    }
    if (path === `/git/blobs/${proposedBlobSha}`) {
      return {
        ...manifestPayload(proposedManifest),
        ...objectOverrides.blob,
      };
    }
    if (path.startsWith("/pulls?state=open&")) return openPulls;
    throw new Error(`unexpected_api_path:${method}:${path}`);
  };
  return { api, calls };
}

test("exact modified registry-only PR is eligible for trusted validation", async () => {
  const fixture = apiFixture();
  const result = await classifyRegistryOnlyPullRequest({
    eventContent: JSON.stringify(event()),
    env: env(),
    api: fixture.api,
  });

  assert.equal(result.eligible, true);
  assert.equal(result.status, "eligible");
  assert.deepEqual(result.files, [registryFile()]);
});

test("GitHub path suppression cannot be extended by app or publisher tampering", () => {
  const workflow = parse(readFileSync(".github/workflows/ci.yml", "utf8"));
  const ignored = workflow.on.pull_request["paths-ignore"];
  assert.deepEqual(ignored, [REGISTRY_PATH]);

  const workflowRunsFor = (paths) =>
    paths.some((path) => !ignored.includes(path));
  assert.equal(workflowRunsFor([REGISTRY_PATH]), false);
  assert.equal(workflowRunsFor([REGISTRY_PATH, "app/page.tsx"]), true);
  assert.equal(
    workflowRunsFor([REGISTRY_PATH, "scripts/registry-only-validate-ci.mjs"]),
    true
  );
  assert.equal(
    workflowRunsFor([REGISTRY_PATH, ".github/workflows/ci.yml"]),
    true
  );
});

test("extra paths require ordinary full Validate", async () => {
  const fixture = apiFixture({
    files: [registryFile(), { filename: "app/page.tsx", status: "modified" }],
  });
  const result = await classifyRegistryOnlyPullRequest({
    eventContent: JSON.stringify(event()),
    env: env(),
    api: fixture.api,
  });
  assert.equal(result.eligible, false);
  assert.equal(result.status, "trusted_validate_not_eligible");
});

for (const [name, file] of [
  ["deleted", registryFile({ status: "removed" })],
  [
    "renamed",
    registryFile({
      status: "renamed",
      previous_filename: ".github/old-stacked-prs.json",
    }),
  ],
  ["added", registryFile({ status: "added" })],
]) {
  test(`${name} registry manifests are ineligible for trusted Validate`, async () => {
    const fixture = apiFixture({ files: [file] });
    const result = await classifyRegistryOnlyPullRequest({
      eventContent: JSON.stringify(event()),
      env: env(),
      api: fixture.api,
    });
    assert.equal(result.eligible, false);
  });
}

test("removed registry file has neither ordinary nor synthetic Validate", async () => {
  const workflow = parse(readFileSync(".github/workflows/ci.yml", "utf8"));
  assert.deepEqual(workflow.on.pull_request["paths-ignore"], [REGISTRY_PATH]);
  const fixture = apiFixture({
    files: [registryFile({ status: "removed" })],
  });
  const result = await publishRegistryOnlyValidate({
    eventContent: JSON.stringify(event()),
    env: env("pull_request_target"),
    api: fixture.api,
  });
  assert.equal(result.eligible, false);
  assert.equal(result.status, "trusted_validate_not_eligible");
  assert.equal(
    fixture.calls.some((call) => call.path === "/check-runs"),
    false
  );
});

test("fork PRs cannot use the trusted fast path", async () => {
  const fork = repository({ id: 999, full_name: "attacker/fork" });
  const forkPull = pullRequest({
    head: { sha: HEAD_SHA, ref: "spoof", repo: fork },
  });
  const fixture = apiFixture({ currentPull: forkPull });
  const result = await classifyRegistryOnlyPullRequest({
    eventContent: JSON.stringify(event({ pull_request: forkPull })),
    env: env(),
    api: fixture.api,
  });
  assert.equal(result.eligible, false);
});

test("repository identity spoofing fails before API access", async () => {
  const fixture = apiFixture();
  await assert.rejects(
    classifyRegistryOnlyPullRequest({
      eventContent: JSON.stringify(event()),
      env: { ...env(), GITHUB_REPOSITORY_ID: "999" },
      api: fixture.api,
    }),
    /registry_validate_environment_repository_mismatch/
  );
  assert.equal(fixture.calls.length, 0);
});

test("stale head and base snapshots fail closed", async (t) => {
  await t.test("head changed", async () => {
    const fixture = apiFixture({
      currentPull: pullRequest({
        head: {
          sha: "c".repeat(40),
          ref: "codex/register-stacks",
          repo: repository(),
        },
      }),
    });
    await assert.rejects(
      classifyRegistryOnlyPullRequest({
        eventContent: JSON.stringify(event()),
        env: env(),
        api: fixture.api,
      }),
      /registry_validate_head_changed/
    );
  });

  await t.test("base changed", async () => {
    const fixture = apiFixture({
      currentPull: pullRequest({
        base: { sha: "d".repeat(40), ref: "main", repo: repository() },
      }),
    });
    await assert.rejects(
      classifyRegistryOnlyPullRequest({
        eventContent: JSON.stringify(event()),
        env: env(),
        api: fixture.api,
      }),
      /registry_validate_base_changed/
    );
  });
});

test("paginated file inventories cannot hide an extra path", async () => {
  const calls = [];
  const api = async ({ path }) => {
    calls.push(path);
    if (path === "/pulls/368") return pullRequest();
    if (path.endsWith("page=1")) {
      return Array.from({ length: 100 }, (_, index) => ({
        filename: index === 0 ? REGISTRY_PATH : `docs/${index}.md`,
        status: "modified",
      }));
    }
    if (path.endsWith("page=2")) {
      return [{ filename: "app/page.tsx", status: "modified" }];
    }
    throw new Error(`unexpected_api_path:${path}`);
  };
  const result = await classifyRegistryOnlyPullRequest({
    eventContent: JSON.stringify(event()),
    env: env(),
    api,
  });
  assert.equal(result.eligible, false);
  assert.equal(calls.filter((path) => path.includes("/files?")).length, 2);
});

test("API failures never synthesize Validate", async () => {
  const calls = [];
  const api = async (request) => {
    calls.push(request);
    throw new Error("stack_gate_github_api_failed:503");
  };
  await assert.rejects(
    publishRegistryOnlyValidate({
      eventContent: JSON.stringify(event()),
      env: env("pull_request_target"),
      api,
    }),
    /503/
  );
  assert.equal(
    calls.some((call) => call.path === "/check-runs"),
    false
  );
});

test("proposed manifest rejects missing open stack declarations", async () => {
  const stackedPull = pullRequest({
    number: 365,
    head: { sha: "e".repeat(40), ref: "child", repo: repository() },
    base: { sha: "f".repeat(40), ref: "parent", repo: repository() },
  });
  const fixture = apiFixture({ openPulls: [stackedPull] });
  const classification = await classifyRegistryOnlyPullRequest({
    eventContent: JSON.stringify(event()),
    env: env(),
    api: fixture.api,
  });
  await assert.rejects(
    verifyProposedRegistryManifest({
      manifestContent: manifest(),
      classification,
      env: env(),
      api: fixture.api,
      resolveStack: async () => {
        throw new Error("must_not_resolve");
      },
    }),
    /registry_validate_open_stack_inventory_invalid/
  );
});

test("trusted publisher verifies two stable generations before exact-head success", async () => {
  const entry = {
    pr: 365,
    parentPr: 363,
    headRef: "child",
    parentRef: "parent",
  };
  const stackedPull = pullRequest({
    number: 365,
    head: { sha: "e".repeat(40), ref: "child", repo: repository() },
    base: { sha: "f".repeat(40), ref: "parent", repo: repository() },
  });
  const fixture = apiFixture({
    proposedManifest: manifest([entry]),
    openPulls: [pullRequest(), stackedPull],
  });
  let resolutions = 0;
  const result = await publishRegistryOnlyValidate({
    eventContent: JSON.stringify(event()),
    env: env("pull_request_target"),
    api: fixture.api,
    resolveStack: async ({ prNumber, manifest: proposed }) => {
      resolutions += 1;
      assert.equal(prNumber, 365);
      assert.deepEqual(proposed.stacks, [entry]);
      return {
        status: "pass",
        head: "e".repeat(40),
        actualParentHead: "f".repeat(40),
        mergeBase: "f".repeat(40),
      };
    },
  });

  assert.equal(result.status, "published");
  assert.equal(resolutions, 2);
  const publication = fixture.calls.find((call) => call.path === "/check-runs");
  assert.equal(publication.body.name, REQUIRED_VALIDATE_CHECK_NAME);
  assert.equal(publication.body.head_sha, HEAD_SHA);
  assert.equal(publication.body.status, "in_progress");
  const completion = fixture.calls.find(
    (call) => call.path === "/check-runs/901"
  );
  assert.equal(completion.body.conclusion, "success");
  assert.equal(
    completion.body.external_id,
    registryValidateExternalId(
      result.proof && {
        repository: { id: REPOSITORY_ID },
        pullRequest: {
          number: 368,
          headSha: HEAD_SHA,
          baseSha: BASE_SHA,
        },
      },
      registryProofGeneration(result.proof)
    )
  );
  assert.match(completion.body.output.summary, /No pull-request code/);
  assert.ok(
    fixture.calls.indexOf(publication) <
      fixture.calls.findIndex((call) => call.path.startsWith("/git/commits/"))
  );
});

test("trusted publisher rejects a registry path backed by a symlink", async () => {
  const fixture = apiFixture({
    objectOverrides: {
      githubTree: {
        sha: GITHUB_TREE_SHA,
        truncated: false,
        tree: [
          {
            path: "stacked-prs.json",
            mode: "120000",
            type: "blob",
            sha: gitBlobSha(manifest()),
          },
        ],
      },
    },
  });

  const result = await publishRegistryOnlyValidate({
    eventContent: JSON.stringify(event()),
    env: env("pull_request_target"),
    api: fixture.api,
  });

  assert.equal(result.status, "failure_published");
  assert.match(result.error, /registry_validate_manifest_object_invalid/);
});

test("trusted publisher rejects sensitive content without echoing it", async () => {
  const secret = `${["phx", "_"].join("")}${"Z".repeat(40)}`;
  const proposedManifest = `${JSON.stringify({
    version: 2,
    repository: REPOSITORY,
    stacks: [],
    note: secret,
  })}\n`;
  const fixture = apiFixture({ proposedManifest });

  const result = await publishRegistryOnlyValidate({
    eventContent: JSON.stringify(event()),
    env: env("pull_request_target"),
    api: fixture.api,
  });

  assert.equal(result.status, "failure_published");
  assert.match(result.error, /registry_validate_manifest_sensitive_content/);
  assert.equal(JSON.stringify(result).includes(secret), false);
  const completion = fixture.calls.find(
    (call) => call.path === "/check-runs/901"
  );
  assert.equal(completion.body.conclusion, "failure");
  assert.equal(JSON.stringify(completion.body).includes(secret), false);
});

test("trusted publisher scans decoded JSON strings without echoing them", async () => {
  const secret = `${["phx", "_"].join("")}${"Y".repeat(40)}`;
  const escapedSecret = [...secret]
    .map(
      (character) =>
        `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`
    )
    .join("");
  const proposedManifest =
    `{"version":2,"repository":"${REPOSITORY}","stacks":[],` +
    `"note":"${escapedSecret}"}\n`;
  assert.equal(proposedManifest.includes(secret), false);
  const fixture = apiFixture({ proposedManifest });

  const result = await publishRegistryOnlyValidate({
    eventContent: JSON.stringify(event()),
    env: env("pull_request_target"),
    api: fixture.api,
  });

  assert.equal(result.status, "failure_published");
  assert.match(result.error, /registry_validate_manifest_sensitive_content/);
  assert.equal(JSON.stringify(result).includes(secret), false);
  const completion = fixture.calls.find(
    (call) => call.path === "/check-runs/901"
  );
  assert.equal(completion.body.conclusion, "failure");
  assert.equal(JSON.stringify(completion.body).includes(secret), false);
});

test("trusted publisher scans overwritten duplicate JSON strings", async () => {
  const secret = `${["phx", "_"].join("")}${"X".repeat(40)}`;
  const escapedSecret = [...secret]
    .map(
      (character) =>
        `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`
    )
    .join("");
  const proposedManifest =
    `{"version":2,"repository":"${REPOSITORY}","stacks":[],` +
    `"note":"${escapedSecret}","note":"safe"}\n`;
  assert.equal(proposedManifest.includes(secret), false);
  assert.equal(
    JSON.stringify(JSON.parse(proposedManifest)).includes(secret),
    false
  );
  const fixture = apiFixture({ proposedManifest });

  const result = await publishRegistryOnlyValidate({
    eventContent: JSON.stringify(event()),
    env: env("pull_request_target"),
    api: fixture.api,
  });

  assert.equal(result.status, "failure_published");
  assert.match(result.error, /registry_validate_manifest_sensitive_content/);
  assert.equal(JSON.stringify(result).includes(secret), false);
  const completion = fixture.calls.find(
    (call) => call.path === "/check-runs/901"
  );
  assert.equal(completion.body.conclusion, "failure");
  assert.equal(JSON.stringify(completion.body).includes(secret), false);
});

test("real Git symlink mode cannot pass trusted registry validation", async (t) => {
  const repo = mkdtempSync(join(tmpdir(), "meelni-registry-symlink-"));
  t.after(() => rmSync(repo, { recursive: true, force: true }));
  const git = (...args) =>
    execFileSync("git", args, { cwd: repo, encoding: "utf8" }).trim();
  git("init", "--initial-branch=main");
  git("config", "user.name", "Fixture");
  git("config", "user.email", "fixture@example.com");
  mkdirSync(join(repo, ".github"));
  writeFileSync(join(repo, "registry-target.json"), manifest());
  symlinkSync("../registry-target.json", join(repo, REGISTRY_PATH));
  git("add", ".");
  git("commit", "-m", "symlink fixture");

  const headSha = git("rev-parse", "HEAD");
  const rootTreeSha = git("rev-parse", "HEAD^{tree}");
  const githubTreeSha = git("rev-parse", "HEAD:.github");
  const registryBlobSha = git("rev-parse", `HEAD:${REGISTRY_PATH}`);
  const [mode, type] = git("ls-tree", "HEAD", REGISTRY_PATH)
    .split(/\s+/)
    .slice(0, 2);
  assert.deepEqual([mode, type], ["120000", "blob"]);

  const fixturePull = pullRequest({
    head: {
      sha: headSha,
      ref: "codex/symlink-registry",
      repo: repository(),
    },
  });
  const calls = [];
  const api = async ({ path, method = "GET", body }) => {
    calls.push({ path, method, body });
    if (path === "/pulls/368") return fixturePull;
    if (path.startsWith("/pulls/368/files?")) {
      return [registryFile({ sha: registryBlobSha })];
    }
    if (path === "/check-runs" && method === "POST") return { id: 901 };
    if (path === "/check-runs/901" && method === "PATCH") return { id: 901 };
    if (path === `/git/commits/${headSha}`) {
      return { sha: headSha, tree: { sha: rootTreeSha } };
    }
    if (path === `/git/trees/${rootTreeSha}`) {
      return {
        sha: rootTreeSha,
        truncated: false,
        tree: [
          {
            path: ".github",
            mode: "040000",
            type: "tree",
            sha: githubTreeSha,
          },
        ],
      };
    }
    if (path === `/git/trees/${githubTreeSha}`) {
      return {
        sha: githubTreeSha,
        truncated: false,
        tree: [
          {
            path: "stacked-prs.json",
            mode,
            type,
            sha: registryBlobSha,
          },
        ],
      };
    }
    throw new Error(`unexpected_api_path:${method}:${path}`);
  };

  const result = await publishRegistryOnlyValidate({
    eventContent: JSON.stringify(event({ pull_request: fixturePull })),
    env: env("pull_request_target"),
    api,
  });
  assert.equal(result.status, "failure_published");
  assert.match(result.error, /registry_validate_manifest_object_invalid/);
  assert.equal(
    calls.some((call) => call.path.startsWith("/git/blobs/")),
    false
  );
});

test("registry object traversal rejects unsafe Git object shapes", async (t) => {
  const normalEntry = {
    path: "stacked-prs.json",
    mode: "100644",
    type: "blob",
    sha: gitBlobSha(manifest()),
  };
  const cases = [
    [
      "executable registry",
      {
        githubTree: {
          sha: GITHUB_TREE_SHA,
          truncated: false,
          tree: [{ ...normalEntry, mode: "100755" }],
        },
      },
    ],
    [
      "gitlink registry",
      {
        githubTree: {
          sha: GITHUB_TREE_SHA,
          truncated: false,
          tree: [{ ...normalEntry, mode: "160000", type: "commit" }],
        },
      },
    ],
    [
      "missing registry",
      { githubTree: { sha: GITHUB_TREE_SHA, truncated: false, tree: [] } },
    ],
    [
      "ambiguous registry",
      {
        githubTree: {
          sha: GITHUB_TREE_SHA,
          truncated: false,
          tree: [normalEntry, { ...normalEntry }],
        },
      },
    ],
    ["truncated root tree", { rootTree: { truncated: true } }],
    ["truncated .github tree", { githubTree: { truncated: true } }],
    ["wrong commit SHA", { commit: { sha: "9".repeat(40) } }],
    ["wrong root-tree SHA", { rootTree: { sha: "9".repeat(40) } }],
  ];

  for (const [name, objectOverrides] of cases) {
    await t.test(name, async () => {
      const fixture = apiFixture({ objectOverrides });
      const result = await publishRegistryOnlyValidate({
        eventContent: JSON.stringify(event()),
        env: env("pull_request_target"),
        api: fixture.api,
      });
      assert.equal(result.status, "failure_published");
      assert.match(result.error, /registry_validate_manifest_object_invalid/);
      assert.equal(
        fixture.calls.find((call) => call.path === "/check-runs/901").body
          .conclusion,
        "failure"
      );
    });
  }
});

test("registry blob decoding rejects unbound or malformed bytes", async (t) => {
  const cases = [
    [
      "tree SHA differs from Pull Files SHA",
      {
        files: [registryFile({ sha: "8".repeat(40) })],
        expected: /registry_validate_manifest_sha_mismatch/,
      },
    ],
    [
      "blob response SHA differs from tree SHA",
      {
        objectOverrides: { blob: { sha: "8".repeat(40) } },
        expected: /registry_validate_manifest_payload_invalid/,
      },
    ],
    [
      "declared size differs from decoded size",
      {
        objectOverrides: { blob: { size: 1 } },
        expected: /registry_validate_manifest_size_mismatch/,
      },
    ],
    [
      "base64 is not canonical",
      {
        objectOverrides: { blob: { content: "!!!!" } },
        expected: /registry_validate_manifest_base64_invalid/,
      },
    ],
    [
      "decoded bytes do not hash to the bound blob SHA",
      {
        objectOverrides: {
          blob: {
            content: Buffer.from(
              manifest().replace("version", "versioN")
            ).toString("base64"),
          },
        },
        expected: /registry_validate_manifest_sha_mismatch/,
      },
    ],
    [
      "blob bytes are not valid UTF-8",
      {
        proposedManifest: Buffer.from([0xff]),
        expected: /registry_validate_manifest_utf8_invalid/,
      },
    ],
    [
      "blob exceeds the byte bound",
      {
        proposedManifest: Buffer.alloc(256 * 1024 + 1, 0x61),
        expected: /registry_validate_manifest_payload_invalid/,
      },
    ],
  ];

  for (const [name, options] of cases) {
    await t.test(name, async () => {
      const fixture = apiFixture(options);
      const result = await publishRegistryOnlyValidate({
        eventContent: JSON.stringify(event()),
        env: env("pull_request_target"),
        api: fixture.api,
      });
      assert.equal(result.status, "failure_published");
      assert.match(result.error, options.expected);
      assert.equal(
        fixture.calls.some(
          (call) =>
            call.path === "/check-runs/901" &&
            call.body?.conclusion === "success"
        ),
        false
      );
    });
  }
});

test("trusted sweep refreshes every open exact-registry snapshot", async () => {
  const fixture = apiFixture();
  const result = await sweepRegistryOnlyValidate({
    env: env("pull_request_target"),
    api: fixture.api,
  });
  assert.equal(result.status, "complete");
  assert.deepEqual(result.results, [
    { pr: 368, headSha: HEAD_SHA, status: "published" },
  ]);
  assert.equal(
    fixture.calls.filter((call) => call.path === "/check-runs").length,
    1
  );
  assert.equal(
    fixture.calls.find((call) => call.path === "/check-runs").body.status,
    "in_progress"
  );
  assert.equal(
    fixture.calls.find((call) => call.path === "/check-runs/901").body
      .conclusion,
    "success"
  );
});

test("sweep skips drafts, forks, malformed rows, and non-registry PRs", async () => {
  const ordinary = pullRequest({
    number: 369,
    head: { sha: "c".repeat(40), ref: "ordinary", repo: repository() },
  });
  const draft = pullRequest({
    number: 370,
    draft: true,
    head: { sha: "d".repeat(40), ref: "draft", repo: repository() },
  });
  const fork = pullRequest({
    number: 371,
    head: {
      sha: "e".repeat(40),
      ref: "fork",
      repo: { id: 999, full_name: "attacker/fork" },
    },
  });
  const malformed = pullRequest({
    number: 372,
    head: { sha: "f".repeat(40), ref: "malformed", repo: null },
  });
  const fixture = apiFixture({
    openPulls: [draft, ordinary, fork, malformed, pullRequest()],
    pullsByNumber: { 369: ordinary },
    filesByNumber: {
      369: [{ filename: "app/page.tsx", status: "modified" }],
    },
  });

  const result = await sweepRegistryOnlyValidate({
    env: env("pull_request_target"),
    api: fixture.api,
  });
  assert.equal(result.status, "complete");
  assert.deepEqual(result.results, [
    { pr: 368, headSha: HEAD_SHA, status: "published" },
  ]);
  assert.equal(
    fixture.calls.some((call) => call.path === "/pulls/370"),
    false
  );
  assert.equal(
    fixture.calls.some((call) => call.path === "/pulls/371"),
    false
  );
  assert.equal(
    fixture.calls.some((call) => call.path === "/pulls/372"),
    false
  );
  assert.equal(
    fixture.calls.some((call) => call.path === "/pulls/369"),
    true
  );
});

test("a later topology change replaces stale registry success with failure", async () => {
  const entry = {
    pr: 365,
    parentPr: 363,
    headRef: "child",
    parentRef: "parent",
  };
  const stackedPull = pullRequest({
    number: 365,
    head: { sha: "e".repeat(40), ref: "child", repo: repository() },
    base: { sha: "f".repeat(40), ref: "parent", repo: repository() },
  });
  const fixture = apiFixture({
    proposedManifest: manifest([entry]),
    openPulls: [pullRequest(), stackedPull],
  });
  const result = await sweepRegistryOnlyValidate({
    env: env("pull_request_target"),
    api: fixture.api,
    resolveStack: async () => ({
      status: "fail",
      errors: ["head_does_not_contain_current_parent"],
    }),
  });

  assert.equal(result.status, "complete");
  assert.equal(result.results[0].status, "failure_published");
  const pending = fixture.calls.find((call) => call.path === "/check-runs");
  assert.equal(pending.body.name, REQUIRED_VALIDATE_CHECK_NAME);
  assert.equal(pending.body.head_sha, HEAD_SHA);
  assert.equal(pending.body.status, "in_progress");
  const failure = fixture.calls.find((call) => call.path === "/check-runs/901");
  assert.equal(failure.body.conclusion, "failure");
  assert.match(failure.body.output.summary, /refused registry-only success/);
});

test("trusted code push sweeps registry snapshots without PR event authority", async () => {
  const fixture = apiFixture();
  const result = await sweepRegistryOnlyValidate({
    env: env("push"),
    api: fixture.api,
  });
  assert.equal(result.status, "complete");
  assert.equal(result.results[0].status, "published");
});

test("unused repository dispatch cannot invoke trusted publication", async () => {
  const api = async () => {
    throw new Error("repository dispatch must fail before GitHub API access");
  };
  await assert.rejects(
    publishRegistryOnlyValidate({
      eventContent: JSON.stringify(event()),
      env: env("repository_dispatch"),
      api,
    }),
    /registry_validate_publisher_event_invalid/
  );
  await assert.rejects(
    sweepRegistryOnlyValidate({ env: env("repository_dispatch"), api }),
    /registry_validate_sweep_event_invalid/
  );
});

test("concurrent head movement prevents publication", async () => {
  let moved = false;
  const fixture = apiFixture({
    currentPull: () =>
      moved
        ? pullRequest({
            head: {
              sha: "c".repeat(40),
              ref: "codex/register-stacks",
              repo: repository(),
            },
          })
        : pullRequest(),
  });
  const result = await publishRegistryOnlyValidate({
    eventContent: JSON.stringify(event()),
    env: env("pull_request_target"),
    api: fixture.api,
    beforeFreshnessBarrier: async () => {
      const pending = fixture.calls.find((call) => call.path === "/check-runs");
      assert.equal(pending.body.status, "in_progress");
      assert.equal(
        fixture.calls.some((call) => call.path === "/check-runs/901"),
        false
      );
      moved = true;
    },
  });
  assert.equal(result.status, "failure_published");
  assert.match(result.error, /registry_validate_head_changed/);
  assert.equal(
    fixture.calls.find((call) => call.path === "/check-runs/901").body
      .conclusion,
    "failure"
  );
});

test("completion infrastructure failure leaves the newest check pending", async () => {
  const fixture = apiFixture();
  const api = async (request) => {
    if (request.path === "/check-runs/901") {
      fixture.calls.push(request);
      throw new Error("stack_gate_github_api_failed:503");
    }
    return fixture.api(request);
  };
  await assert.rejects(
    publishRegistryOnlyValidate({
      eventContent: JSON.stringify(event()),
      env: env("pull_request_target"),
      api,
    }),
    /503/
  );
  const pending = fixture.calls.find(
    (call) => call.path === "/check-runs" && call.method === "POST"
  );
  assert.equal(pending.body.status, "in_progress");
  assert.equal(
    fixture.calls.filter((call) => call.path === "/check-runs/901").length,
    2
  );
  assert.equal(
    fixture.calls.some(
      (call) =>
        call.path === "/check-runs/901" &&
        call.body?.status === "completed" &&
        call.body?.conclusion === "success"
    ),
    true
  );
});

test("topology failures and malformed manifests publish no success", async (t) => {
  const entry = {
    pr: 365,
    parentPr: 363,
    headRef: "child",
    parentRef: "parent",
  };
  const stackedPull = pullRequest({
    number: 365,
    head: { sha: "e".repeat(40), ref: "child", repo: repository() },
    base: { sha: "f".repeat(40), ref: "parent", repo: repository() },
  });

  await t.test("invalid topology", async () => {
    const fixture = apiFixture({
      proposedManifest: manifest([entry]),
      openPulls: [stackedPull],
    });
    const result = await publishRegistryOnlyValidate({
      eventContent: JSON.stringify(event()),
      env: env("pull_request_target"),
      api: fixture.api,
      resolveStack: async () => ({ status: "fail" }),
    });
    assert.equal(result.status, "failure_published");
    assert.match(result.error, /registry_validate_declared_stack_invalid/);
    assert.equal(
      fixture.calls.find((call) => call.path === "/check-runs/901").body
        .conclusion,
      "failure"
    );
  });

  await t.test("malformed manifest", async () => {
    const fixture = apiFixture({ proposedManifest: "{}\n" });
    const result = await publishRegistryOnlyValidate({
      eventContent: JSON.stringify(event()),
      env: env("pull_request_target"),
      api: fixture.api,
    });
    assert.equal(result.status, "failure_published");
    assert.match(result.error, /stack_manifest_invalid_shape/);
    assert.equal(
      fixture.calls.find((call) => call.path === "/check-runs/901").body
        .conclusion,
      "failure"
    );
  });

  await t.test("unknown errors collapse to a fixed public code", async () => {
    const fixture = apiFixture({
      proposedManifest: manifest([entry]),
      openPulls: [stackedPull],
    });
    const result = await publishRegistryOnlyValidate({
      eventContent: JSON.stringify(event()),
      env: env("pull_request_target"),
      api: fixture.api,
      resolveStack: async () => {
        throw new Error("provider failure secret=must-not-leak");
      },
    });
    assert.equal(result.status, "failure_published");
    const summary = fixture.calls.find(
      (call) => call.path === "/check-runs/901"
    ).body.output.summary;
    assert.match(summary, /registry_validate_verification_failed/);
    assert.doesNotMatch(summary, /provider|secret|must-not-leak/);
  });
});
