import { permanentRedirect } from "next/navigation";
import {
  buildNewInterviewHrefFromPageSearchParams,
  type InterviewLaunchPageSearchParams,
} from "@/lib/navigation/interview-launch";

export default async function NewRepPage({
  searchParams,
}: {
  searchParams: Promise<InterviewLaunchPageSearchParams>;
}) {
  permanentRedirect(
    buildNewInterviewHrefFromPageSearchParams(await searchParams)
  );
}
