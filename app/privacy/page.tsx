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
  PRIVACY_OWNER_DECISIONS,
} from "@/lib/legal/public-legal-content";

export const metadata = createLegalDraftMetadata(
  "Privacy Draft | Meelni",
  "An unapproved engineering draft describing current Meelni data behavior for accountable owner and legal review."
);

export default function PrivacyPolicyDraft() {
  return (
    <MarketingPage>
      <Header />
      <main className="mx-auto max-w-4xl px-6 py-16">
        <MarketingArticleHeader
          eyebrow={
            <MarketingEyebrow icon={ShieldCheck}>Review Draft</MarketingEyebrow>
          }
          title="Privacy draft for owner review"
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
                {LEGAL_DRAFT_NOTICE} It describes the repository behavior
                reviewed on the date above and marks unresolved privacy policy
                choices rather than inventing guarantees.
              </p>
            </div>
          </div>
        </div>

        <MarketingProse className="mt-10">
          <div className="space-y-10">
            <section>
              <h2 className="font-display text-2xl font-semibold">
                1. Data the current product handles
              </h2>
              <h3>Account and authentication</h3>
              <p>
                Meelni supports Google sign-in and email with a password.
                Supabase authentication supplies account identifiers, email,
                sign-in metadata, and provider metadata. The application can
                store a display name, preferences, and practice settings.
              </p>

              <h3>Live PM interview practice</h3>
              <p>
                The application stores mock-interview lifecycle and timing data,
                selected questions, transcript text and turn timing, generated
                feedback and scores, practice history, bookmarks, practice sets,
                achievements, and progress insights.
              </p>
              <p>
                Live voice audio is transmitted to real-time speech and voice
                services while an interview is running. The application data
                model reviewed for this draft stores transcript text and audio
                duration metadata, not replayable audio files. Provider-side
                processing and retention still require owner review against the
                applicable provider agreements.
              </p>

              <h3>Billing</h3>
              <p>
                Stripe handles checkout and payment processing. Meelni stores
                the subscription, payment summary, usage, credit-ledger, and
                provider references needed to grant access, reconcile billing,
                and perform account cleanup. Raw payment-card details are not
                part of the reviewed application database model.
              </p>

              <h3>Analytics and browser storage</h3>
              <p>
                When configured, PostHog and Statsig browser clients can process
                an anonymous identifier, page and feature events, and—after
                sign-in—the account identifier, email domain, signup method, and
                account creation time. The current repository also contains
                automatic-capture and session-replay paths. The PostHog banner
                defaults to tracking until decline; Statsig initialization is
                separate and does not read that choice. Consent, replay, cookie
                classification, and retention behavior are separate launch
                blockers and are not approved by this draft.
              </p>

              <h3>Support</h3>
              <p>
                Information a person submits through contact or support paths is
                processed to respond to that request. The accountable owner must
                confirm the monitored support and privacy contacts before final
                publication.
              </p>
            </section>

            <section>
              <h2 className="font-display text-2xl font-semibold">
                2. Why the product processes this data
              </h2>
              <ul>
                <li>Authenticate accounts and preserve account settings.</li>
                <li>Run live PM mock interviews and maintain session state.</li>
                <li>
                  Persist transcripts and generate feedback and progress views.
                </li>
                <li>
                  Manage finite interview credits, checkout, and billing
                  recovery.
                </li>
                <li>
                  Operate, secure, diagnose, and improve the product experience.
                </li>
                <li>Measure feature usage when analytics is configured.</li>
              </ul>
              <p>
                The reviewed repository does not establish a separate pipeline
                that trains provider foundation models on interview content.
                Provider data-use terms and any future internal model-training
                purpose require explicit owner approval before being stated.
              </p>
            </section>

            <section>
              <h2 className="font-display text-2xl font-semibold">
                3. Service-provider boundaries
              </h2>
              <p>
                Current code integrates categories of providers for hosting,
                authentication and database storage, real-time voice rooms,
                speech recognition, language-model processing, voice synthesis,
                billing, analytics and feature flags, and background jobs. The
                exact subprocessor list, provider roles, regions, and transfer
                terms must be verified against deployed configuration and
                contracts before this draft is approved.
              </p>
              <p>
                Meelni does not intentionally expose passwords, access tokens,
                API keys, service-role credentials, raw billing webhooks, or
                provider-only identifiers in the account export. Operational
                providers still receive the information necessary to perform
                their configured function.
              </p>
            </section>

            <section>
              <h2 className="font-display text-2xl font-semibold">
                4. Current account controls
              </h2>
              <p>
                An authenticated account can request a JSON export containing
                allowlisted account, settings, practice, transcript, feedback,
                progress, and billing-summary data. The export excludes secrets,
                raw provider operations, logs, deletion tombstones, and other
                users.
              </p>
              <p>
                Account deletion requires a recent server-verified sign-in and
                explicit confirmation. A successful response records a durable
                request and queues asynchronous local, authentication, and
                billing cleanup. It does not claim that every external system,
                backup, log, or legally retained record was erased at that
                moment.
              </p>
            </section>

            <section>
              <h2 className="font-display text-2xl font-semibold">
                5. Retention boundaries
              </h2>
              <p>
                The repository does not define one approved retention period for
                all account, transcript, feedback, analytics, billing, log, and
                backup data. Completed deletion tombstones retain a user
                identifier, status and attempt timestamps, and one-way provider
                fingerprints until a separate retention decision approves
                removal. This draft therefore promises no exact erasure date.
              </p>
            </section>

            <section>
              <h2 className="font-display text-2xl font-semibold">
                6. Decisions required before approval
              </h2>
              <ul>
                {PRIVACY_OWNER_DECISIONS.map((decision) => (
                  <li key={decision}>{decision}</li>
                ))}
              </ul>
            </section>

            <section>
              <h2 className="font-display text-2xl font-semibold">
                7. Review and contact paths
              </h2>
              <p>
                The settings area provides the implemented export and deletion
                controls. Policy or privacy questions can be sent through the
                contact page while the accountable owner confirms a final legal
                contact and request process.
              </p>
              <div className="not-prose mt-6 flex flex-wrap gap-3">
                <Button asChild variant="outline">
                  <Link href="/dashboard/settings">Open account settings</Link>
                </Button>
                <Button asChild variant="outline">
                  <Link href="/terms">Review terms draft</Link>
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
