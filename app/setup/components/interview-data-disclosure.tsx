import { ShieldCheck } from "lucide-react";

export function InterviewDataDisclosure() {
  return (
    <div className="flex max-w-xl items-start gap-2">
      <ShieldCheck
        className="text-primary mt-0.5 h-3.5 w-3.5 shrink-0"
        aria-hidden="true"
      />
      <p className="text-dashboard-foreground/75 text-xs leading-5">
        Audio is processed live by configured voice providers to run your
        interview. Transcript text is stored for feedback and review; the Meelni
        application does not create or store a replayable interview recording.
      </p>
    </div>
  );
}
