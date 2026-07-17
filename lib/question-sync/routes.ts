import { authorizeQuestionSyncRequest } from "@/lib/security/question-sync-authorization";
import {
  parseManualQuestionSyncRequest,
  questionSyncAuthorizationResponse,
  questionSyncWorkflowResponse,
} from "@/lib/question-sync/http";
import type {
  QuestionSyncWorkflowInput,
  QuestionSyncWorkflowResult,
} from "@/lib/workflows/sync-question-bank";

interface QuestionSyncRouteDependencies {
  getSecret(): string | undefined;
  getEnvironment?(): string | undefined;
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
    if (dependencies.getEnvironment?.() === "production" && !input.dryRun) {
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
