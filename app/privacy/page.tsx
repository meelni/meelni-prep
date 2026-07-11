import { AlertTriangle, ShieldCheck } from "lucide-react";
import Link from "next/link";

import {
  MarketingArticleHeader,
  MarketingEyebrow,
  MarketingPage,
  MarketingProse,
} from "@/components/marketing/marketing-surface";
import { Header } from "@/components/sections/header";
import { Button } from "@/components/ui/button";
import {
  createLegalDraftMetadata,
  LEGAL_DRAFT_NOTICE,
  LEGAL_DRAFT_REVIEWED_ON,
} from "@/lib/legal/public-legal-content";

export const metadata = createLegalDraftMetadata(
  "Privacy Draft | Meelni",
  "A temporary privacy holding page while Meelni completes accountable owner and legal review before relaunch."
);

export default function PrivacyPolicyDraft() {
  return (
    <MarketingPage>
      <Header />
      <PrivacyHoldingContent />
    </MarketingPage>
  );
}

export function PrivacyHoldingContent() {
  return (
    <main className="mx-auto max-w-4xl px-6 py-16">
      <MarketingArticleHeader
        eyebrow={
          <MarketingEyebrow icon={ShieldCheck}>Review Draft</MarketingEyebrow>
        }
        title="Privacy notice under review"
        meta={
          <p className="text-muted-foreground text-sm">
            Engineering review: {LEGAL_DRAFT_REVIEWED_ON} · No effective date
          </p>
        }
      />

      <div className="border-warning/40 bg-warning/5 mt-8 rounded-xl border p-5">
        <div className="flex items-start gap-3">
          <AlertTriangle
            className="text-warning mt-0.5 h-5 w-5 shrink-0"
            aria-hidden="true"
          />
          <div>
            <h2 className="text-foreground font-semibold">Draft status</h2>
            <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
              {LEGAL_DRAFT_NOTICE}
            </p>
          </div>
        </div>
      </div>

      <MarketingProse className="mt-10">
        <div className="space-y-10">
          <section>
            <h2 className="font-display text-2xl font-semibold">
              Policy review in progress
            </h2>
            <p>
              Meelni is reviewing its privacy notice before relaunch. The final
              notice will identify the accountable entity and privacy contact,
              explain applicable data practices and choices, and include an
              approved effective date.
            </p>
          </section>

          <section>
            <h2 className="font-display text-2xl font-semibold">
              Account data requests
            </h2>
            <p>
              An authenticated account can request a JSON export or submit an
              account-deletion request from settings. A successful
              account-deletion response means a durable deletion request exists.
              Cleanup runs or retries asynchronously; it does not mean every
              provider, backup, log, or legally retained record was erased
              immediately.
            </p>
            <p>
              A monitored privacy contact is not published while review is open.
              The final notice will publish the approved privacy contact and
              request process.
            </p>
            <div className="not-prose mt-6 flex flex-wrap gap-3">
              <Button asChild variant="outline">
                <Link href="/dashboard/settings">Open account settings</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/terms">Review terms draft</Link>
              </Button>
            </div>
          </section>
        </div>
      </MarketingProse>
    </main>
  );
}
