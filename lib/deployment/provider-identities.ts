import type { LiveKitDeploymentIdentity } from "./deployment-preflight";

export const PREVIEW_LIVEKIT_PROJECT_ID = "p_175dshlwom7";
export const PREVIEW_INTERVIEW_AGENT_DEPLOYMENT_ID = "CA_ovn67QQ7ywmJ";
export const PREVIEW_DEMO_AGENT_DEPLOYMENT_ID = "CA_ovn67QQ7ywmJ";

// The Build-plan Preview project hosts both workers in one deployment. The
// deployment ID is intentionally shared; dispatch names remain distinct and
// are the routing identity used by the web runtime.
export const PREVIEW_LIVEKIT_IDENTITY: LiveKitDeploymentIdentity = {
  projectHost: "meelni-preview-gui1i7s9.livekit.cloud",
  demoAgentName: "meelni-preview-demo",
  interviewAgentName: "meelni-preview-interview",
};
