import { ShieldCheck } from "lucide-react";
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
  PRIVACY_POLICY_EFFECTIVE_DATE,
  PRIVACY_POLICY_LAST_UPDATED,
} from "@/lib/legal/public-legal-content";
import { publicMetadata } from "@/lib/seo/public-metadata";

export const metadata = publicMetadata("/privacy", {
  title: "Privacy Policy | Meelni",
  description:
    "How Meelni collects, uses, shares, and protects account, interview, billing, and optional analytics information.",
});

export default function PrivacyPolicyPage() {
  return (
    <MarketingPage>
      <Header />
      <PrivacyPolicyContent />
    </MarketingPage>
  );
}

export function PrivacyPolicyContent() {
  return (
    <main className="mx-auto max-w-4xl px-6 py-16">
      <MarketingArticleHeader
        eyebrow={
          <MarketingEyebrow icon={ShieldCheck}>Privacy</MarketingEyebrow>
        }
        title="Privacy Policy"
        meta={
          <p className="text-muted-foreground text-sm">
            Effective {PRIVACY_POLICY_EFFECTIVE_DATE} · Last updated{" "}
            {PRIVACY_POLICY_LAST_UPDATED}
          </p>
        }
      />

      <MarketingProse className="mt-10">
        <div className="space-y-10">
          <section>
            <h2 className="font-display text-2xl font-semibold">
              1. About this policy
            </h2>
            <p>
              This Privacy Policy explains how Meelni (&quot;Meelni,&quot;
              &quot;we,&quot; &quot;us,&quot; or &quot;our&quot;) collects,
              uses, discloses, and protects personal information when you use
              our websites, applications, and interview-practice services (the
              &quot;Service&quot;).
            </p>
            <p>
              Meelni is the operator responsible for the personal information
              covered by this policy. If you have a privacy question or want to
              exercise a privacy right, email{" "}
              <a href="mailto:contact@meelni.com">contact@meelni.com</a>.
            </p>
          </section>

          <section>
            <h2 className="font-display text-2xl font-semibold">
              2. Information we collect
            </h2>
            <p>We collect the following categories of information:</p>
            <ul>
              <li>
                <strong>Account and profile information.</strong> Your name,
                email address, authentication identifiers, profile details,
                settings, and preferences. If you sign in with Google, we
                receive the account information Google makes available for
                authentication.
              </li>
              <li>
                <strong>Interview and practice information.</strong> Questions
                you select, live voice input during an interview, transcript
                text, turn and session timing, generated feedback and scores,
                bookmarks, practice sets, focused-practice responses, and
                progress insights. Live audio is transmitted to voice providers
                for real-time processing. Meelni stores transcript text and
                audio-duration metadata, but does not create or store a
                replayable interview-audio recording in the application.
              </li>
              <li>
                <strong>Payment and subscription information.</strong> Plan,
                purchase, credit, subscription, invoice, and payment-status
                information, along with identifiers used to reconcile billing.
                Stripe processes payment-card details; Meelni does not store
                full card numbers.
              </li>
              <li>
                <strong>Communications.</strong> Information you include in
                support messages, contact submissions, or other communications
                with us.
              </li>
              <li>
                <strong>Technical and security information.</strong> IP address,
                device and browser information, request and event timestamps,
                authentication activity, and diagnostic, security, and
                operational logs needed to run and protect the Service.
              </li>
              <li>
                <strong>Optional analytics information.</strong> If you allow
                analytics, we collect minimized information about pages viewed,
                product actions, performance, and coarse technical context using
                a pseudonymous identifier. Analytics events never include
                interview audio, transcripts, question or answer text, or
                feedback excerpts.
              </li>
            </ul>
            <p>
              We receive information directly from you, automatically from your
              browser or device, and from service providers such as
              authentication, payment, and infrastructure providers.
            </p>
          </section>

          <section>
            <h2 className="font-display text-2xl font-semibold">
              3. Cookies and analytics
            </h2>
            <p>
              Meelni uses strictly necessary cookies and similar technologies
              for authentication, security, service continuity, billing
              handoffs, and remembering your privacy preference. These are
              needed for the Service to work.
            </p>
            <p>
              Optional product analytics are off unless you choose{" "}
              <strong>Allow analytics</strong>. If you allow them, Meelni may
              initialize PostHog and Statsig to measure product usage and
              evaluate product features. Analytics are limited to manually
              approved events; automatic capture and session replay are
              disabled. Declining analytics does not limit your access to the
              Service.
            </p>
            <p>
              You can change your choice at any time in{" "}
              <Link href="/dashboard/settings">
                Data &amp; privacy settings
              </Link>
              . Withdrawing permission stops future optional analytics on that
              browser or account after the preference is applied. Your
              preference cookie may remain for up to 180 days so we can remember
              your choice.
            </p>
            <p>
              Meelni does not use optional analytics for cross-context
              behavioral advertising. Because browser &quot;Do Not Track&quot;
              signals are not standardized, we do not respond to them
              separately; we instead keep optional analytics off until you make
              a choice and provide the controls described above.
            </p>
          </section>

          <section>
            <h2 className="font-display text-2xl font-semibold">
              4. How and why we use information
            </h2>
            <p>We use personal information to:</p>
            <ul>
              <li>create, authenticate, and maintain your account;</li>
              <li>
                run live practice interviews and generate transcripts, feedback,
                scores, recommendations, and progress views;
              </li>
              <li>
                process purchases, subscriptions, credits, cancellations, and
                billing support;
              </li>
              <li>respond to support and privacy requests;</li>
              <li>
                maintain, troubleshoot, secure, and prevent misuse of the
                Service;
              </li>
              <li>
                comply with law, enforce our agreements, and protect users,
                Meelni, and others; and
              </li>
              <li>
                with your permission, understand product usage and improve the
                Service through optional analytics.
              </li>
            </ul>
            <p>
              Where data-protection law requires a legal basis, we rely on:
              performance of our contract with you to provide the Service;
              legitimate interests in operating, securing, supporting, and
              improving the Service; your consent for optional analytics; and
              compliance with legal obligations. Where we rely on legitimate
              interests, those interests are limited by your rights and
              reasonable expectations.
            </p>
            <p>
              AI-generated feedback is informational and may be inaccurate. We
              do not use it to make decisions that produce legal or similarly
              significant effects about you. Meelni does not use interview
              content to train a separate Meelni model.
            </p>
          </section>

          <section>
            <h2 className="font-display text-2xl font-semibold">
              5. How we disclose information
            </h2>
            <p>We may disclose information to:</p>
            <ul>
              <li>
                <strong>Service providers.</strong> Providers that host and
                operate the Service, authenticate users, store data, process
                real-time voice and speech, generate language-model output and
                speech, process payments, run background jobs, provide analytics
                and feature evaluation, and support security and reliability.
                Current core providers include Vercel, Supabase, Google,
                LiveKit, Deepgram, OpenAI, Cartesia, Stripe, Inngest, PostHog,
                and Statsig. They process information for the services they
                provide to Meelni and under their own contractual and legal
                obligations.
              </li>
              <li>
                <strong>Professional advisers.</strong> Lawyers, accountants,
                auditors, insurers, and other advisers when reasonably
                necessary.
              </li>
              <li>
                <strong>Authorities and other parties.</strong> When required by
                law or reasonably necessary to respond to lawful process,
                protect rights and safety, investigate misuse, or enforce our
                agreements.
              </li>
              <li>
                <strong>Business transaction participants.</strong> In
                connection with a financing, merger, acquisition,
                reorganization, or sale of assets, subject to appropriate
                confidentiality protections.
              </li>
            </ul>
            <p>
              We do not sell personal information. We do not share personal
              information for cross-context behavioral advertising, and we do
              not use third-party advertising networks in the Service.
            </p>
          </section>

          <section>
            <h2 className="font-display text-2xl font-semibold">
              6. Retention and deletion
            </h2>
            <p>
              We keep personal information only as long as reasonably necessary
              for the purposes described in this policy. The retention period
              depends on the type of information, whether your account is
              active, whether information is needed to provide feedback and
              account history, and our security, dispute-resolution, tax,
              accounting, and legal obligations.
            </p>
            <p>
              You can request account deletion in{" "}
              <Link href="/dashboard/settings">
                Data &amp; privacy settings
              </Link>
              . A successful request immediately places the account into a
              deletion-pending state. Application and provider cleanup then runs
              or retries asynchronously, so some information may remain
              temporarily in provider systems, restricted backups, security
              logs, billing records, or deletion-control records. We retain
              those records only where reasonably necessary for security, legal
              compliance, fraud prevention, financial reconciliation, or
              reliable completion of the deletion request.
            </p>
          </section>

          <section>
            <h2 className="font-display text-2xl font-semibold">
              7. Your choices and privacy rights
            </h2>
            <p>
              Depending on where you live and applicable law, you may have the
              right to access, receive a copy of, correct, delete, or restrict
              use of your personal information; object to certain processing;
              withdraw consent; and request data portability. You may also have
              the right to appeal our response or complain to your local
              data-protection authority.
            </p>
            <p>
              Authenticated users can download a JSON account export and request
              account deletion from{" "}
              <Link href="/dashboard/settings">
                Data &amp; privacy settings
              </Link>
              . You may also email{" "}
              <a href="mailto:contact@meelni.com">contact@meelni.com</a>. We may
              need to verify your identity and authority before completing a
              request. We will not discriminate against you for exercising an
              applicable privacy right.
            </p>
          </section>

          <section>
            <h2 className="font-display text-2xl font-semibold">
              8. California privacy notice
            </h2>
            <p>
              If the California Consumer Privacy Act applies to Meelni&apos;s
              handling of your information, the categories we may have collected
              in the preceding 12 months are identifiers; customer records;
              commercial information; internet or other electronic activity;
              audio and other electronic information; professional or
              employment-related information you include in practice content;
              and inferences reflected in generated feedback or progress
              insights. We collect and use these categories for the purposes in
              Sections 3 and 4 and disclose them for business purposes to the
              recipients in Section 5.
            </p>
            <p>
              California residents may have rights to know, access, delete, and
              correct personal information, and to limit certain uses of
              sensitive personal information. Meelni has not sold personal
              information or shared it for cross-context behavioral advertising
              in the preceding 12 months. To submit a request, use the account
              controls or email address in Section 7.
            </p>
          </section>

          <section>
            <h2 className="font-display text-2xl font-semibold">
              9. International data transfers
            </h2>
            <p>
              Meelni and its providers may process information in the United
              States and other countries where privacy laws may differ from
              those where you live. Where required, we use legally recognized
              transfer mechanisms and contractual safeguards. You may request
              more information about applicable safeguards by emailing us.
            </p>
          </section>

          <section>
            <h2 className="font-display text-2xl font-semibold">
              10. Children
            </h2>
            <p>
              The Service is not directed to children under 13, and we do not
              knowingly collect personal information from children under 13. If
              you believe a child under 13 has provided personal information,
              email us so we can review and delete it as appropriate.
            </p>
          </section>

          <section>
            <h2 className="font-display text-2xl font-semibold">
              11. Security
            </h2>
            <p>
              We use reasonable technical and organizational safeguards designed
              to protect personal information. No system is completely secure,
              and we cannot guarantee absolute security.
            </p>
          </section>

          <section>
            <h2 className="font-display text-2xl font-semibold">
              12. Changes to this policy
            </h2>
            <p>
              We may update this policy as the Service or law changes. We will
              post the updated policy here and change the &quot;Last
              updated&quot; date. If changes materially affect your rights, we
              will provide additional notice when required.
            </p>
          </section>

          <section>
            <h2 className="font-display text-2xl font-semibold">
              13. Contact us
            </h2>
            <p>
              For privacy questions or requests, email{" "}
              <a href="mailto:contact@meelni.com">contact@meelni.com</a>.
            </p>
            <div className="not-prose mt-6 flex flex-wrap gap-3">
              <Button asChild variant="outline">
                <Link href="/dashboard/settings">Open privacy settings</Link>
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
