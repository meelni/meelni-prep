import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import {
  assertNoSensitiveTrackedContent,
  findSensitiveContentInText,
  inspectTrackedRepository,
} from "./verify-public-repository.mjs";

const execFileAsync = promisify(execFile);

function credential(prefix, character, length = 40) {
  return `${prefix}${character.repeat(length)}`;
}

test("detects the exposed credential classes without echoing their values", () => {
  const text = [
    credential(["phx", "_"].join(""), "A"),
    credential(["sk", "_live_"].join(""), "B"),
    credential(["whsec", "_"].join(""), "C"),
  ].join("\n");

  assert.deepEqual(
    findSensitiveContentInText(text, "fixture.md").map(({ id, line }) => ({
      id,
      line,
    })),
    [
      { id: "posthog-personal-api-key", line: 1 },
      { id: "stripe-live-api-key", line: 2 },
      { id: "stripe-webhook-signing-secret", line: 3 },
    ]
  );
});

test("accepts documented placeholders and public client identifiers", () => {
  const text = [
    "posthog personal placeholder: phx_xxx",
    "STRIPE_SECRET_KEY=sk_live_...",
    "STRIPE_WEBHOOK_SECRET=whsec_...",
    "NEXT_PUBLIC_POSTHOG_KEY=phc_example",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY=public-anon-value",
  ].join("\n");

  assert.deepEqual(findSensitiveContentInText(text, ".env.example"), []);
});

test("detects private-key headers, service-role JWTs, and personal paths", () => {
  const header = `${"-".repeat(5)}BEGIN ${"PRIVATE"} KEY${"-".repeat(5)}`;
  const payload = Buffer.from(
    JSON.stringify({ role: "service_role" })
  ).toString("base64url");
  const jwt = `eyJhbGciOiJIUzI1NiJ9.${payload}.${"s".repeat(32)}`;
  const personalPath = ["", "Users", "developer", "repo"].join("/");
  const findings = findSensitiveContentInText(
    `${header}\n${jwt}\n${personalPath}/file.txt`,
    "fixture.txt"
  );

  assert.deepEqual(
    findings.map(({ id }) => id),
    ["personal-macos-path", "private-key-material", "supabase-service-role-jwt"]
  );
});

test("failure output identifies only type and location", () => {
  const secret = credential(["phx", "_"].join(""), "Z");
  const findings = findSensitiveContentInText(secret, "docs/runbook.md");

  assert.throws(
    () => assertNoSensitiveTrackedContent({ filesInspected: 1, findings }),
    (error) => {
      assert.match(
        error.message,
        /docs\/runbook\.md:1: posthog-personal-api-key/
      );
      assert.equal(error.message.includes(secret), false);
      return true;
    }
  );
});

test("tracked symlinks are inspected as links without following private targets", async () => {
  const directory = await mkdtemp(join(tmpdir(), "meelni-public-scan-"));
  try {
    await execFileAsync("git", ["init", "--quiet", directory]);
    const privateTarget = ["", "Users", "developer", "private.env"].join("/");
    await symlink(privateTarget, join(directory, "private-env"));
    await execFileAsync("git", ["-C", directory, "add", "private-env"]);

    const result = await inspectTrackedRepository(directory);
    assert.deepEqual(result.findings, [
      {
        file: "private-env",
        line: 1,
        id: "personal-macos-path",
      },
    ]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("oversized tracked text files fail closed instead of bypassing inspection", async () => {
  const directory = await mkdtemp(join(tmpdir(), "meelni-public-scan-"));
  try {
    await execFileAsync("git", ["init", "--quiet", directory]);
    await writeFile(
      join(directory, "oversized.txt"),
      Buffer.alloc(10 * 1024 * 1024 + 1, "a")
    );
    await execFileAsync("git", ["-C", directory, "add", "oversized.txt"]);

    const result = await inspectTrackedRepository(directory);
    assert.deepEqual(result.findings, [
      {
        file: "oversized.txt",
        line: 1,
        id: "oversized-tracked-text-file",
      },
    ]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
