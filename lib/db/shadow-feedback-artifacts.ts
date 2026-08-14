import { inArray } from "drizzle-orm";

import {
  aggregateShadowFeedbackArtifacts,
  parseShadowFeedbackArtifact,
  parseShadowFeedbackArtifactKey,
  SHADOW_FEEDBACK_ARTIFACT_SET_VERSION,
  type ShadowFeedbackArtifactKeyV1,
  type ShadowFeedbackArtifactSetV1,
  type ShadowFeedbackArtifactV1,
} from "@meelni/core";
import {
  isShadowFeedbackArtifactStorageEnabledContext,
  type ShadowFeedbackArtifactStorageGate,
} from "@/lib/evaluation/shadow-feedback-artifact-config";

import { db } from "./index";
import { shadowFeedbackArtifact } from "./schema";

export type ShadowFeedbackArtifactWriteResult =
  | "inserted"
  | "duplicate"
  | "conflict"
  | "disabled"
  | "rejected";

interface ShadowFeedbackArtifactInsert {
  userId: string;
  artifact: ShadowFeedbackArtifactV1;
}

export interface ShadowFeedbackArtifactRepository {
  insert(
    input: ShadowFeedbackArtifactInsert
  ): Promise<"inserted" | "duplicate" | "conflict">;
  readExact(keyFingerprints: readonly string[]): Promise<readonly unknown[]>;
}

export interface ShadowFeedbackArtifactStore {
  record(
    gate: ShadowFeedbackArtifactStorageGate,
    input: { userId: string; artifact: unknown }
  ): Promise<ShadowFeedbackArtifactWriteResult>;
  readExact(
    gate: ShadowFeedbackArtifactStorageGate,
    expectedKeys: readonly unknown[]
  ): Promise<ShadowFeedbackArtifactSetV1>;
}

export function createShadowFeedbackArtifactStore(
  repository: ShadowFeedbackArtifactRepository = createDrizzleRepository()
): ShadowFeedbackArtifactStore {
  return {
    async record(gate, input) {
      if (!gate.enabled) return "disabled";
      if (!isShadowFeedbackArtifactStorageEnabledContext(gate.context)) {
        return "rejected";
      }
      let artifact: ShadowFeedbackArtifactV1;
      try {
        artifact = parseShadowFeedbackArtifact(input.artifact);
      } catch {
        return "rejected";
      }
      if (!isUuid(input.userId)) return "rejected";
      return repository.insert({ userId: input.userId, artifact });
    },

    async readExact(gate, expectedKeys) {
      if (!gate.enabled) return invalidSet();
      if (!isShadowFeedbackArtifactStorageEnabledContext(gate.context)) {
        return invalidSet();
      }
      let keys: ShadowFeedbackArtifactKeyV1[];
      try {
        keys = expectedKeys.map(parseShadowFeedbackArtifactKey);
      } catch {
        return invalidSet();
      }
      if (keys.length === 0 || keys.length > 1_000) return invalidSet();
      const rows = await repository.readExact(
        keys.map(({ keyFingerprint }) => keyFingerprint)
      );
      return aggregateShadowFeedbackArtifacts({
        expectedKeys: keys,
        artifacts: rows,
      });
    },
  };
}

function createDrizzleRepository(): ShadowFeedbackArtifactRepository {
  return {
    async insert({ userId, artifact }) {
      const key = artifact.key;
      const inserted = await db
        .insert(shadowFeedbackArtifact)
        .values({
          artifactKeyFingerprint: key.keyFingerprint,
          userId,
          sessionId: key.sessionId,
          keyContractVersion: key.contractVersion,
          artifactContractVersion: artifact.contractVersion,
          trustedBlockFingerprint: key.trustedBlockFingerprint,
          rubricVersion: key.rubricVersion,
          promptVersion: key.promptVersion,
          selectionSchemaVersion: key.selectionSchemaVersion,
          modelVersion: key.modelVersion,
          artifact,
          completedAt: new Date(artifact.completedAt),
        })
        .onConflictDoNothing()
        .returning({
          artifactKeyFingerprint: shadowFeedbackArtifact.artifactKeyFingerprint,
        });
      if (inserted.length === 1) return "inserted";

      const existingRows = await db
        .select({ artifact: shadowFeedbackArtifact.artifact })
        .from(shadowFeedbackArtifact)
        .where(
          inArray(shadowFeedbackArtifact.artifactKeyFingerprint, [
            key.keyFingerprint,
          ])
        )
        .limit(1);
      try {
        const existing = parseShadowFeedbackArtifact(existingRows[0]?.artifact);
        return JSON.stringify(existing) === JSON.stringify(artifact)
          ? "duplicate"
          : "conflict";
      } catch {
        return "conflict";
      }
    },

    async readExact(keyFingerprints) {
      if (keyFingerprints.length === 0) return [];
      return db
        .select({ artifact: shadowFeedbackArtifact.artifact })
        .from(shadowFeedbackArtifact)
        .where(
          inArray(
            shadowFeedbackArtifact.artifactKeyFingerprint,
            keyFingerprints
          )
        )
        .then((rows) => rows.map(({ artifact }) => artifact));
    },
  };
}

function invalidSet(): ShadowFeedbackArtifactSetV1 {
  return {
    contractVersion: SHADOW_FEEDBACK_ARTIFACT_SET_VERSION,
    sessionId: "",
    status: "invalid",
    expectedKeyFingerprints: [],
    artifacts: [],
    missingKeyFingerprints: [],
    failedKeyFingerprints: [],
  };
}

function isUuid(value: string): boolean {
  return /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u.test(
    value
  );
}
