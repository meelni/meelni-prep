import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  parseStackManifest,
  validatePullRequestDeclaration,
} from "./check-stacked-pr.mjs";
import { githubApi, resolveRegisteredStack } from "./check-stacked-pr-ci.mjs";

export const REGISTRY_PATH = ".github/stacked-prs.json";
export const REQUIRED_VALIDATE_CHECK_NAME = "Validate";

const SHA_PATTERN = /^[0-9a-f]{40}$/;
const MAX_PAGES = 30;
const MAX_MANIFEST_BYTES = 256 * 1024;
const TRUSTED_PUBLISHER_EVENTS = new Set([
  "pull_request_target",
  "push",
  "workflow_dispatch",
]);

function fail(code) {
  throw new Error(code);
}

function parsePositiveInteger(value, code) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1) fail(code);
  return number;
}

function parseEvent(eventContent) {
  let event;
  try {
    event = JSON.parse(eventContent);
  } catch {
    fail("registry_validate_event_json_invalid");
  }
  const pullRequest = event?.pull_request;
  if (!pullRequest) fail("registry_validate_pull_request_missing");
  return { event, pullRequest };
}

function repositoryIdentity(repository, prefix) {
  const fullName = repository?.full_name;
  const id = repository?.id;
  if (typeof fullName !== "string" || fullName.length === 0) {
    fail(`${prefix}_name_invalid`);
  }
  return {
    fullName,
    id: parsePositiveInteger(id, `${prefix}_id_invalid`),
  };
}

function pullRequestIdentity(pullRequest, prefix) {
  const number = parsePositiveInteger(
    pullRequest?.number,
    `${prefix}_number_invalid`
  );
  const headSha = pullRequest?.head?.sha;
  const baseSha = pullRequest?.base?.sha;
  if (!SHA_PATTERN.test(headSha ?? "")) fail(`${prefix}_head_sha_invalid`);
  if (!SHA_PATTERN.test(baseSha ?? "")) fail(`${prefix}_base_sha_invalid`);
  if (typeof pullRequest?.head?.ref !== "string") {
    fail(`${prefix}_head_ref_invalid`);
  }
  if (typeof pullRequest?.base?.ref !== "string") {
    fail(`${prefix}_base_ref_invalid`);
  }
  return {
    number,
    state: pullRequest.state,
    draft: pullRequest.draft,
    headSha,
    headRef: pullRequest.head.ref,
    headRepository: repositoryIdentity(
      pullRequest.head.repo,
      `${prefix}_head_repository`
    ),
    baseSha,
    baseRef: pullRequest.base.ref,
    baseRepository: repositoryIdentity(
      pullRequest.base.repo,
      `${prefix}_base_repository`
    ),
  };
}

export function bindRegistryPullRequestEvent({
  eventContent,
  env = process.env,
  allowedEventNames = new Set([
    "pull_request",
    "pull_request_target",
    "push",
    "workflow_dispatch",
  ]),
} = {}) {
  if (!allowedEventNames.has(env.GITHUB_EVENT_NAME)) {
    fail("registry_validate_event_name_invalid");
  }
  const { event, pullRequest } = parseEvent(eventContent);
  const repository = repositoryIdentity(
    event.repository,
    "registry_validate_event_repository"
  );
  if (
    env.GITHUB_REPOSITORY !== repository.fullName ||
    String(env.GITHUB_REPOSITORY_ID) !== String(repository.id)
  ) {
    fail("registry_validate_environment_repository_mismatch");
  }
  const defaultBranch = event.repository?.default_branch;
  if (typeof defaultBranch !== "string" || defaultBranch.length === 0) {
    fail("registry_validate_default_branch_invalid");
  }
  return {
    eventName: env.GITHUB_EVENT_NAME,
    action: event.action,
    repository,
    defaultBranch,
    pullRequest: pullRequestIdentity(
      pullRequest,
      "registry_validate_event_pull_request"
    ),
  };
}

function sameRepository(left, right) {
  return left.fullName === right.fullName && left.id === right.id;
}

function assertFreshSnapshot({ binding, current }) {
  const expected = binding.pullRequest;
  if (current.number !== expected.number) {
    fail("registry_validate_pr_number_changed");
  }
  if (current.state !== "open" || current.draft !== false) {
    fail("registry_validate_pr_not_ready");
  }
  if (
    current.headSha !== expected.headSha ||
    current.headRef !== expected.headRef
  ) {
    fail("registry_validate_head_changed");
  }
  if (
    current.baseSha !== expected.baseSha ||
    current.baseRef !== expected.baseRef
  ) {
    fail("registry_validate_base_changed");
  }
  if (
    !sameRepository(current.headRepository, expected.headRepository) ||
    !sameRepository(current.baseRepository, expected.baseRepository)
  ) {
    fail("registry_validate_repository_snapshot_changed");
  }
}

async function listPaginated({
  token,
  repository,
  path,
  api = githubApi,
  fetchImpl,
}) {
  const items = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const separator = path.includes("?") ? "&" : "?";
    const payload = await api({
      token,
      repository,
      path: `${path}${separator}per_page=100&page=${page}`,
      fetchImpl,
    });
    if (!Array.isArray(payload)) fail("registry_validate_page_invalid");
    items.push(...payload);
    if (payload.length < 100) return items;
  }
  fail("registry_validate_pagination_incomplete");
}

function exactRegistryFile(files) {
  const file = files[0];
  return files.length === 1 &&
    file?.filename === REGISTRY_PATH &&
    file?.status === "modified" &&
    file?.previous_filename == null &&
    SHA_PATTERN.test(file?.sha ?? "")
    ? file
    : null;
}

function couldBeRegistryCandidate(pullRequest, repository, defaultBranch) {
  return (
    pullRequest?.state === "open" &&
    pullRequest?.draft === false &&
    pullRequest?.head?.repo?.full_name === repository.fullName &&
    pullRequest?.head?.repo?.id === repository.id &&
    pullRequest?.base?.repo?.full_name === repository.fullName &&
    pullRequest?.base?.repo?.id === repository.id &&
    pullRequest?.base?.ref === defaultBranch &&
    typeof pullRequest?.head?.ref === "string" &&
    SHA_PATTERN.test(pullRequest?.head?.sha ?? "") &&
    SHA_PATTERN.test(pullRequest?.base?.sha ?? "")
  );
}

export async function classifyRegistryOnlyPullRequest({
  eventContent,
  env = process.env,
  api = githubApi,
  fetchImpl,
} = {}) {
  const binding = bindRegistryPullRequestEvent({ eventContent, env });
  const token = env.GITHUB_TOKEN;
  const currentPayload = await api({
    token,
    repository: binding.repository.fullName,
    path: `/pulls/${binding.pullRequest.number}`,
    fetchImpl,
  });
  const current = pullRequestIdentity(
    currentPayload,
    "registry_validate_current_pull_request"
  );
  assertFreshSnapshot({ binding, current });

  const files = await listPaginated({
    token,
    repository: binding.repository.fullName,
    path: `/pulls/${binding.pullRequest.number}/files`,
    api,
    fetchImpl,
  });
  const sameRepositoryHead = sameRepository(
    current.headRepository,
    binding.repository
  );
  const defaultBranchBase =
    sameRepository(current.baseRepository, binding.repository) &&
    current.baseRef === binding.defaultBranch;
  const registryFile = exactRegistryFile(files);
  const eligible = sameRepositoryHead && defaultBranchBase && !!registryFile;
  return {
    status: eligible ? "eligible" : "trusted_validate_not_eligible",
    eligible,
    binding,
    registryBlobSha: registryFile?.sha,
    files: files.map(({ filename, previous_filename, sha, status }) => ({
      filename,
      ...(previous_filename == null ? {} : { previous_filename }),
      ...(typeof sha === "string" ? { sha } : {}),
      status,
    })),
  };
}

function exactTreeEntry(payload, { expectedSha, path, mode, type }) {
  if (
    payload?.sha !== expectedSha ||
    payload?.truncated !== false ||
    !Array.isArray(payload?.tree)
  ) {
    fail("registry_validate_manifest_object_invalid");
  }
  const matches = payload.tree.filter((entry) => entry?.path === path);
  if (
    matches.length !== 1 ||
    matches[0]?.mode !== mode ||
    matches[0]?.type !== type ||
    !SHA_PATTERN.test(matches[0]?.sha ?? "")
  ) {
    fail("registry_validate_manifest_object_invalid");
  }
  return matches[0];
}

function decodeManifestBlob(payload, expectedBlobSha) {
  if (
    payload?.sha !== expectedBlobSha ||
    payload?.encoding !== "base64" ||
    typeof payload?.content !== "string" ||
    !Number.isSafeInteger(payload?.size) ||
    payload.size < 1 ||
    payload.size > MAX_MANIFEST_BYTES
  ) {
    fail("registry_validate_manifest_payload_invalid");
  }
  const encoded = payload.content.replace(/[\r\n]/g, "");
  if (
    encoded.length === 0 ||
    encoded.length % 4 !== 0 ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
      encoded
    )
  ) {
    fail("registry_validate_manifest_base64_invalid");
  }
  const bytes = Buffer.from(encoded, "base64");
  if (bytes.toString("base64") !== encoded) {
    fail("registry_validate_manifest_base64_invalid");
  }
  if (bytes.length !== payload.size || bytes.length > MAX_MANIFEST_BYTES) {
    fail("registry_validate_manifest_size_mismatch");
  }
  const actualBlobSha = createHash("sha1")
    .update(`blob ${bytes.length}\0`)
    .update(bytes)
    .digest("hex");
  if (actualBlobSha !== expectedBlobSha) {
    fail("registry_validate_manifest_sha_mismatch");
  }
  let content;
  try {
    content = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    fail("registry_validate_manifest_utf8_invalid");
  }
  return content;
}

export async function fetchProposedRegistryManifest({
  classification,
  env,
  api,
  fetchImpl,
}) {
  const repository = classification.binding.repository.fullName;
  const headSha = classification.binding.pullRequest.headSha;
  const commit = await api({
    token: env.GITHUB_TOKEN,
    repository,
    path: `/git/commits/${encodeURIComponent(headSha)}`,
    fetchImpl,
  });
  if (commit?.sha !== headSha || !SHA_PATTERN.test(commit?.tree?.sha ?? "")) {
    fail("registry_validate_manifest_object_invalid");
  }
  const rootTreeSha = commit.tree.sha;
  const rootTree = await api({
    token: env.GITHUB_TOKEN,
    repository,
    path: `/git/trees/${encodeURIComponent(rootTreeSha)}`,
    fetchImpl,
  });
  const githubDirectory = exactTreeEntry(rootTree, {
    expectedSha: rootTreeSha,
    path: ".github",
    mode: "040000",
    type: "tree",
  });
  const githubTree = await api({
    token: env.GITHUB_TOKEN,
    repository,
    path: `/git/trees/${encodeURIComponent(githubDirectory.sha)}`,
    fetchImpl,
  });
  const registryBlob = exactTreeEntry(githubTree, {
    expectedSha: githubDirectory.sha,
    path: "stacked-prs.json",
    mode: "100644",
    type: "blob",
  });
  if (registryBlob.sha !== classification.registryBlobSha) {
    fail("registry_validate_manifest_sha_mismatch");
  }
  const blob = await api({
    token: env.GITHUB_TOKEN,
    repository,
    path: `/git/blobs/${encodeURIComponent(registryBlob.sha)}`,
    fetchImpl,
  });
  return decodeManifestBlob(blob, registryBlob.sha);
}

async function listOpenPullRequests({ binding, env, api, fetchImpl }) {
  return listPaginated({
    token: env.GITHUB_TOKEN,
    repository: binding.repository.fullName,
    path: "/pulls?state=open",
    api,
    fetchImpl,
  });
}

function assertOpenPullInventory({ manifest, pulls, binding }) {
  for (const pull of pulls) {
    const headRepository = pull?.head?.repo?.full_name;
    const baseRef = pull?.base?.ref;
    if (baseRef === binding.defaultBranch) continue;
    const declaration = validatePullRequestDeclaration({
      manifest,
      prNumber: pull?.number,
      headRef: pull?.head?.ref,
      headRepository,
      baseRef,
      defaultBranch: binding.defaultBranch,
    });
    if (declaration.errors.length > 0 || !declaration.entry) {
      fail("registry_validate_open_stack_inventory_invalid");
    }
  }
}

export async function verifyProposedRegistryManifest({
  manifestContent,
  classification,
  env = process.env,
  repo = process.cwd(),
  remote = "origin",
  api = githubApi,
  fetchImpl,
  resolveStack = resolveRegisteredStack,
} = {}) {
  const manifest = parseStackManifest(manifestContent);
  const binding = classification.binding;
  if (manifest.repository !== binding.repository.fullName) {
    fail("registry_validate_manifest_repository_mismatch");
  }
  const pulls = await listOpenPullRequests({ binding, env, api, fetchImpl });
  assertOpenPullInventory({ manifest, pulls, binding });

  const stacks = [];
  for (const entry of manifest.stacks) {
    const result = await resolveStack({
      prNumber: entry.pr,
      env,
      repo,
      remote,
      manifest,
      api,
      fetchImpl,
    });
    if (result.status !== "pass") {
      fail("registry_validate_declared_stack_invalid");
    }
    stacks.push({
      pr: entry.pr,
      parentPr: entry.parentPr,
      head: result.head,
      parentHead: result.actualParentHead,
      mergeBase: result.mergeBase,
    });
  }
  return {
    repository: manifest.repository,
    headSha: binding.pullRequest.headSha,
    baseSha: binding.pullRequest.baseSha,
    stacks,
  };
}

function stableProof(value) {
  return JSON.stringify(value);
}

export function registryProofGeneration(proof) {
  return createHash("sha256").update(stableProof(proof)).digest("hex");
}

export function registryValidateExternalId(binding, generation) {
  const identity =
    `registry-only:${binding.repository.id}:${binding.pullRequest.number}:` +
    `${binding.pullRequest.headSha}:${binding.pullRequest.baseSha}`;
  return generation ? `${identity}:${generation}` : identity;
}

async function createPendingValidate({ classification, env, api, fetchImpl }) {
  const binding = classification.binding;
  const check = await api({
    token: env.GITHUB_TOKEN,
    repository: binding.repository.fullName,
    path: "/check-runs",
    method: "POST",
    body: {
      name: REQUIRED_VALIDATE_CHECK_NAME,
      head_sha: binding.pullRequest.headSha,
      status: "in_progress",
      started_at: new Date().toISOString(),
      external_id: registryValidateExternalId(binding),
      output: {
        title: "Trusted registry-only validation is running",
        summary:
          `Default-branch publisher code accepted exact one-file ${REGISTRY_PATH} scope and is ` +
          "verifying the proposed manifest and live stack generation. No pull-request code is executed.",
      },
    },
    fetchImpl,
  });
  if (!Number.isSafeInteger(check?.id) || check.id < 1) {
    fail("registry_validate_check_run_id_missing");
  }
  return check;
}

function publicationErrorCode(error) {
  const code =
    error instanceof Error ? error.message : "registry_validate_failed";
  return code.replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 500);
}

function publicFailureCode(error) {
  const code = error instanceof Error ? error.message : "";
  if (code.startsWith("stack_manifest_") || code.includes("manifest_")) {
    return "registry_validate_manifest_invalid";
  }
  if (code === "registry_validate_open_stack_inventory_invalid") {
    return "registry_validate_stack_inventory_invalid";
  }
  if (
    code === "registry_validate_declared_stack_invalid" ||
    code === "registry_validate_topology_changed"
  ) {
    return "registry_validate_topology_invalid";
  }
  if (
    code === "registry_validate_scope_changed" ||
    code === "registry_validate_head_changed" ||
    code === "registry_validate_base_changed" ||
    code === "registry_validate_repository_snapshot_changed"
  ) {
    return "registry_validate_snapshot_changed";
  }
  return "registry_validate_verification_failed";
}

async function completeValidate({
  classification,
  checkId,
  conclusion,
  env,
  api,
  fetchImpl,
  error,
  proof,
}) {
  const binding = classification.binding;
  const code = publicFailureCode(error);
  await api({
    token: env.GITHUB_TOKEN,
    repository: binding.repository.fullName,
    path: `/check-runs/${checkId}`,
    method: "PATCH",
    body: {
      status: "completed",
      conclusion,
      completed_at: new Date().toISOString(),
      ...(conclusion === "success"
        ? {
            external_id: registryValidateExternalId(
              binding,
              registryProofGeneration(proof)
            ),
          }
        : {}),
      output: {
        title:
          conclusion === "success"
            ? "Trusted registry-only validation passed"
            : "Trusted registry-only validation failed",
        summary:
          conclusion === "success"
            ? `Default-branch publisher code verified exact one-file ${REGISTRY_PATH} scope, ` +
              `the proposed manifest, ${proof.stacks.length} declared stack(s), and fresh ` +
              "repository/head/base snapshots. No pull-request code was executed."
            : `The trusted publisher refused registry-only success: ${code}`,
      },
    },
    fetchImpl,
  });
}

export async function publishRegistryOnlyValidate({
  eventContent,
  env = process.env,
  repo = process.cwd(),
  remote = "origin",
  api = githubApi,
  fetchImpl,
  resolveStack = resolveRegisteredStack,
  beforeFreshnessBarrier,
  initialClassification,
} = {}) {
  if (!TRUSTED_PUBLISHER_EVENTS.has(env.GITHUB_EVENT_NAME)) {
    fail("registry_validate_publisher_event_invalid");
  }
  const first =
    initialClassification ??
    (await classifyRegistryOnlyPullRequest({
      eventContent,
      env,
      api,
      fetchImpl,
    }));
  if (!first.eligible) return first;
  const check = await createPendingValidate({
    classification: first,
    env,
    api,
    fetchImpl,
  });
  try {
    const firstManifest = await fetchProposedRegistryManifest({
      classification: first,
      env,
      api,
      fetchImpl,
    });
    const firstProof = await verifyProposedRegistryManifest({
      manifestContent: firstManifest,
      classification: first,
      env,
      repo,
      remote,
      api,
      fetchImpl,
      resolveStack,
    });

    await beforeFreshnessBarrier?.();

    const fresh = await classifyRegistryOnlyPullRequest({
      eventContent,
      env,
      api,
      fetchImpl,
    });
    if (!fresh.eligible) fail("registry_validate_scope_changed");
    const freshManifest = await fetchProposedRegistryManifest({
      classification: fresh,
      env,
      api,
      fetchImpl,
    });
    if (freshManifest !== firstManifest) {
      fail("registry_validate_manifest_changed");
    }
    const freshProof = await verifyProposedRegistryManifest({
      manifestContent: freshManifest,
      classification: fresh,
      env,
      repo,
      remote,
      api,
      fetchImpl,
      resolveStack,
    });
    if (stableProof(freshProof) !== stableProof(firstProof)) {
      fail("registry_validate_topology_changed");
    }
    await completeValidate({
      classification: fresh,
      checkId: check.id,
      conclusion: "success",
      env,
      api,
      fetchImpl,
      proof: freshProof,
    });
    return { status: "published", eligible: true, proof: freshProof, check };
  } catch (error) {
    await completeValidate({
      classification: first,
      checkId: check.id,
      conclusion: "failure",
      env,
      api,
      fetchImpl,
      error,
    });
    return {
      status: "failure_published",
      eligible: true,
      error: publicationErrorCode(error),
      check,
    };
  }
}

function eventForServerPullRequest({ repository, defaultBranch, pullRequest }) {
  return JSON.stringify({
    action: "trusted_sweep",
    repository: {
      id: repository.id,
      full_name: repository.fullName,
      default_branch: defaultBranch,
    },
    pull_request: pullRequest,
  });
}

export async function sweepRegistryOnlyValidate({
  env = process.env,
  repo = process.cwd(),
  remote = "origin",
  api = githubApi,
  fetchImpl,
  resolveStack = resolveRegisteredStack,
  beforeCandidateFreshnessBarrier,
} = {}) {
  if (!TRUSTED_PUBLISHER_EVENTS.has(env.GITHUB_EVENT_NAME)) {
    fail("registry_validate_sweep_event_invalid");
  }
  const repository = {
    fullName: env.GITHUB_REPOSITORY,
    id: parsePositiveInteger(
      env.GITHUB_REPOSITORY_ID,
      "registry_validate_environment_repository_id_invalid"
    ),
  };
  if (
    typeof repository.fullName !== "string" ||
    repository.fullName.length === 0
  ) {
    fail("registry_validate_environment_repository_name_invalid");
  }
  const defaultBranch = env.GITHUB_DEFAULT_BRANCH;
  if (typeof defaultBranch !== "string" || defaultBranch.length === 0) {
    fail("registry_validate_environment_default_branch_invalid");
  }
  const binding = { repository, defaultBranch };
  const pulls = await listOpenPullRequests({ binding, env, api, fetchImpl });
  const results = [];
  let infrastructureFailure = false;

  for (const pullRequest of pulls) {
    if (!couldBeRegistryCandidate(pullRequest, repository, defaultBranch)) {
      continue;
    }
    const eventContent = eventForServerPullRequest({
      repository,
      defaultBranch,
      pullRequest,
    });
    let classification;
    try {
      classification = await classifyRegistryOnlyPullRequest({
        eventContent,
        env,
        api,
        fetchImpl,
      });
    } catch (error) {
      infrastructureFailure = true;
      results.push({
        pr: pullRequest?.number,
        status: "classification_error",
        error: publicationErrorCode(error),
      });
      continue;
    }
    if (!classification.eligible) continue;

    try {
      await beforeCandidateFreshnessBarrier?.({ classification });
      const result = await publishRegistryOnlyValidate({
        eventContent,
        env,
        repo,
        remote,
        api,
        fetchImpl,
        resolveStack,
        initialClassification: classification,
      });
      results.push({
        pr: classification.binding.pullRequest.number,
        headSha: classification.binding.pullRequest.headSha,
        status: result.status,
      });
    } catch (error) {
      infrastructureFailure = true;
      results.push({
        pr: classification.binding.pullRequest.number,
        headSha: classification.binding.pullRequest.headSha,
        status: "publication_error",
        error: publicationErrorCode(error),
      });
    }
  }

  return {
    status: infrastructureFailure ? "error" : "complete",
    results,
  };
}

function eventContentFromEnvironment(env) {
  if (!env.GITHUB_EVENT_PATH) fail("registry_validate_event_path_required");
  return readFileSync(env.GITHUB_EVENT_PATH, "utf8");
}

async function main() {
  const sweep = process.argv.includes("--sweep");
  if (!sweep) fail("registry_validate_sweep_mode_required");
  if (process.env.GITHUB_EVENT_NAME === "pull_request_target") {
    eventContentFromEnvironment(process.env);
  }
  const result = await sweepRegistryOnlyValidate();
  console.log(JSON.stringify(result, null, 2));
  if (result.status === "error") process.exitCode = 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(
      JSON.stringify({
        status: "error",
        error:
          error instanceof Error
            ? error.message
            : "registry_validate_unknown_failure",
      })
    );
    process.exitCode = 1;
  });
}
