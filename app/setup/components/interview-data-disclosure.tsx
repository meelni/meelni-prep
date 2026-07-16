import { ShieldCheck } from "lucide-react";

export function InterviewDataDisclosure() {
  return (
    <p className="text-dashboard-muted flex max-w-xl items-start gap-2 text-xs leading-5">
      <ShieldCheck
        className="text-primary mt-0.5 h-3.5 w-3.5 shrink-0"
        aria-hidden="true"
      />
      <span>
        Audio is processed live by configured voice providers to run your
        interview. Transcript text is stored for feedback and review; the Meelni
        application does not create or store a replayable interview recording.
      </span>
    </p>
  );
}
