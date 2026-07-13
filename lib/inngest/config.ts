import type { Inngest } from "inngest";

export type InngestEnv = {
  NODE_ENV?: string;
  INNGEST_ENV?: string;
  INNGEST_EVENT_KEY?: string;
  INNGEST_SIGNING_KEY?: string;
  VERCEL?: string;
  VERCEL_ENV?: string;
  VERCEL_GIT_COMMIT_REF?: string;
};

type InngestClientOptions = ConstructorParameters<typeof Inngest>[0];

export type InngestConfigurationStatus =
  | {
      ok: true;
      mode: "local" | "cloud" | "preview" | "production";
      options: InngestClientOptions;
    }
  | {
      ok: false;
      code: "credentials_missing" | "identity_missing" | "identity_mismatch";
      reason: string;
    };

const PRODUCTION_GIT_BRANCH = "main";

export function getInngestClientOptions(
  env: InngestEnv = process.env
): InngestClientOptions {
  const status = getInngestConfigurationStatus(env);
  if (!status.ok) {
    throw new Error(`Invalid hosted Inngest configuration: ${status.reason}`);
  }
  return status.options;
}

export function getInngestConfigurationStatus(
  env: InngestEnv = process.env
): InngestConfigurationStatus {
  const options: InngestClientOptions = {
    id: "meelni",
  };

  if (env.NODE_ENV !== "production") {
    return {
      ok: true,
      mode: "local",
      options: {
        ...options,
        isDev: true,
      },
    };
  }

  const eventKey = env.INNGEST_EVENT_KEY?.trim();
  const hosted =
    env.VERCEL === "1" ||
    env.VERCEL_ENV === "preview" ||
    env.VERCEL_ENV === "production";
  if (!hosted) {
    return {
      ok: true,
      mode: "cloud",
      options: eventKey ? { ...options, eventKey } : options,
    };
  }

  const vercelEnvironment = env.VERCEL_ENV?.trim();
  if (vercelEnvironment !== "preview" && vercelEnvironment !== "production") {
    return {
      ok: false,
      code: "identity_missing",
      reason: "VERCEL_ENV must identify preview or production",
    };
  }

  const gitBranch = readExactValue(env.VERCEL_GIT_COMMIT_REF);
  if (!gitBranch) {
    return {
      ok: false,
      code: "identity_missing",
      reason: "VERCEL_GIT_COMMIT_REF is required",
    };
  }

  const configuredEnvironment = readExactValue(env.INNGEST_ENV);
  if (vercelEnvironment === "preview") {
    if (!configuredEnvironment) {
      return {
        ok: false,
        code: "identity_missing",
        reason: "Preview requires an explicit INNGEST_ENV",
      };
    }
    if (configuredEnvironment !== gitBranch) {
      return {
        ok: false,
        code: "identity_mismatch",
        reason: "Preview INNGEST_ENV must match VERCEL_GIT_COMMIT_REF",
      };
    }
  } else {
    if (gitBranch !== PRODUCTION_GIT_BRANCH) {
      return {
        ok: false,
        code: "identity_mismatch",
        reason: `Production VERCEL_GIT_COMMIT_REF must be ${PRODUCTION_GIT_BRANCH}`,
      };
    }
    if (configuredEnvironment) {
      return {
        ok: false,
        code: "identity_mismatch",
        reason: "Production must not set the branch-only INNGEST_ENV override",
      };
    }
  }

  const signingKey = env.INNGEST_SIGNING_KEY?.trim();
  if (!eventKey || !signingKey) {
    return {
      ok: false,
      code: "credentials_missing",
      reason: "INNGEST_EVENT_KEY and INNGEST_SIGNING_KEY are required",
    };
  }

  return {
    ok: true,
    mode: vercelEnvironment,
    options:
      vercelEnvironment === "preview"
        ? { ...options, env: configuredEnvironment, eventKey }
        : { ...options, eventKey },
  };
}

function readExactValue(value: string | undefined): string | undefined {
  if (!value || value !== value.trim() || /[\u0000-\u001f\u007f]/.test(value)) {
    return undefined;
  }
  return value;
}
