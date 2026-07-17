type ServerDeploymentEnvironment = Record<string, string | undefined> & {
  MEELNI_REHEARSAL_COMMIT_SHA?: string;
  MEELNI_RELAUNCH_PHASE?: string;
  VERCEL_ENV?: string;
  VERCEL_GIT_COMMIT_REF?: string;
  VERCEL_GIT_COMMIT_SHA?: string;
};

export function buildServerGateDeploymentContext(
  env: ServerDeploymentEnvironment,
  environmentTier: string | undefined
) {
  return {
    deploymentBranch: env.VERCEL_GIT_COMMIT_REF,
    deploymentCommitSha: env.VERCEL_GIT_COMMIT_SHA,
    deploymentTarget: env.VERCEL_ENV,
    environmentTier,
    rehearsalCommitSha: env.MEELNI_REHEARSAL_COMMIT_SHA,
    relaunchPhase: env.MEELNI_RELAUNCH_PHASE,
  };
}
