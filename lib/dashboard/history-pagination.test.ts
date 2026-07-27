import assert from "node:assert/strict";
import test from "node:test";

import { buildSessionsRequestPath, sessionKeys } from "../api/queries";
import { buildHistoryPaginationView } from "./history-pagination";

test("session queries isolate each API page in the cache and request path", () => {
  assert.deepEqual(sessionKeys.list(20, 40), [
    "sessions",
    "list",
    { limit: 20, offset: 40 },
  ]);
  assert.equal(
    buildSessionsRequestPath(20, 40),
    "/api/sessions?limit=20&offset=40"
  );
  assert.equal(buildSessionsRequestPath(), "/api/sessions");
});

test("history pagination reports the true range and valid adjacent offsets", () => {
  assert.deepEqual(
    buildHistoryPaginationView({
      pagination: {
        total: 53,
        limit: 20,
        offset: 20,
        hasMore: true,
      },
      pageRowCount: 20,
      filteredRowCount: 20,
      filterActive: false,
    }),
    {
      rangeLabel: "Showing 21–40 of 53 interviews",
      pageLabel: "Page 2 of 3",
      hasPrevious: true,
      hasNext: true,
      previousOffset: 0,
      nextOffset: 40,
    }
  );
});

test("history pagination makes current-page filtering explicit", () => {
  const view = buildHistoryPaginationView({
    pagination: {
      total: 53,
      limit: 20,
      offset: 40,
      hasMore: false,
    },
    pageRowCount: 13,
    filteredRowCount: 3,
    filterActive: true,
  });

  assert.equal(
    view.rangeLabel,
    "Showing 3 matches on this page (41–53 of 53 interviews)"
  );
  assert.equal(view.pageLabel, "Page 3 of 3");
  assert.equal(view.hasPrevious, true);
  assert.equal(view.hasNext, false);
  assert.equal(view.previousOffset, 20);
});

test("history pagination uses singular match language", () => {
  const view = buildHistoryPaginationView({
    pagination: {
      total: 25,
      limit: 5,
      offset: 0,
      hasMore: true,
    },
    pageRowCount: 5,
    filteredRowCount: 1,
    filterActive: true,
  });

  assert.equal(
    view.rangeLabel,
    "Showing 1 match on this page (1–5 of 25 interviews)"
  );
});
