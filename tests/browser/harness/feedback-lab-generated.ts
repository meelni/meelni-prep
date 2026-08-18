import { decodeFeedbackLabArtifactBundle } from "./feedback-lab-artifacts";

const generatedFiles = import.meta.glob<string>("./generated-feedback/*.json", {
  eager: true,
  import: "default",
  query: "?raw",
});

export async function loadGeneratedFeedbackLabArtifacts() {
  const artifactJsonByFile: Record<string, string> = {};
  let manifestJson: string | null = null;

  for (const [path, contents] of Object.entries(generatedFiles)) {
    const filename = path.slice(path.lastIndexOf("/") + 1);
    if (filename === "manifest.json") manifestJson = contents;
    else artifactJsonByFile[filename] = contents;
  }

  return manifestJson
    ? decodeFeedbackLabArtifactBundle({ artifactJsonByFile, manifestJson })
    : null;
}
