import { createSyntheticFeedbackScenarios } from "@meelni/test-fixtures/synthetic-feedback";

import { runFeedbackProductionScenario } from "./feedback-production-scenario";

void main().catch(() => {
  process.stderr.write("synthetic_feedback_worker_failed\n");
  process.exitCode = 1;
});

async function main(): Promise<void> {
  const scenarioIds = decodeScenarioIds(process.argv[2]);
  const catalog = createSyntheticFeedbackScenarios();
  const byId = new Map(catalog.map((scenario) => [scenario.id, scenario]));
  const entries = [];
  for (const scenarioId of scenarioIds) {
    const scenario = byId.get(scenarioId);
    if (!scenario) throw new Error("unknown_synthetic_feedback_scenario");
    const result = await runFeedbackProductionScenario(scenario.fixture, {
      evaluatorCoverage: scenario.evaluatorCoverage,
      ...(scenario.persistedResultMutation === "unknown_schema_version"
        ? { persistedResultMutation: scenario.persistedResultMutation }
        : {}),
    });
    entries.push({ scenarioId, result });
  }
  process.stdout.write(JSON.stringify(entries));
}

function decodeScenarioIds(value: string | undefined): string[] {
  if (!value) throw new Error("synthetic_feedback_worker_input_missing");
  const decoded: unknown = JSON.parse(value);
  if (
    !Array.isArray(decoded) ||
    decoded.length === 0 ||
    decoded.some(
      (scenarioId) => typeof scenarioId !== "string" || scenarioId.length === 0
    ) ||
    new Set(decoded).size !== decoded.length
  ) {
    throw new Error("synthetic_feedback_worker_input_invalid");
  }
  return decoded;
}
