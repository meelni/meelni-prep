import { AlertTriangle, ScrollText } from "lucide-react";
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
  "Terms Draft | Meelni",
  "A temporary terms holding page while Meelni completes accountable owner and legal review before relaunch."
);

export default function TermsOfServiceDraft() {
  return (
    <MarketingPage>
      <Header />
      <TermsHoldingContent />
    </MarketingPage>
  );
}

export function TermsHoldingContent() {
  return (
    <main className="mx-auto max-w-4xl px-6 py-16">
      <MarketingArticleHeader
        eyebrow={
          <MarketingEyebrow icon={ScrollText}>Review Draft</MarketingEyebrow>
        }
        title="Terms under review"
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
              {LEGAL_DRAFT_NOTICE} Nothing on this page asks a visitor to accept
              terms.
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
              Meelni is reviewing its terms before relaunch. The final terms
              will identify the contracting entity and legal contact, explain
              the approved service and purchase rules, and include an approved
              effective date.
            </p>
          </section>

          <section>
            <h2 className="font-display text-2xl font-semibold">
              Questions during review
            </h2>
            <p>
              For questions while review is open, use the contact page. No final
              legal contact or acceptance process is represented by this
              temporary page.
            </p>
            <div className="not-prose mt-6 flex flex-wrap gap-3">
              <Button asChild variant="outline">
                <Link href="/contact">Contact Meelni</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/privacy">Review privacy draft</Link>
              </Button>
            </div>
          </section>
        </div>
      </MarketingProse>
    </main>
  );
}
