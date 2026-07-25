#!/usr/bin/env tsx

import { createHash, createPrivateKey, sign as signMessage } from "node:crypto";
import { constants } from "node:fs";
import {
  chmod,
  mkdir,
  open,
  readFile,
  realpath,
  writeFile,
} from "node:fs/promises";
import { dirname, isAbsolute, relative } from "node:path";
import { fileURLToPath } from "node:url";

import {
  CALIBRATION_MAX_SPEND_NANO_USD,
  CALIBRATION_PRICING_CONTRACT,
} from "@/lib/evaluation/calibration-budget";
import {
  CALIBRATION_OWNER_APPROVAL_DECISION,
  CALIBRATION_OWNER_AUTHORIZATION_CONTRACT,
  CALIBRATION_OWNER_AUTHORIZATION_MAX_BYTES,
  CALIBRATION_OWNER_AUTHORIZATION_MAX_TTL_MS,
  CALIBRATION_OWNER_ID,
  CALIBRATION_OWNER_ROLE,
  SAV_248_V12_APPROVED_RUN_ID,
  SAV_248_V12_PREDECESSOR_AUTHORITIES,
  assertCalibrationOwnerAuthorizationMatchesPlan,
  calibrationOwnerAuthorizationSignatureMessage,
  loadCalibrationOwnerAuthorization,
  type ApprovedCalibrationSpendAuthorization,
  type CalibrationOwnerAuthorizationArtifact,
  type CalibrationOwnerAuthorizationPayload,
} from "@/lib/evaluation/calibration-owner-authorization";
import {
  buildCalibrationActivatedPlan,
  buildCalibrationAuthorizationGenesis,
} from "@/lib/evaluation/calibration-run-ledger";

const REQUEST_CONTRACT =
  "meelni.evaluation-calibration-owner-authorization-request.v1";
const REPORT_CONTRACT =
  "meelni.evaluation-calibration-owner-authorization-verification-report.v1";
const COMMIT_SHA = /^[0-9a-f]{40}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const AUTHORIZATION_ID = /^sav248_v12_auth_[0-9a-f]{32}$/;
const KEY_ID = /^[A-Za-z0-9._-]{1,80}$/;
const OWNER_ONLY_MODE = 0o600;

interface UnsignedCalibrationOwnerAuthorizationRequest {
  contract: typeof REQUEST_CONTRACT;
  payload: CalibrationOwnerAuthorizationPayload;
  signatureMessageSha256: string;
  signatureMessageBase64: string;
  derived: {
    approvedSpendAuthorization: ApprovedCalibrationSpendAuthorization;
    plan: {
      planHash: string;
      plannedCalls: number;
      plannedWorstCaseNanoUsd: number;
      pricingHash: string;
      model: string;
      reviewedSourceCommit: string | null;
    };
    genesis: {
      oid: string;
      date: string;
      messageSha256: string;
    };
  };
}

export async function runCalibrationOwnerAuthorizationCli({
  argv = process.argv.slice(2),
  stdout = process.stdout,
  stderr = process.stderr,
  repoRoot = process.cwd(),
}: {
  argv?: string[];
  stdout?: Pick<NodeJS.WriteStream, "write">;
  stderr?: Pick<NodeJS.WriteStream, "write">;
  repoRoot?: string;
} = {}): Promise<number> {
  const [command, ...rawOptions] = argv;
  if (!command || command === "help" || command === "--help") {
    stdout.write(usage());
    return 0;
  }
  const options = parseOptions(rawOptions);
  const repositoryRoot = await realpath(repoRoot);

  if (command === "prepare") {
    assertNoUnknownOptions(options, [
      "adjudication-approval",
      "authorization-id",
      "expires-at",
      "issued-at",
      "output-path",
      "reviewed-source-commit",
      "signing-key-id",
      "ttl-minutes",
    ]);
    const request = await prepareUnsignedOwnerAuthorization({
      adjudicationApprovalPath: required(options, "adjudication-approval"),
      authorizationId: required(options, "authorization-id"),
      issuedAt: required(options, "issued-at"),
      expiresAt: options["expires-at"],
      ttlMinutes: options["ttl-minutes"],
      outputPath: required(options, "output-path"),
      reviewedSourceCommit: required(options, "reviewed-source-commit"),
      signingKeyId: required(options, "signing-key-id"),
      repositoryRoot,
    });
    stdout.write(
      `${JSON.stringify({
        result: "unsigned_owner_authorization_request_written",
        authorizationId: request.payload.authorizationId,
        reviewedSourceCommit: request.payload.reviewedSourceCommit,
        planHash: request.payload.planHash,
        plannedProviderCalls: request.payload.plannedProviderCalls,
        plannedWorstCaseNanoUsd: request.payload.plannedWorstCaseNanoUsd,
        signatureMessageSha256: request.signatureMessageSha256,
      })}\n`
    );
    return 0;
  }

  if (command === "sign") {
    assertNoUnknownOptions(options, [
      "artifact-path",
      "key-id",
      "payload-path",
      "private-key-path",
    ]);
    await signOwnerAuthorizationPayload({
      artifactPath: required(options, "artifact-path"),
      keyId: required(options, "key-id"),
      payloadPath: required(options, "payload-path"),
      privateKeyPath: required(options, "private-key-path"),
      repositoryRoot,
    });
    stdout.write('{"result":"signed_owner_authorization_artifact_written"}\n');
    return 0;
  }

  if (command === "verify") {
    assertNoUnknownOptions(options, [
      "adjudication-approval",
      "artifact-path",
      "key-registry-path",
      "now",
      "output-path",
      "reviewed-source-commit",
    ]);
    const report = await verifyOwnerAuthorizationArtifact({
      adjudicationApprovalPath: required(options, "adjudication-approval"),
      artifactPath: required(options, "artifact-path"),
      keyRegistryPath: options["key-registry-path"],
      now: options.now,
      outputPath: options["output-path"],
      reviewedSourceCommit: required(options, "reviewed-source-commit"),
      repositoryRoot,
    });
    stdout.write(
      `${JSON.stringify({
        result: "owner_authorization_valid",
        authorizationId: report.authorizationId,
        reviewedSourceCommit: report.reviewedSourceCommit,
        planHash: report.planHash,
        plannedProviderCalls: report.plannedProviderCalls,
        plannedWorstCaseNanoUsd: report.plannedWorstCaseNanoUsd,
        outputPath: report.outputPath ?? null,
      })}\n`
    );
    return 0;
  }

  stderr.write("calibration_owner_authorization_command_invalid\n");
  return 1;
}

export async function prepareUnsignedOwnerAuthorization(input: {
  adjudicationApprovalPath: string;
  authorizationId: string;
  issuedAt: string;
  expiresAt?: string;
  ttlMinutes?: string;
  outputPath: string;
  reviewedSourceCommit: string;
  signingKeyId: string;
  repositoryRoot: string;
}): Promise<UnsignedCalibrationOwnerAuthorizationRequest> {
  const reviewedSourceCommit = parseCommit(input.reviewedSourceCommit);
  const authorizationId = parseAuthorizationId(input.authorizationId);
  const signingKeyId = parseKeyId(input.signingKeyId);
  const issuedAt = parseWholeSecondIso(
    input.issuedAt,
    "calibration_owner_authorization_issued_at_invalid"
  );
  const expiresAt = resolveExpiresAt(
    issuedAt,
    input.expiresAt,
    input.ttlMinutes
  );
  const adjudicationApproval = await readJsonFile(
    input.adjudicationApprovalPath
  );
  const approvedSpendAuthorization = buildApprovedSpendAuthorization({
    authorizationId,
    issuedAt: issuedAt.toISOString(),
    reviewedSourceCommit,
    signingKeyId,
  });
  const plan = buildCalibrationActivatedPlan({
    authorization: approvedSpendAuthorization,
    adjudicationApproval,
    model: CALIBRATION_PRICING_CONTRACT.model,
    repetitions: 2,
    now: issuedAt,
  });
  const payload: CalibrationOwnerAuthorizationPayload = {
    authorizationId,
    runId: SAV_248_V12_APPROVED_RUN_ID,
    ownerId: CALIBRATION_OWNER_ID,
    ownerRole: CALIBRATION_OWNER_ROLE,
    approvalDecision: CALIBRATION_OWNER_APPROVAL_DECISION,
    ownerLaunchDecision: null,
    signingKeyId,
    reviewedSourceCommit,
    planHash: plan.planHash,
    plannedProviderCalls: plan.plannedCalls,
    plannedPhysicalHttpAttempts: plan.plannedCalls,
    plannedWorstCaseNanoUsd: plan.plannedWorstCaseNanoUsd,
    maximumProviderCalls: 96,
    maximumPhysicalHttpAttempts: 96,
    maximumSpendNanoUsd: CALIBRATION_MAX_SPEND_NANO_USD,
    singleAggregateRun: true,
    fixturePolicy: "synthetic_or_separately_approved_only",
    customerTranscriptsAllowed: false,
    productionDataAllowed: false,
    historicalAuthoritiesReusable: false,
    predecessorAuthorities: SAV_248_V12_PREDECESSOR_AUTHORITIES,
    issuedAt: issuedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
  };
  const signatureMessage =
    calibrationOwnerAuthorizationSignatureMessage(payload);
  const genesis = buildCalibrationAuthorizationGenesis(
    plan,
    approvedSpendAuthorization
  );
  const request: UnsignedCalibrationOwnerAuthorizationRequest = {
    contract: REQUEST_CONTRACT,
    payload,
    signatureMessageSha256: sha256(signatureMessage),
    signatureMessageBase64: signatureMessage.toString("base64"),
    derived: {
      approvedSpendAuthorization,
      plan: {
        planHash: plan.planHash,
        plannedCalls: plan.plannedCalls,
        plannedWorstCaseNanoUsd: plan.plannedWorstCaseNanoUsd,
        pricingHash: plan.pricingHash,
        model: plan.model,
        reviewedSourceCommit: plan.reviewedSourceCommit,
      },
      genesis: {
        oid: genesis.oid,
        date: genesis.date,
        messageSha256: sha256(Buffer.from(genesis.message)),
      },
    },
  };
  await writeOwnerOnlyJson(input.outputPath, request);
  return request;
}

export async function signOwnerAuthorizationPayload(input: {
  artifactPath: string;
  keyId: string;
  payloadPath: string;
  privateKeyPath: string;
  repositoryRoot: string;
}): Promise<void> {
  const keyId = parseKeyId(input.keyId);
  const payloadDocument = await readJsonFile(input.payloadPath);
  const payload = parsePayloadDocument(payloadDocument);
  if (payload.signingKeyId !== keyId) {
    throw new Error("calibration_owner_authorization_key_id_mismatch");
  }
  const privateKeyBytes = await readPrivateExternalFile(
    input.privateKeyPath,
    input.repositoryRoot
  );
  let privateKey;
  try {
    privateKey = createPrivateKey(privateKeyBytes);
  } catch {
    throw new Error("calibration_owner_authorization_private_key_invalid");
  }
  if (privateKey.asymmetricKeyType !== "ed25519") {
    throw new Error("calibration_owner_authorization_private_key_invalid");
  }
  const signature = signMessage(
    null,
    calibrationOwnerAuthorizationSignatureMessage(payload),
    privateKey
  ).toString("base64");
  const artifact: CalibrationOwnerAuthorizationArtifact = {
    contract: CALIBRATION_OWNER_AUTHORIZATION_CONTRACT,
    payload,
    signature: {
      algorithm: "ed25519",
      keyId,
      value: signature,
    },
  };
  await writeOwnerOnlyJson(input.artifactPath, artifact);
}

export async function verifyOwnerAuthorizationArtifact(input: {
  adjudicationApprovalPath: string;
  artifactPath: string;
  keyRegistryPath?: string;
  now?: string;
  outputPath?: string;
  reviewedSourceCommit: string;
  repositoryRoot: string;
}): Promise<{
  authorizationId: string;
  reviewedSourceCommit: string;
  planHash: string;
  plannedProviderCalls: number;
  plannedWorstCaseNanoUsd: number;
  outputPath?: string;
}> {
  const reviewedSourceCommit = parseCommit(input.reviewedSourceCommit);
  const now = input.now
    ? parseIso(input.now, "calibration_owner_authorization_now_invalid")
    : new Date();
  const [adjudicationApproval, keyRegistry] = await Promise.all([
    readJsonFile(input.adjudicationApprovalPath),
    input.keyRegistryPath ? readJsonFile(input.keyRegistryPath) : undefined,
  ]);
  const verified = await loadCalibrationOwnerAuthorization({
    authorizationPath: input.artifactPath,
    repositoryRoot: input.repositoryRoot,
    now,
    keyRegistry,
  });
  if (verified.authorization.reviewedSourceCommit !== reviewedSourceCommit) {
    throw new Error("calibration_owner_authorization_source_commit_mismatch");
  }
  const plan = buildCalibrationActivatedPlan({
    authorization: verified.authorization,
    adjudicationApproval,
    model: CALIBRATION_PRICING_CONTRACT.model,
    repetitions: 2,
    now,
  });
  assertCalibrationOwnerAuthorizationMatchesPlan(verified, plan, now);
  const genesis = buildCalibrationAuthorizationGenesis(
    plan,
    verified.authorization
  );
  const report = {
    contract: REPORT_CONTRACT,
    verifiedAt: now.toISOString(),
    authorizationId: verified.authorization.authorizationId,
    runId: verified.authorization.runId,
    ownerId: verified.authorization.ownerId,
    ownerRole: verified.authorization.ownerRole,
    signingKeyId: verified.authorization.ownerSigningKeyId,
    reviewedSourceCommit: verified.authorization.reviewedSourceCommit,
    issuedAt: verified.authorization.authorizedOn,
    expiresAt: verified.approvalExpiresAt,
    planHash: plan.planHash,
    plannedProviderCalls: plan.plannedCalls,
    plannedPhysicalHttpAttempts: plan.plannedCalls,
    plannedWorstCaseNanoUsd: plan.plannedWorstCaseNanoUsd,
    pricingHash: plan.pricingHash,
    model: plan.model,
    fixturePolicy: verified.authorization.fixturePolicy,
    customerTranscriptsAllowed:
      verified.authorization.customerTranscriptsAllowed,
    productionDataAllowed: verified.authorization.productionDataAllowed,
    maximumProviderCalls: verified.authorization.maximumProviderCalls,
    maximumPhysicalHttpAttempts:
      verified.authorization.maximumPhysicalHttpAttempts,
    maximumSpendNanoUsd: CALIBRATION_MAX_SPEND_NANO_USD,
    genesis: {
      oid: genesis.oid,
      date: genesis.date,
      messageSha256: sha256(Buffer.from(genesis.message)),
    },
    providerCallsExecuted: false,
    ledgerActivated: false,
    launchAuthorized: false,
  } as const;
  if (input.outputPath) {
    await writeOwnerOnlyJson(input.outputPath, report);
  }
  return {
    authorizationId: report.authorizationId,
    reviewedSourceCommit: report.reviewedSourceCommit,
    planHash: report.planHash,
    plannedProviderCalls: report.plannedProviderCalls,
    plannedWorstCaseNanoUsd: report.plannedWorstCaseNanoUsd,
    outputPath: input.outputPath,
  };
}

function buildApprovedSpendAuthorization(input: {
  authorizationId: string;
  issuedAt: string;
  reviewedSourceCommit: string;
  signingKeyId: string;
}): ApprovedCalibrationSpendAuthorization {
  return {
    contractVersion: "evaluation-calibration-spend-authorization.v12",
    authorizationId: input.authorizationId,
    runId: SAV_248_V12_APPROVED_RUN_ID,
    authorizationStatus: "approved_by_human_product_owner",
    authorizedOn: input.issuedAt,
    authorizationSource: "external_product_owner_ed25519",
    ownerId: CALIBRATION_OWNER_ID,
    ownerRole: CALIBRATION_OWNER_ROLE,
    ownerSigningKeyId: input.signingKeyId,
    reviewedSourceCommit: input.reviewedSourceCommit,
    singleAggregateRun: true,
    maximumProviderCalls: 96,
    maximumPhysicalHttpAttempts: 96,
    maximumSpendUsd: 3,
    fixturePolicy: "synthetic_or_separately_approved_only",
    customerTranscriptsAllowed: false,
    productionDataAllowed: false,
    historicalAuthoritiesReusable: false,
    predecessorAuthorities: SAV_248_V12_PREDECESSOR_AUTHORITIES,
  };
}

function parsePayloadDocument(
  value: unknown
): CalibrationOwnerAuthorizationPayload {
  if (isRecord(value) && value.contract === REQUEST_CONTRACT) {
    return parsePayload(value.payload);
  }
  if (
    isRecord(value) &&
    value.contract === CALIBRATION_OWNER_AUTHORIZATION_CONTRACT
  ) {
    return parsePayload(value.payload);
  }
  return parsePayload(value);
}

function parsePayload(value: unknown): CalibrationOwnerAuthorizationPayload {
  if (!isRecord(value)) {
    throw new Error("calibration_owner_authorization_payload_invalid");
  }
  const payload = value as Partial<CalibrationOwnerAuthorizationPayload>;
  parseAuthorizationId(payload.authorizationId);
  parseCommit(payload.reviewedSourceCommit);
  parseKeyId(payload.signingKeyId);
  if (payload.planHash === undefined || !SHA256.test(payload.planHash)) {
    throw new Error("calibration_owner_authorization_plan_hash_invalid");
  }
  return value as unknown as CalibrationOwnerAuthorizationPayload;
}

function resolveExpiresAt(
  issuedAt: Date,
  expiresAtInput?: string,
  ttlMinutesInput?: string
): Date {
  if (expiresAtInput && ttlMinutesInput) {
    throw new Error("calibration_owner_authorization_expiry_ambiguous");
  }
  if (expiresAtInput) {
    const expiresAt = parseIso(
      expiresAtInput,
      "calibration_owner_authorization_expires_at_invalid"
    );
    assertTtl(issuedAt, expiresAt);
    return expiresAt;
  }
  const ttlMinutes = ttlMinutesInput ? Number(ttlMinutesInput) : 30;
  if (!Number.isSafeInteger(ttlMinutes) || ttlMinutes < 1 || ttlMinutes > 30) {
    throw new Error("calibration_owner_authorization_ttl_invalid");
  }
  const expiresAt = new Date(issuedAt.getTime() + ttlMinutes * 60 * 1_000);
  assertTtl(issuedAt, expiresAt);
  return expiresAt;
}

function assertTtl(issuedAt: Date, expiresAt: Date): void {
  if (
    expiresAt.getTime() <= issuedAt.getTime() ||
    expiresAt.getTime() - issuedAt.getTime() >
      CALIBRATION_OWNER_AUTHORIZATION_MAX_TTL_MS
  ) {
    throw new Error("calibration_owner_authorization_ttl_invalid");
  }
}

async function readJsonFile(path: string): Promise<unknown> {
  let contents: string;
  try {
    contents = await readFile(path, "utf8");
  } catch {
    throw new Error("calibration_owner_authorization_file_unreadable");
  }
  try {
    return JSON.parse(contents);
  } catch {
    throw new Error("calibration_owner_authorization_json_invalid");
  }
}

async function writeOwnerOnlyJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, {
    mode: OWNER_ONLY_MODE,
  });
  await chmod(path, OWNER_ONLY_MODE);
}

async function readPrivateExternalFile(
  inputPath: string,
  repositoryRoot: string
): Promise<Buffer> {
  if (!isAbsolute(inputPath)) {
    throw new Error("calibration_owner_authorization_file_must_be_absolute");
  }
  const [filePath, rootPath] = await Promise.all([
    realpath(inputPath),
    realpath(repositoryRoot),
  ]);
  const relation = relative(rootPath, filePath);
  if (!relation.startsWith("..") && relation !== "") {
    throw new Error("calibration_owner_authorization_file_must_be_external");
  }
  const handle = await open(
    filePath,
    constants.O_RDONLY | constants.O_NOFOLLOW
  );
  try {
    const stats = await handle.stat();
    if (!stats.isFile()) {
      throw new Error("calibration_owner_authorization_file_not_regular");
    }
    if (stats.nlink !== 1) {
      throw new Error(
        "calibration_owner_authorization_file_link_count_invalid"
      );
    }
    if ((stats.mode & 0o777) !== OWNER_ONLY_MODE) {
      throw new Error("calibration_owner_authorization_file_mode_invalid");
    }
    if (stats.size > CALIBRATION_OWNER_AUTHORIZATION_MAX_BYTES) {
      throw new Error("calibration_owner_authorization_file_too_large");
    }
    return await handle.readFile();
  } finally {
    await handle.close();
  }
}

function parseOptions(argv: string[]): Record<string, string> {
  const options: Record<string, string> = {};
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (
      !flag?.startsWith("--") ||
      flag.length < 3 ||
      value === undefined ||
      value.startsWith("--")
    ) {
      throw new Error("calibration_owner_authorization_options_invalid");
    }
    const name = flag.slice(2);
    if (Object.hasOwn(options, name)) {
      throw new Error("calibration_owner_authorization_options_invalid");
    }
    options[name] = value;
  }
  return options;
}

function required(options: Record<string, string>, name: string): string {
  const value = options[name];
  if (!value)
    throw new Error(`calibration_owner_authorization_${name}_required`);
  return value;
}

function assertNoUnknownOptions(
  options: Record<string, string>,
  allowed: string[]
): void {
  const allowlist = new Set(allowed);
  if (Object.keys(options).some((name) => !allowlist.has(name))) {
    throw new Error("calibration_owner_authorization_option_unknown");
  }
}

function parseCommit(value: unknown): string {
  if (typeof value !== "string" || !COMMIT_SHA.test(value)) {
    throw new Error("calibration_owner_authorization_source_commit_invalid");
  }
  return value;
}

function parseAuthorizationId(value: unknown): string {
  if (typeof value !== "string" || !AUTHORIZATION_ID.test(value)) {
    throw new Error("calibration_owner_authorization_id_invalid");
  }
  return value;
}

function parseKeyId(value: unknown): string {
  if (typeof value !== "string" || !KEY_ID.test(value)) {
    throw new Error("calibration_owner_authorization_key_id_invalid");
  }
  return value;
}

function parseWholeSecondIso(value: string, errorCode: string): Date {
  const parsed = parseIso(value, errorCode);
  if (parsed.getUTCMilliseconds() !== 0) {
    throw new Error(errorCode);
  }
  return parsed;
}

function parseIso(value: string, errorCode: string): Date {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) {
    throw new Error(errorCode);
  }
  return parsed;
}

function sha256(value: Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function usage(): string {
  return [
    "Evaluation calibration owner-authorization tooling (provider-free)",
    "",
    "Commands:",
    "  prepare --adjudication-approval PATH --authorization-id sav248_v12_auth_<32hex> --reviewed-source-commit 40hex --signing-key-id ID --issued-at ISO --output-path PATH [--expires-at ISO | --ttl-minutes N]",
    "  sign --payload-path PATH --artifact-path PATH --key-id ID --private-key-path ABSOLUTE_PATH",
    "  verify --artifact-path ABSOLUTE_PATH --adjudication-approval PATH --reviewed-source-commit 40hex [--key-registry-path PATH] [--output-path PATH]",
    "",
  ].join("\n");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runCalibrationOwnerAuthorizationCli()
    .then((status) => {
      process.exitCode = status;
    })
    .catch((error) => {
      process.stderr.write(`${safeErrorCode(error)}\n`);
      process.exitCode = 1;
    });
}

function safeErrorCode(error: unknown): string {
  if (error instanceof Error && /^[a-z0-9_]+$/.test(error.message)) {
    return error.message;
  }
  return "calibration_owner_authorization_failed";
}
