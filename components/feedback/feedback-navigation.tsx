import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";

export function FeedbackDashboardLink() {
  return (
    <Button variant="ghost" size="lg" asChild>
      <Link href="/dashboard">
        <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
        Back to dashboard
      </Link>
    </Button>
  );
}
