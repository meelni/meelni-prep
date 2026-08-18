import {
  toFeedbackCustomerProjection,
  type FeedbackCustomerProjection,
} from "@meelni/core";
import {
  decodeSyntheticFeedbackArtifactV1,
  decodeSyntheticFeedbackManifestV1,
  type SyntheticFeedbackArtifactV1,
  type SyntheticFeedbackManifestEntryV1,
  type SyntheticFeedbackManifestV1,
} from "@meelni/test-fixtures/synthetic-feedback";

export interface FeedbackLabArtifactEntry {
  artifact: SyntheticFeedbackArtifactV1;
  manifest: SyntheticFeedbackManifestEntryV1;
  projection: FeedbackCustomerProjection | null;
}

export interface FeedbackLabArtifactBundle {
  artifacts: readonly FeedbackLabArtifactEntry[];
  manifest: SyntheticFeedbackManifestV1;
}

type Sha256Text = (value: string) => Promise<string>;

export async function decodeFeedbackLabArtifactBundle({
  artifactJsonByFile,
  manifestJson,
  sha256Text = sha256TextWithWebCrypto,
}: {
  artifactJsonByFile: Readonly<Record<string, string>>;
  manifestJson: string;
  sha256Text?: Sha256Text;
}): Promise<FeedbackLabArtifactBundle | null> {
  try {
    const manifest = decodeSyntheticFeedbackManifestV1(parseJson(manifestJson));
    if (!manifest) return null;

    const artifactFiles = Object.keys(artifactJsonByFile).sort();
    const expectedFiles = manifest.artifacts
      .map((entry) => entry.artifactFile)
      .sort();
    if (!jsonEqual(artifactFiles, expectedFiles)) return null;

    const artifacts: FeedbackLabArtifactEntry[] = [];
    for (const manifestEntry of manifest.artifacts) {
      const artifactJson = artifactJsonByFile[manifestEntry.artifactFile];
      if (
        typeof artifactJson !== "string" ||
        (await sha256Text(artifactJson)) !== manifestEntry.artifactSha256
      ) {
        return null;
      }

      const artifact = decodeSyntheticFeedbackArtifactV1(
        parseJson(artifactJson)
      );
      if (
        !artifact ||
        artifact.scenario.id !== manifestEntry.scenarioId ||
        artifact.scenario.expectedOutcome !== manifestEntry.expectedOutcome ||
        !jsonEqual(artifact.stages, manifestEntry.stages)
      ) {
        return null;
      }

      const projection = toFeedbackCustomerProjection(
        artifact.customer.lifecycle
      );
      const projectedOutcome = projection?.outcome ?? "unavailable";
      if (
        projectedOutcome !== artifact.outcome ||
        projectedOutcome !== manifestEntry.expectedOutcome
      ) {
        return null;
      }
      artifacts.push({ artifact, manifest: manifestEntry, projection });
    }

    return { artifacts, manifest };
  } catch {
    return null;
  }
}

export async function sha256TextWithWebCrypto(value: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value)
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function jsonEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
