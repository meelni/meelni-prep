import { authorizeQuestionSyncRequest } from "@/lib/security/question-sync-authorization";
import { EXPECTED_PREVIEW_SUPABASE_PROJECT_REF } from "@/lib/supabase/supabase-jwt.mjs";
import {
  parseManualQuestionSyncRequest,
  questionSyncAuthorizationResponse,
  questionSyncWorkflowResponse,
} from "@/lib/question-sync/http";
import type {
  QuestionSyncWorkflowInput,
  QuestionSyncWorkflowResult,
} from "@/lib/workflows/sync-question-bank";
import { inferDatabaseProjectRef } from "@/scripts/supabase-project-ref.mjs";

interface QuestionSyncDatabaseIdentity {
  databaseUrl: string | undefined;
  environmentMarker: string | undefined;
  vercelEnvironment: string | undefined;
}

interface QuestionSyncRouteDependencies {
  getSecret(): string | undefined;
  getDatabaseIdentity?(): QuestionSyncDatabaseIdentity;
  run(input: QuestionSyncWorkflowInput): Promise<QuestionSyncWorkflowResult>;
}

export function createScheduledQuestionSyncHandler(
  dependencies: QuestionSyncRouteDependencies
) {
  return async function scheduledQuestionSync(request: Request) {
    const authorization = authorizeQuestionSyncRequest(
      request.headers.get("authorization"),
      dependencies.getSecret()
    );
    if (!authorization.authorized) {
      return questionSyncAuthorizationResponse(authorization);
    }
    if (
      !isNonProductionQuestionSyncTarget(dependencies.getDatabaseIdentity?.())
    ) {
      return productionQuestionSyncActivationRequiredResponse();
    }

    const result = await dependencies.run({ trigger: "cron", dryRun: false });
    return questionSyncWorkflowResponse(result);
  };
}

export function createManualQuestionSyncHandler(
  dependencies: QuestionSyncRouteDependencies
) {
  return async function manualQuestionSync(request: Request) {
    const authorization = authorizeQuestionSyncRequest(
      request.headers.get("authorization"),
      dependencies.getSecret()
    );
    if (!authorization.authorized) {
      return questionSyncAuthorizationResponse(authorization);
    }

    const input = await parseManualQuestionSyncRequest(request);
    if (!input.valid) return input.response;
    if (
      !input.dryRun &&
      !isNonProductionQuestionSyncTarget(dependencies.getDatabaseIdentity?.())
    ) {
      return Response.json(
        {
          error: {
            code: "production_question_sync_cli_required",
            message:
              "Production live sync requires the exact owner-authorized CLI workflow.",
          },
        },
        {
          status: 403,
          headers: { "cache-control": "no-store" },
        }
      );
    }

    const result = await dependencies.run({
      trigger: "manual",
      dryRun: input.dryRun,
    });
    return questionSyncWorkflowResponse(result);
  };
}

function isNonProductionQuestionSyncTarget(
  identity: QuestionSyncDatabaseIdentity | undefined
): boolean {
  if (!identity?.databaseUrl) return false;
  let databaseUrl: URL;
  try {
    databaseUrl = new URL(identity.databaseUrl);
  } catch {
    return false;
  }

  const environment =
    identity.environmentMarker ?? identity.vercelEnvironment ?? "development";
  if (
    identity.environmentMarker &&
    identity.vercelEnvironment &&
    identity.environmentMarker !== identity.vercelEnvironment
  ) {
    return false;
  }
  if (["localhost", "127.0.0.1", "[::1]"].includes(databaseUrl.hostname)) {
    return environment === "development";
  }
  return (
    environment === "preview" &&
    identity.environmentMarker === "preview" &&
    identity.vercelEnvironment === "preview" &&
    inferDatabaseProjectRef(identity.databaseUrl) ===
      EXPECTED_PREVIEW_SUPABASE_PROJECT_REF
  );
}

function productionQuestionSyncActivationRequiredResponse(): Response {
  return Response.json(
    {
      error: {
        code: "production_question_sync_activation_required",
        message:
          "Production question sync remains disabled until the owner-authorized activation path is available.",
      },
    },
    {
      status: 403,
      headers: { "cache-control": "no-store" },
    }
  );
}
