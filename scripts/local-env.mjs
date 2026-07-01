import { existsSync, lstatSync, readFileSync, unlinkSync } from "node:fs";
import { copyFile, mkdir, symlink } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";

export function parseEnvContent(content) {
  const values = new Map();

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
      continue;
    }

    const [key, ...rest] = trimmed.split("=");
    values.set(key, rest.join("="));
  }

  return values;
}

export function readEnvFile(path) {
  if (!existsSync(path)) {
    return new Map();
  }

  return parseEnvContent(readFileSync(path, "utf8"));
}

export function requiredEnvStatus(values, requiredKeys) {
  const missing = requiredKeys.filter((key) => isBlankEnvValue(values.get(key)));
  const placeholder = requiredKeys.filter((key) => {
    const value = values.get(key);
    return !isBlankEnvValue(value) && isPlaceholderEnvValue(value);
  });

  return {
    missing,
    placeholder,
    ok: missing.length === 0 && placeholder.length === 0
  };
}

export function normalizeEnvValue(value) {
  return String(value ?? "").trim().replace(/^(['"])(.*)\1$/, "$2");
}

export function isBlankEnvValue(value) {
  return normalizeEnvValue(value) === "";
}

export function isBlankOrPlaceholderEnvValue(value) {
  return isBlankEnvValue(value) || isPlaceholderEnvValue(value);
}

export function isUsableEnvValue(value) {
  return !isBlankOrPlaceholderEnvValue(value);
}

export function isPlaceholderEnvValue(value) {
  const normalized = normalizeEnvValue(value);

  return [
    /^postgresql:\/\/\.\.\.$/,
    /^https:\/\/xxx\.supabase\.co$/,
    /^eyJxxx\.\.\.$/,
    /^your[_-]/,
    /your-project/,
    /^sk-proj-xxx$/,
    /^sk_test_xxx$/,
    /^pk_test_xxx$/,
    /^whsec_xxx$/,
    /^price_xxx$/,
    /^xxx$/,
    /\.\.\.$/,
  ].some((pattern) => pattern.test(normalized));
}

export async function ensureEnvFile({ targetPath, examplePath }) {
  if (existsSync(targetPath)) {
    return { path: targetPath, status: "exists" };
  }

  await mkdir(dirname(targetPath), { recursive: true });

  if (examplePath && existsSync(examplePath)) {
    await copyFile(examplePath, targetPath);
    return { path: targetPath, status: "created-from-example" };
  }

  await copyFile(resolve(dirname(new URL(import.meta.url).pathname), "../.env.example"), targetPath);
  return { path: targetPath, status: "created-from-root-example" };
}

export async function ensureSymlink({ linkPath, targetPath }) {
  await mkdir(dirname(linkPath), { recursive: true });

  if (existsSync(linkPath)) {
    const stat = lstatSync(linkPath);

    if (!stat.isSymbolicLink()) {
      return { linkPath, status: "exists-not-symlink" };
    }

    unlinkSync(linkPath);
  }

  const relativeTarget = relative(dirname(linkPath), targetPath);
  await symlink(relativeTarget, linkPath);

  return { linkPath, status: "linked" };
}
