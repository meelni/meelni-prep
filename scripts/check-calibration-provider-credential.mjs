#!/usr/bin/env node
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const CONTRACT_VERSION = "evaluation-calibration-provider-preflight.v1";
const DEFAULT_KEYCHAIN_SERVICE = "meelni-calibration-openai";
const DEFAULT_BUDGET_SOURCE = "lib/evaluation/calibration-budget.ts";
const DEFAULT_TIMEOUT_MS = 10_000;

if (import.meta.url === `file://${process.argv[1]}`) {
  void main().catch((error) => {
    const message =
      error instanceof Error
        ? error.message
        : "calibration_provider_preflight_failed";
    console.error(
      JSON.stringify({
        contractVersion: CONTRACT_VERSION,
        readyForCalibrationProviderCall: false,
        diagnostic: message,
      })
    );
    process.exitCode = 1;
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const report = await buildCalibrationProviderPreflightReport({
    budgetSourcePath: args.budgetSource,
    keychainService: args.keychainService,
    timeoutMs: args.timeoutMs,
    env: process.env,
  });

  console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.readyForCalibrationProviderCall ? 0 : 1;
}

export async function buildCalibrationProviderPreflightReport({
  budgetSourcePath = DEFAULT_BUDGET_SOURCE,
  keychainService = DEFAULT_KEYCHAIN_SERVICE,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  env = process.env,
  now = new Date(),
  readKeychainPassword = readMacOsKeychainPassword,
  fetchModel = fetchOpenAIModel,
} = {}) {
  const pricing = await readCalibrationPricingContract(
    resolve(process.cwd(), budgetSourcePath)
  );
  const ambient = {
    openaiApiKeyPresent: hasValue(env.OPENAI_API_KEY),
    openaiBaseUrlPresent: hasValue(env.OPENAI_BASE_URL),
  };
  const pricingReviewExpiresAt = new Date(
    Date.parse(pricing.reviewedAt) + pricing.reviewTtlHours * 60 * 60 * 1_000
  ).toISOString();
  const pricingReviewFresh = Date.parse(pricingReviewExpiresAt) > now.getTime();

  const baseReport = {
    contractVersion: CONTRACT_VERSION,
    generatedAt: now.toISOString(),
    keychainService,
    ambient,
    pricing: {
      provider: pricing.provider,
      model: pricing.model,
      endpoint: pricing.endpoint,
      serviceTier: pricing.serviceTier,
      reviewedAt: pricing.reviewedAt,
      reviewTtlHours: pricing.reviewTtlHours,
      reviewExpiresAt: pricingReviewExpiresAt,
      fresh: pricingReviewFresh,
    },
  };

  if (ambient.openaiApiKeyPresent || ambient.openaiBaseUrlPresent) {
    return {
      ...baseReport,
      readyForCalibrationProviderCall: false,
      diagnostic: "ambient_openai_environment_rejected",
    };
  }
  if (!pricingReviewFresh) {
    return {
      ...baseReport,
      readyForCalibrationProviderCall: false,
      diagnostic: "calibration_pricing_review_stale",
    };
  }

  const keychain = await readKeychainPassword(keychainService);
  if (!keychain.ok) {
    return {
      ...baseReport,
      readyForCalibrationProviderCall: false,
      diagnostic: keychain.diagnostic,
    };
  }
  if (!/^sk-[A-Za-z0-9_-]{8,}$/.test(keychain.password)) {
    return {
      ...baseReport,
      readyForCalibrationProviderCall: false,
      diagnostic: "calibration_openai_key_shape_invalid",
    };
  }

  const provider = await fetchModel({
    endpoint: pricing.endpoint,
    model: pricing.model,
    apiKey: keychain.password,
    timeoutMs,
  });

  return {
    ...baseReport,
    provider: {
      modelLookup: provider,
    },
    readyForCalibrationProviderCall: provider.status === "ok",
    diagnostic:
      provider.status === "ok" ? "calibration_provider_ready" : provider.status,
  };
}

export async function readCalibrationPricingContract(path) {
  const source = await readFile(path, "utf8");
  return parseCalibrationPricingContract(source);
}

export function parseCalibrationPricingContract(source) {
  const fields = {
    provider: /provider:\s*"([^"]+)"/,
    model: /model:\s*"([^"]+)"/,
    endpoint: /endpoint:\s*CALIBRATION_OFFICIAL_OPENAI_ENDPOINT/,
    serviceTier: /serviceTier:\s*CALIBRATION_SERVICE_TIER/,
    reviewedAt: /reviewedAt:\s*"([^"]+)"/,
    reviewTtlHours: /reviewTtlHours:\s*([0-9]+)/,
  };
  const provider = matchString(source, fields.provider, "provider");
  const model = matchString(source, fields.model, "model");
  const reviewedAt = matchString(source, fields.reviewedAt, "reviewedAt");
  const reviewTtlHours = Number(
    matchString(source, fields.reviewTtlHours, "reviewTtlHours")
  );
  if (!fields.endpoint.test(source) || !fields.serviceTier.test(source)) {
    throw new Error("calibration_pricing_contract_shape_invalid");
  }
  if (!Number.isInteger(reviewTtlHours) || reviewTtlHours <= 0) {
    throw new Error("calibration_pricing_review_ttl_invalid");
  }
  return {
    provider,
    model,
    endpoint: "https://api.openai.com/v1",
    serviceTier: "default",
    reviewedAt,
    reviewTtlHours,
  };
}

export async function readMacOsKeychainPassword(service) {
  try {
    const { stdout } = await execFileAsync(
      "/usr/bin/security",
      ["find-generic-password", "-w", "-s", service],
      {
        encoding: "utf8",
        timeout: 10_000,
        windowsHide: true,
        env: { HOME: process.env.HOME, PATH: "/usr/bin:/bin" },
        maxBuffer: 16 * 1024,
      }
    );
    const password = stdout.trim();
    return password
      ? { ok: true, password }
      : { ok: false, diagnostic: "calibration_openai_key_missing" };
  } catch {
    return { ok: false, diagnostic: "calibration_openai_key_missing" };
  }
}

export async function fetchOpenAIModel({ endpoint, model, apiKey, timeoutMs }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(
      `${endpoint.replace(/\/+$/, "")}/models/${encodeURIComponent(model)}`,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        redirect: "manual",
        signal: controller.signal,
      }
    );
    if (response.status >= 300 && response.status < 400) {
      return {
        status: "provider_redirect_rejected",
        httpStatus: response.status,
      };
    }
    if (response.status === 401) {
      return { status: "provider_authentication", httpStatus: response.status };
    }
    if (response.status === 403) {
      return { status: "provider_authorization", httpStatus: response.status };
    }
    if (response.status === 404) {
      return {
        status: "provider_model_not_accessible",
        httpStatus: response.status,
      };
    }
    if (!response.ok) {
      return {
        status: "provider_model_lookup_failed",
        httpStatus: response.status,
      };
    }
    const body = await response.json().catch(() => null);
    if (!body || typeof body !== "object" || body.id !== model) {
      return { status: "provider_model_mismatch", httpStatus: response.status };
    }
    return { status: "ok", httpStatus: response.status, model };
  } catch (error) {
    return {
      status:
        error instanceof Error && error.name === "AbortError"
          ? "provider_model_lookup_timeout"
          : "provider_model_lookup_network_error",
      httpStatus: null,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function parseArgs(argv) {
  const args = {
    budgetSource: DEFAULT_BUDGET_SOURCE,
    keychainService: DEFAULT_KEYCHAIN_SERVICE,
    timeoutMs: DEFAULT_TIMEOUT_MS,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--budget-source") {
      args.budgetSource = requireValue(argv[++index], arg);
    } else if (arg === "--keychain-service") {
      args.keychainService = requireValue(argv[++index], arg);
    } else if (arg === "--timeout-ms") {
      const value = Number(requireValue(argv[++index], arg));
      if (!Number.isInteger(value) || value < 1_000 || value > 60_000) {
        throw new Error("calibration_provider_preflight_timeout_invalid");
      }
      args.timeoutMs = value;
    } else if (arg === "--help" || arg === "-h") {
      console.log(`Usage: npm run calibration:provider-preflight -- [options]

Checks the SAV-198/SAV-248 OpenAI calibration credential without running model
calibration, consuming an owner signature, or reading Production/customer data.

Options:
  --budget-source <path>       Calibration budget source file
  --keychain-service <name>    macOS Keychain service name
  --timeout-ms <ms>            Read-only model lookup timeout, 1000-60000
`);
      process.exit(0);
    } else {
      throw new Error("calibration_provider_preflight_option_unknown");
    }
  }
  return args;
}

function requireValue(value, option) {
  if (!value) throw new Error(`${option} requires a value`);
  return value;
}

function matchString(source, expression, field) {
  const match = source.match(expression);
  if (!match?.[1]) throw new Error(`calibration_pricing_${field}_missing`);
  return match[1];
}

function hasValue(value) {
  return typeof value === "string" && value.trim().length > 0;
}
