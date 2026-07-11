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
  getLegalBillingFacts,
  LEGAL_DRAFT_NOTICE,
  LEGAL_DRAFT_REVIEWED_ON,
  TERMS_OWNER_DECISIONS,
} from "@/lib/legal/public-legal-content";

export const metadata = createLegalDraftMetadata(
  "Terms Draft | Meelni",
  "An unapproved engineering draft describing current Meelni product behavior for accountable owner and legal review."
);

export default function TermsOfServiceDraft() {
  const billingFacts = getLegalBillingFacts();

  return (
    <MarketingPage>
      <Header />
      <main className="mx-auto max-w-4xl px-6 py-16">
        <MarketingArticleHeader
          eyebrow={
            <MarketingEyebrow icon={ScrollText}>Review Draft</MarketingEyebrow>
          }
          title="Terms draft for owner review"
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
                {LEGAL_DRAFT_NOTICE} This page records current product facts and
                unresolved policy decisions; it does not ask visitors to accept
                terms.
              </p>
            </div>
          </div>
        </div>

        <MarketingProse className="mt-10">
          <div className="space-y-10">
            <section>
              <h2 className="font-display text-2xl font-semibold">
                1. Current service scope
              </h2>
              <p>
                Meelni is live PM interview practice for Product Sense,
                Execution, Strategy, and Behavioral interviews. The product can
                provide live voice mock interviews, transcript-based review,
                PM-calibrated feedback, and practice history. It does not
                guarantee an interview outcome, hiring decision, or preparation
                certification.
              </p>
              <p>
                The relaunch experience remains behind a feature flag that is
                off by default while launch preparation is open. Code or pricing
                shown in this draft is not evidence that every path is publicly
                available.
              </p>
            </section>

            <section>
              <h2 className="font-display text-2xl font-semibold">
                2. Accounts and access
              </h2>
              <p>
                Current authentication supports Google sign-in and email with a
                password. Credential-responsibility, eligibility, age,
                suspension, acceptable-use, and appeals rules still require
                accountable approval.
              </p>
            </section>

            <section>
              <h2 className="font-display text-2xl font-semibold">
                3. Current billing catalog
              </h2>
              <p>
                Full mock interviews use finite credits. The facts below are
                projected from the same catalog used by Meelni pricing; no plan
                is described as open-ended.
              </p>
              <div className="not-prose border-border/50 overflow-hidden rounded-xl border">
                <ul className="divide-border/50 divide-y">
                  {billingFacts.map((plan) => (
                    <li key={plan.catalogId} className="space-y-1 p-5">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <h3 className="text-foreground font-semibold">
                          {plan.name}
                        </h3>
                        <span className="text-foreground text-sm font-medium">
                          {plan.priceLabel} per {plan.frequencyLabel}
                        </span>
                      </div>
                      <p className="text-muted-foreground text-sm">
                        {plan.creditLabel}. {plan.expirationLabel}.
                        {plan.rolloverLabel ? ` ${plan.rolloverLabel}.` : ""}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
              <p>
                Renewal, cancellation, refund, tax, and migrated-account terms
                must be reviewed against the live Stripe configuration before
                this draft becomes effective.
              </p>
            </section>

            <section>
              <h2 className="font-display text-2xl font-semibold">
                4. Practice content and account data
              </h2>
              <p>
                The product processes selected questions, transcript text,
                interview timing and lifecycle data, feedback, scores, settings,
                and billing summaries to provide the practice experience. Final
                ownership and license language for user content, feedback, and
                question-bank material has not been approved.
              </p>
              <p>
                Account deletion is asynchronous. A successful request means a
                durable cleanup workflow was queued, not that every provider,
                backup, log, or legally retained record was erased immediately.
              </p>
            </section>

            <section>
              <h2 className="font-display text-2xl font-semibold">
                5. Decisions required before approval
              </h2>
              <ul>
                {TERMS_OWNER_DECISIONS.map((decision) => (
                  <li key={decision}>{decision}</li>
                ))}
              </ul>
            </section>

            <section>
              <h2 className="font-display text-2xl font-semibold">
                6. Related product information
              </h2>
              <p>
                Review the separate privacy draft and the current pricing page
                alongside this draft. Questions for the accountable owner can be
                sent through Meelni&apos;s contact page; the final legal contact
                must still be approved.
              </p>
              <div className="not-prose mt-6 flex flex-wrap gap-3">
                <Button asChild variant="outline">
                  <Link href="/privacy">Review privacy draft</Link>
                </Button>
                <Button asChild variant="outline">
                  <Link href="/pricing">View current pricing</Link>
                </Button>
                <Button asChild variant="outline">
                  <Link href="/contact">Contact Meelni</Link>
                </Button>
              </div>
            </section>
          </div>
        </MarketingProse>
      </main>
    </MarketingPage>
  );
}
