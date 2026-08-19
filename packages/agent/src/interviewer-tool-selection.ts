export const INTERVIEWER_TOOL_SELECTION_BENCHMARK_VERSION =
  "interviewer-tool-selection-benchmark.v1" as const;

export const BOUNDED_INTERVIEWER_TOOL_NAMES = [
  "read_interview_state",
  "read_interview_clock",
  "get_probe_candidates",
  "commit_interviewer_move",
  "request_graceful_close",
] as const;

export type BoundedInterviewerToolName =
  (typeof BOUNDED_INTERVIEWER_TOOL_NAMES)[number];

export interface InterviewerToolSelectionCase {
  contract_version: typeof INTERVIEWER_TOOL_SELECTION_BENCHMARK_VERSION;
  case_id: string;
  expected_calls: readonly BoundedInterviewerToolName[];
  observed_calls: readonly {
    name: BoundedInterviewerToolName;
    outcome: "ok" | "fallback";
  }[];
  terminal: boolean;
  recursive_attempt: boolean;
}

export type InterviewerToolSelectionFailure =
  | "budget_exhausted"
  | "duplicate_call"
  | "unexpected_call"
  | "wrong_order"
  | "post_failure_loop"
  | "post_mutation_loop"
  | "terminal_call"
  | "recursive_attempt";

export function evaluateInterviewerToolSelection(
  value: InterviewerToolSelectionCase
): readonly InterviewerToolSelectionFailure[] {
  const failures = new Set<InterviewerToolSelectionFailure>();
  const names = value.observed_calls.map((call) => call.name);
  if (names.length > 3) failures.add("budget_exhausted");
  if (new Set(names).size !== names.length) failures.add("duplicate_call");
  if (value.terminal && names.length > 0) failures.add("terminal_call");
  if (value.recursive_attempt) failures.add("recursive_attempt");
  if (
    names.length !== value.expected_calls.length ||
    names.some((name) => !value.expected_calls.includes(name))
  ) {
    failures.add("unexpected_call");
  } else if (
    names.some((name, index) => name !== value.expected_calls[index])
  ) {
    failures.add("wrong_order");
  }
  const failureIndex = value.observed_calls.findIndex(
    (call) => call.outcome === "fallback"
  );
  if (failureIndex >= 0 && failureIndex !== value.observed_calls.length - 1) {
    failures.add("post_failure_loop");
  }
  const mutationIndex = names.findIndex(
    (name) =>
      name === "commit_interviewer_move" || name === "request_graceful_close"
  );
  if (mutationIndex >= 0 && mutationIndex !== names.length - 1) {
    failures.add("post_mutation_loop");
  }
  return [...failures].sort();
}
