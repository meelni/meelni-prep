import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const skillsRoot = resolve(repoRoot, ".agents/skills");
const namePattern = /^[a-z0-9-]+$/;

if (!existsSync(skillsRoot)) {
  fail(`Missing skills directory: ${relative(skillsRoot)}`);
}

const skillDirs = readdirSync(skillsRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => resolve(skillsRoot, entry.name))
  .sort();

if (skillDirs.length === 0) {
  fail("No Meelni skills found.");
}

const errors = [];

for (const skillDir of skillDirs) {
  const skillName = basename(skillDir);
  const skillPath = resolve(skillDir, "SKILL.md");

  if (!existsSync(skillPath)) {
    errors.push(`${skillName}: missing SKILL.md`);
    continue;
  }

  const text = readFileSync(skillPath, "utf8");
  const frontmatter = readFrontmatter(text);

  if (!frontmatter) {
    errors.push(`${skillName}: missing YAML frontmatter`);
    continue;
  }

  const fields = parseSimpleFrontmatter(frontmatter);

  if (!fields.name) {
    errors.push(`${skillName}: missing name`);
  } else if (fields.name !== skillName) {
    errors.push(`${skillName}: name must match folder, found ${fields.name}`);
  } else if (!namePattern.test(fields.name)) {
    errors.push(
      `${skillName}: name must use lowercase letters, numbers, and hyphens`
    );
  }

  if (!fields.description) {
    errors.push(`${skillName}: missing description`);
  } else if (fields.description.length < 40) {
    errors.push(`${skillName}: description is too short to route reliably`);
  }

  const body = text.slice(text.indexOf("---", 3) + 3).trim();

  if (!body.startsWith("# ")) {
    errors.push(`${skillName}: body should start with a top-level heading`);
  }
}

if (errors.length > 0) {
  console.error("Skill validation failed:");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log(`Validated ${skillDirs.length} Meelni skill(s).`);

function readFrontmatter(text) {
  if (!text.startsWith("---\n")) {
    return undefined;
  }

  const end = text.indexOf("\n---", 4);
  return end === -1 ? undefined : text.slice(4, end);
}

function parseSimpleFrontmatter(frontmatter) {
  const fields = {};

  for (const line of frontmatter.split("\n")) {
    const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!match) {
      continue;
    }

    const [, key, rawValue] = match;
    fields[key] = rawValue.replace(/^["']|["']$/g, "").trim();
  }

  return fields;
}

function relative(path) {
  return path.replace(`${repoRoot}/`, "");
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
