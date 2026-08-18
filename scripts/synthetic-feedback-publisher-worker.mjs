import { lstat, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { basename } from "node:path";

const MAX_PAYLOAD_BYTES = 64 * 1024 * 1024;

void main().catch(() => {
  process.stderr.write("synthetic_feedback_publisher_failed\n");
  process.exitCode = 1;
});

async function main() {
  assertRequiredEgressGuard();
  const mode = decodeMode(process.argv[2]);
  const expectedDev = decodeIdentity(process.argv[3]);
  const expectedIno = decodeIdentity(process.argv[4]);
  const cwdStats = await stat(".", { bigint: true });
  if (
    !cwdStats.isDirectory() ||
    cwdStats.dev !== expectedDev ||
    cwdStats.ino !== expectedIno
  ) {
    throw new Error("synthetic_feedback_output_identity_changed");
  }

  process.stdout.write("ready\n");
  const files = decodeFiles(await readInput());
  if (mode === "verify") {
    await verifyFiles(files);
    return;
  }
  for (const file of files) {
    await writeFile(file.name, file.content, {
      encoding: "utf8",
      flag: "wx",
    });
  }
}

function assertRequiredEgressGuard() {
  if (
    process.env.MEELNI_REQUIRE_BROWSER_QA_EGRESS_GUARD === "1" &&
    globalThis[Symbol.for("meelni.browser-qa.egress-guard")] !== true
  ) {
    throw new Error("synthetic_feedback_egress_guard_missing");
  }
}

function decodeMode(value) {
  if (value !== "publish" && value !== "verify") {
    throw new Error("synthetic_feedback_output_mode_invalid");
  }
  return value;
}

function decodeIdentity(value) {
  if (!value || !/^(0|[1-9][0-9]*)$/.test(value)) {
    throw new Error("synthetic_feedback_output_identity_invalid");
  }
  return BigInt(value);
}

async function readInput() {
  const chunks = [];
  let size = 0;
  for await (const chunk of process.stdin) {
    size += chunk.length;
    if (size > MAX_PAYLOAD_BYTES) {
      throw new Error("synthetic_feedback_output_payload_too_large");
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function decodeFiles(value) {
  const decoded = JSON.parse(value);
  if (
    !Array.isArray(decoded) ||
    decoded.length === 0 ||
    decoded.some(
      (file) =>
        !file ||
        typeof file !== "object" ||
        typeof file.name !== "string" ||
        file.name.length === 0 ||
        basename(file.name) !== file.name ||
        file.name === "." ||
        file.name === ".." ||
        typeof file.content !== "string"
    ) ||
    new Set(decoded.map((file) => file.name)).size !== decoded.length
  ) {
    throw new Error("synthetic_feedback_output_payload_invalid");
  }
  return decoded;
}

async function verifyFiles(files) {
  const expectedNames = files.map((file) => file.name).sort();
  const actualNames = (await readdir(".")).sort();
  if (
    expectedNames.length !== actualNames.length ||
    expectedNames.some((name, index) => name !== actualNames[index])
  ) {
    throw new Error("synthetic_feedback_output_mismatch");
  }
  for (const file of files) {
    const stats = await lstat(file.name);
    if (stats.isSymbolicLink() || !stats.isFile()) {
      throw new Error("synthetic_feedback_output_mismatch");
    }
    if ((await readFile(file.name, "utf8")) !== file.content) {
      throw new Error("synthetic_feedback_output_mismatch");
    }
  }
}
