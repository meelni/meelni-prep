import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const STRUCTURED_DATA_FILES = [
  "components/explore/structured-data.tsx",
  "app/blog/page.tsx",
  "app/blog/[id]/page.tsx",
  "app/companies/page.tsx",
  "app/companies/[slug]/page.tsx",
];

test("public structured data uses the shared script-safe JSON-LD component", async () => {
  for (const file of STRUCTURED_DATA_FILES) {
    const source = await readFile(
      new URL(`../${file}`, import.meta.url),
      "utf8"
    );
    assert.match(source, /<JsonLd\b/, file);
    assert.doesNotMatch(
      source,
      /dangerouslySetInnerHTML|JSON\.stringify/,
      file
    );
  }
});
