import type { LiveKitDeploymentIdentity } from "./deployment-preflight";

export const PREVIEW_LIVEKIT_PROJECT_ID = "p_16unz4e48is";
export const PREVIEW_INTERVIEW_AGENT_DEPLOYMENT_ID = "CA_ZbGxFjfEYwsD";
export const PREVIEW_DEMO_AGENT_DEPLOYMENT_ID = "CA_M5XTD4CMyXk3";

// Both deployments and their distinct explicit-dispatch names are verified in
// the isolated Preview project. Deployment IDs stay separate from dispatch
// names because the web runtime dispatches by the latter.
export const PREVIEW_LIVEKIT_IDENTITY: LiveKitDeploymentIdentity = {
  projectHost: "meelni-preview-dk7443ua.livekit.cloud",
  demoAgentName: "meelni-preview-demo",
  interviewAgentName: "meelni-preview-interview",
};
