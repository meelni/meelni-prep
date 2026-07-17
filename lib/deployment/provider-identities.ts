import type { LiveKitDeploymentIdentity } from "./deployment-preflight";

export const PREVIEW_LIVEKIT_PROJECT_ID = "p_16unz4e48is";
export const PREVIEW_INTERVIEW_AGENT_DEPLOYMENT_ID = "CA_ZbGxFjfEYwsD";

// The project and interview dispatch name are verified. Preview remains
// intentionally fail-closed until a separate demo agent is provisioned and
// its exact dispatch name is added here.
export const PREVIEW_LIVEKIT_IDENTITY: LiveKitDeploymentIdentity = {
  projectHost: "meelni-preview-dk7443ua.livekit.cloud",
  interviewAgentName: "meelni-preview-interview",
};
