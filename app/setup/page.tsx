import { permanentRedirect } from "next/navigation";
import {
  buildNewInterviewHrefFromPageSearchParams,
  type InterviewLaunchPageSearchParams,
} from "@/lib/navigation/interview-launch";

/**
 * Compatibility redirect for existing setup links.
 */
export default async function SetupPage({
  searchParams,
}: {
  searchParams: Promise<InterviewLaunchPageSearchParams>;
}) {
  permanentRedirect(
    buildNewInterviewHrefFromPageSearchParams(await searchParams)
  );
}
