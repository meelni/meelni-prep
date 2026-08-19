import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import { ADAPTIVE_INTERVIEWER_FROZEN_EVIDENCE } from "@/lib/operations/adaptive-interviewer-readiness";

import { runAdaptiveInterviewerReadinessCli } from "./run-adaptive-interviewer-readiness";

function capture() {
  let output = "";
  let error = "";
  return {
    io: {
      writeOut(value: string) {
        output += value;
      },
      writeError(value: string) {
        error += value;
      },
    },
    output: () => output,
    error: () => error,
  };
}

test("CLI prints the deterministic held readiness report", async () => {
  const captured = capture();
  assert.equal(await runAdaptiveInterviewerReadinessCli([], captured.io), 0);
  const report = JSON.parse(captured.output());
  assert.equal(report.readiness.system_recommendation, "hold_at_synthetic");
  assert.equal(report.readiness.owner_decision, "pending");
  assert.equal(report.evidence_scope.provider_calls, 0);
  assert.equal(captured.error(), "");
});

test("CLI creates only a pending exact-bound owner request", async () => {
  const captured = capture();
  assert.equal(
    await runAdaptiveInterviewerReadinessCli(
      ["owner-request", "--candidate-sha", "a".repeat(40)],
      captured.io
    ),
    0
  );
  const request = JSON.parse(captured.output());
  assert.equal(request.candidate_git_sha, "a".repeat(40));
  assert.equal(request.owner_decision, "pending");
  assert.equal(request.owner_decision_reference, null);
  assert.equal(request.owner_decided_at, null);
  assert.equal(request.authorization_expires_at, null);
  assert.equal(request.selection_configuration, null);
  assert.equal(request.selected_candidate_configuration_sha256, null);
  assert.equal(request.candidate_preparation_authorized, false);
  assert.equal(request.selection_template.director.provider, null);
  assert.equal(
    request.selection_template.entry_thresholds.maximum_first_audio_p50_ms,
    null
  );
  assert.equal(
    request.selection_template.entry_thresholds.maximum_first_audio_p95_ms,
    null
  );
  assert.equal(request.requested_work, "preview_shadow_candidate_preparation");
  assert.equal(request.future_live_stage, "preview_shadow");
  assert.equal(request.rollout_transition_authorized, false);
  assert.equal(
    request.requested_authority,
    "prepare_isolated_preview_shadow_candidate_only"
  );
  assert.ok(
    request.allowed_repository_actions.includes(
      "implement_selected_director_adapter_candidate"
    )
  );
  assert.ok(request.denied_authority.includes("provider_calls"));
  assert.ok(request.denied_authority.includes("deployment"));
  assert.ok(request.denied_authority.includes("live_rooms"));
  assert.equal(request.selection_constraints.spend_unit, "nano_usd_integer");
  assert.equal(
    request.selection_constraints.second_live_authorization_rehearsal_matrix,
    "unbound_and_unperformed"
  );
});

test("CLI rejects malformed binding and untrusted verification paths", async () => {
  const malformed = capture();
  assert.equal(
    await runAdaptiveInterviewerReadinessCli(
      ["owner-request", "--candidate-sha", "main"],
      malformed.io
    ),
    1
  );
  assert.match(malformed.error(), /binding_invalid/);

  const path = capture();
  assert.equal(
    await runAdaptiveInterviewerReadinessCli(
      ["--verify", "/tmp/report.json"],
      path.io
    ),
    1
  );
  assert.match(path.error(), /path_invalid/);
});

test("owner request fails closed before emission when frozen evidence drifts", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "sav-477-owner-request-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const evidence of Object.values(ADAPTIVE_INTERVIEWER_FROZEN_EVIDENCE)) {
    const target = join(root, evidence.path);
    await mkdir(dirname(target), { recursive: true });
    const source = await readFile(evidence.path, "utf8");
    await writeFile(
      target,
      evidence === ADAPTIVE_INTERVIEWER_FROZEN_EVIDENCE.benchmark
        ? `${source} `
        : source,
      "utf8"
    );
  }

  const captured = capture();
  assert.equal(
    await runAdaptiveInterviewerReadinessCli(
      ["owner-request", "--candidate-sha", "a".repeat(40)],
      captured.io,
      root
    ),
    1
  );
  assert.equal(captured.output(), "");
  assert.match(captured.error(), /frozen_input_digest_mismatch:benchmark/);
});
