import assert from "node:assert/strict";
import test from "node:test";

import {
  buildExploreQuestionRequest,
  buildExploreUrl,
  parseExploreUrlState,
  roundTypeForExploreLabel,
} from "./explore-url-state";

test("Explore search, type, and page parse from a refresh-safe URL", () => {
  const state = parseExploreUrlState(
    new URLSearchParams("search=activation&type=execution&page=3")
  );
  assert.deepEqual(state, {
    search: "activation",
    roundType: "execution",
    typeLabel: "Execution",
    page: 3,
  });
  assert.equal(
    buildExploreQuestionRequest(state),
    "/api/questions?limit=20&offset=40&activeOnly=true&search=activation&type=execution"
  );
});

test("Explore URL updates reset pagination while preserving unrelated handoff context", () => {
  assert.equal(
    buildExploreUrl(
      "/explore",
      new URLSearchParams("search=old&type=strategy&page=4&campaign=pm"),
      { search: "new search", page: 1 }
    ),
    "/explore?search=new+search&type=strategy&campaign=pm"
  );
});

test("invalid Explore URL values normalize safely", () => {
  assert.deepEqual(
    parseExploreUrlState(new URLSearchParams("type=unknown&page=-3")),
    {
      search: "",
      roundType: null,
      typeLabel: "All Types",
      page: 1,
    }
  );
  assert.equal(roundTypeForExploreLabel("Behavioral"), "behavioral");
  assert.equal(roundTypeForExploreLabel("All Types"), null);
});
