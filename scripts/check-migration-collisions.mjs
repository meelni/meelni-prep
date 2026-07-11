const DRIZZLE_MIGRATION_PATTERN =
  /^lib\/db\/migrations\/(?<sequence>[0-9]+)_(?<name>[A-Za-z0-9][A-Za-z0-9_-]*)\.sql$/;
const SHA_PATTERN = /^[0-9a-f]{40}$/;
const FILE_STATUSES = new Set([
  "added",
  "changed",
  "copied",
  "modified",
  "removed",
  "renamed",
]);

export function parseDrizzleMigrationPath(path) {
  if (typeof path !== "string") return null;
  const match = path.match(DRIZZLE_MIGRATION_PATTERN);
  if (!match?.groups) return null;
  return {
    sequence: match.groups.sequence,
    name: match.groups.name,
    path,
  };
}

export function inventoryPullRequestMigrations({ pullRequest, files }) {
  if (
    !Number.isInteger(pullRequest?.number) ||
    pullRequest.number < 1 ||
    !SHA_PATTERN.test(pullRequest?.head?.sha ?? "") ||
    typeof pullRequest?.head?.ref !== "string" ||
    !Array.isArray(files)
  ) {
    throw new Error("migration_collision_pull_request_invalid");
  }

  const migrations = [];
  const violations = [];
  const seenFiles = new Set();
  for (const file of files) {
    if (
      typeof file?.filename !== "string" ||
      typeof file?.status !== "string"
    ) {
      throw new Error("migration_collision_file_invalid");
    }
    if (!FILE_STATUSES.has(file.status) || seenFiles.has(file.filename)) {
      throw new Error("migration_collision_file_invalid");
    }
    seenFiles.add(file.filename);
    const migration = parseDrizzleMigrationPath(file.filename);
    if (file.status === "removed") {
      if (migration) {
        violations.push({
          type: "migration_history_removed",
          path: migration.path,
          sequence: migration.sequence,
        });
      }
      continue;
    }
    if (file.status === "renamed") {
      if (typeof file.previous_filename !== "string") {
        throw new Error("migration_collision_file_invalid");
      }
      const previousMigration = parseDrizzleMigrationPath(
        file.previous_filename
      );
      if (previousMigration) {
        violations.push({
          type: "migration_history_renamed_away",
          path: previousMigration.path,
          sequence: previousMigration.sequence,
          replacementPath: file.filename,
        });
      }
    }
    if (migration) migrations.push({ ...migration, status: file.status });
  }

  migrations.sort(
    (left, right) =>
      left.sequence.localeCompare(right.sequence) ||
      left.path.localeCompare(right.path)
  );
  return {
    pr: pullRequest.number,
    headSha: pullRequest.head.sha,
    headRef: pullRequest.head.ref,
    baseRef: pullRequest.base?.ref ?? null,
    migrations,
    violations,
  };
}

export function detectMigrationCollisions(inventories) {
  if (!Array.isArray(inventories)) {
    throw new Error("migration_collision_inventory_invalid");
  }

  const ownersBySequence = new Map();
  for (const inventory of inventories) {
    if (
      !Number.isInteger(inventory?.pr) ||
      !Array.isArray(inventory.migrations) ||
      !Array.isArray(inventory.violations ?? [])
    ) {
      throw new Error("migration_collision_inventory_invalid");
    }
    for (const migration of inventory.migrations) {
      if (!/^[0-9]+$/.test(migration?.sequence ?? "")) {
        throw new Error("migration_collision_inventory_invalid");
      }
      const sequenceKey = BigInt(migration.sequence).toString();
      const owners = ownersBySequence.get(sequenceKey) ?? [];
      owners.push({
        pr: inventory.pr,
        headSha: inventory.headSha,
        headRef: inventory.headRef,
        path: migration.path,
        declaredSequence: migration.sequence,
      });
      ownersBySequence.set(sequenceKey, owners);
    }
  }

  return [...ownersBySequence.entries()]
    .filter(([, owners]) => owners.length > 1)
    .map(([sequenceKey, owners]) => ({
      sequence: sequenceKey.padStart(
        Math.max(4, ...owners.map((owner) => owner.declaredSequence.length)),
        "0"
      ),
      owners: owners.sort(
        (left, right) =>
          left.pr - right.pr || left.path.localeCompare(right.path)
      ),
    }))
    .sort((left, right) =>
      BigInt(left.sequence) < BigInt(right.sequence) ? -1 : 1
    );
}

export function evaluateMigrationInventories(inventories) {
  const collisions = detectMigrationCollisions(inventories);
  const collisionsByPr = new Map();
  for (const collision of collisions) {
    for (const owner of collision.owners) {
      const entries = collisionsByPr.get(owner.pr) ?? [];
      if (!entries.includes(collision)) entries.push(collision);
      collisionsByPr.set(owner.pr, entries);
    }
  }

  return inventories.map((inventory) => {
    const ownedCollisions = collisionsByPr.get(inventory.pr) ?? [];
    const violations = inventory.violations ?? [];
    return {
      ...inventory,
      status:
        inventory.migrations.length === 0 && violations.length === 0
          ? "not_applicable"
          : ownedCollisions.length === 0 && violations.length === 0
            ? "pass"
            : "fail",
      collisions: ownedCollisions,
      violations,
    };
  });
}
