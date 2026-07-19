"use client";

import { useFeatureFlag } from "./statsig-provider";
import { FEATURE_GATES } from "./gates";
import {
  resolvePublicActivationDecision,
  type PublicActivationDecision,
} from "./public-activation";

export function usePublicActivationDecision(): PublicActivationDecision {
  return resolvePublicActivationDecision(
    useFeatureFlag(FEATURE_GATES.meelniReactivationAccess)
  );
}
