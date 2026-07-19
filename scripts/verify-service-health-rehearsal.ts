import { lstat, readFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";

import { verifyServiceHealthRehearsalEvidence } from "../lib/operations/service-health-rehearsal";

const MAX_BYTES = 64 * 1024;

async function main() {
  const configuredPath = process.env.HEALTH_REHEARSAL_EVIDENCE_PATH;
  if (!configuredPath || !isAbsolute(configuredPath)) return writeRejected();
  const evidencePath = resolve(configuredPath);
  const stats = await lstat(evidencePath);
  if (
    !stats.isFile() ||
    stats.isSymbolicLink() ||
    stats.nlink !== 1 ||
    (stats.mode & 0o077) !== 0 ||
    stats.size > MAX_BYTES
  ) {
    return writeRejected();
  }

  const result = verifyServiceHealthRehearsalEvidence(
    JSON.parse(await readFile(evidencePath, "utf8"))
  );
  const output = `${JSON.stringify(result)}\n`;
  if (result.status === "verified") process.stdout.write(output);
  else {
    process.stderr.write(output);
    process.exitCode = 1;
  }
}

function writeRejected() {
  process.stderr.write(
    `${JSON.stringify(verifyServiceHealthRehearsalEvidence(undefined))}\n`
  );
  process.exitCode = 1;
}

void main().catch(writeRejected);
