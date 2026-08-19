import assert from "node:assert/strict";
import test from "node:test";

import fixtures from "../../test-fixtures/interview-brief-v2-compiler.json";
import {
  addInterviewBriefV2ToStartConfig,
  compileInterviewBriefV2,
  isInterviewBriefV2EmissionEnabled,
  parseInterviewBriefV2,
  readInterviewBriefV2FromStartConfig,
  resolveOptionalInterviewBriefV2,
  type CompileInterviewBriefV2Input,
} from "./index";

test("compiler serialization matches shared Python-consumed fixtures for every PM round", () => {
  for (const fixture of fixtures.cases) {
    const compiled = compileInterviewBriefV2(
      fixture.input as CompileInterviewBriefV2Input
    );
    assert.equal(compiled.wire, fixture.expected_wire, fixture.name);
    assert.deepEqual(parseInterviewBriefV2(compiled.wire), compiled.brief);
    assert.equal(compiled.brief.round_type, fixture.input.roundType);
    assert.deepEqual(
      compiled.brief.selected_question,
      fixture.input.selectedQuestion
    );
    assert.deepEqual(compiled.brief.round_pack.forbidden_behaviors, [
      "coaching",
      "hinting",
      "mid_session_evaluation",
    ]);
  }
});

test("stable start config reuses exact brief wire and invalid stored context falls back", () => {
  const compiled = compileInterviewBriefV2(
    fixtures.cases[0].input as CompileInterviewBriefV2Input
  );
  const config = addInterviewBriefV2ToStartConfig({ duration: 30 }, compiled);

  assert.deepEqual(readInterviewBriefV2FromStartConfig(config), compiled.brief);
  assert.equal(
    readInterviewBriefV2FromStartConfig({
      ...config,
      interviewBriefV2Wire: '{"contract_version":"interview-brief.v999"}',
    }),
    null
  );
});

test("unknown prompt policy versions fall back to v1 and emission is exact opt-in", () => {
  const brief = JSON.parse(fixtures.cases[0].expected_wire);
  brief.policy.prompt_contract_version = "full_interview_prompt_v999";
  assert.deepEqual(resolveOptionalInterviewBriefV2(brief), {
    mode: "room_metadata_v1",
    reason: "invalid_payload",
  });
  assert.equal(
    isInterviewBriefV2EmissionEnabled({
      MEELNI_INTERVIEW_BRIEF_V2_ENABLED: "true",
    }),
    true
  );
  for (const value of [undefined, "false", "TRUE", "1"]) {
    assert.equal(
      isInterviewBriefV2EmissionEnabled({
        MEELNI_INTERVIEW_BRIEF_V2_ENABLED: value,
      }),
      false
    );
  }
});
