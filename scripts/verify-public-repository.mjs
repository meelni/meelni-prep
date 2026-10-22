import { execFile } from "node:child_process";
import { lstat, open, readFile, readlink } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const MAX_TEXT_FILE_BYTES = 10 * 1024 * 1024;

const secretPatterns = [
  {
    id: "posthog-personal-api-key",
    pattern: /\bphx_[A-Za-z0-9_-]{20,}\b/g,
  },
  {
    id: "stripe-live-api-key",
    pattern: /\b(?:sk|rk)_live_(?!x{16,}\b)[A-Za-z0-9]{16,}\b/g,
  },
  {
    id: "stripe-webhook-signing-secret",
    pattern: /\bwhsec_(?!x{16,}\b)[A-Za-z0-9]{16,}\b/g,
  },
  {
    id: "openai-api-key",
    pattern:
      /\b(?:sk-(?:proj|svcacct)-[A-Za-z0-9_-]{20,}|sk-[A-Za-z0-9]{40,})\b/g,
  },
  {
    id: "github-access-token",
    pattern: /\b(?:github_pat_[A-Za-z0-9_]{60,}|gh[pousr]_[A-Za-z0-9]{36,})\b/g,
  },
  {
    id: "aws-access-key-id",
    pattern: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g,
  },
  {
    id: "personal-macos-path",
    pattern: /\/Users\/(?!Shared(?:\/|$))[A-Za-z0-9._-]+\//g,
  },
  {
    id: "private-key-material",
    pattern: new RegExp(
      `${"-".repeat(5)}BEGIN\\s+(?:(?:RSA|EC|OPENSSH)\\s+)?PRIVATE\\s+KEY${"-".repeat(5)}`,
      "g"
    ),
  },
];

const jwtPattern =
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g;

function lineForOffset(text, offset) {
  let line = 1;
  for (let index = 0; index < offset; index += 1) {
    if (text.charCodeAt(index) === 10) line += 1;
  }
  return line;
}

function decodeBase64Url(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = "=".repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(`${normalized}${padding}`, "base64").toString("utf8");
}

export function findSensitiveContentInText(text, file = "<memory>") {
  const findings = [];

  for (const { id, pattern } of secretPatterns) {
    pattern.lastIndex = 0;
    for (const match of text.matchAll(pattern)) {
      findings.push({
        file,
        line: lineForOffset(text, match.index ?? 0),
        id,
      });
    }
  }

  jwtPattern.lastIndex = 0;
  for (const match of text.matchAll(jwtPattern)) {
    try {
      const payload = JSON.parse(decodeBase64Url(match[0].split(".")[1]));
      if (payload?.role === "service_role") {
        findings.push({
          file,
          line: lineForOffset(text, match.index ?? 0),
          id: "supabase-service-role-jwt",
        });
      }
    } catch {
      // Invalid JWT-like strings are not credentials.
    }
  }

  return findings;
}

function appearsBinary(buffer) {
  const sampleLength = Math.min(buffer.length, 8192);
  for (let index = 0; index < sampleLength; index += 1) {
    if (buffer[index] === 0) return true;
  }
  return false;
}

async function trackedFiles(repoRoot) {
  const { stdout } = await execFileAsync(
    "git",
    ["-C", repoRoot, "ls-files", "-z"],
    { encoding: "buffer", maxBuffer: 64 * 1024 * 1024 }
  );
  return stdout.toString("utf8").split("\0").filter(Boolean);
}

async function readBinarySample(absolutePath, size) {
  const handle = await open(absolutePath, "r");
  try {
    const sample = Buffer.alloc(Math.min(size, 8192));
    const { bytesRead } = await handle.read(sample, 0, sample.length, 0);
    return sample.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

export async function inspectTrackedRepository(repoRoot) {
  const findings = [];
  let filesInspected = 0;

  for (const relativePath of await trackedFiles(repoRoot)) {
    const absolutePath = path.join(repoRoot, relativePath);
    let metadata;
    try {
      metadata = await lstat(absolutePath);
    } catch (error) {
      if (error?.code === "ENOENT") continue;
      throw error;
    }
    if (metadata.isSymbolicLink()) {
      const linkTarget = await readlink(absolutePath);
      filesInspected += 1;
      findings.push(...findSensitiveContentInText(linkTarget, relativePath));
      continue;
    }
    if (!metadata.isFile()) continue;

    if (metadata.size > MAX_TEXT_FILE_BYTES) {
      const sample = await readBinarySample(absolutePath, metadata.size);
      if (!appearsBinary(sample)) {
        findings.push({
          file: relativePath,
          line: 1,
          id: "oversized-tracked-text-file",
        });
      }
      continue;
    }

    const contents = await readFile(absolutePath);
    if (appearsBinary(contents)) continue;

    filesInspected += 1;
    findings.push(
      ...findSensitiveContentInText(contents.toString("utf8"), relativePath)
    );
  }

  return { filesInspected, findings };
}

export function assertNoSensitiveTrackedContent(result) {
  if (result.findings.length === 0) return result;
  const locations = result.findings
    .map(({ file, line, id }) => `${file}:${line}: ${id}`)
    .join("\n");
  throw new Error(
    `Tracked public-repository content contains sensitive material:\n${locations}`
  );
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  const repoRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    ".."
  );
  const result = assertNoSensitiveTrackedContent(
    await inspectTrackedRepository(repoRoot)
  );
  console.log(
    `Public repository hygiene passed (${result.filesInspected} tracked text files inspected).`
  );
}
