import { ShieldCheck } from "lucide-react";

import {
  MarketingArticleHeader,
  MarketingEyebrow,
  MarketingPage,
  MarketingProse,
} from "@/components/marketing/marketing-surface";
import { Header } from "@/components/sections/header";

export default function PrivacyPolicy() {
  return (
    <MarketingPage>
      <Header />
      <main className="mx-auto max-w-4xl px-6 py-16">
        <MarketingArticleHeader
          eyebrow={
            <MarketingEyebrow icon={ShieldCheck}>Legal</MarketingEyebrow>
          }
          title="Privacy Policy"
          meta={
            <p className="text-muted-foreground text-sm">
              Last Updated: November 8, 2025
            </p>
          }
        />

        <MarketingProse className="mt-10">
          <div className="space-y-8">
            <section>
              <h2 className="font-display mb-4 text-2xl font-semibold">
                1. Introduction
              </h2>
              <p>
                Meelni ("we," "our," or "us") is committed to protecting your
                privacy. This Privacy Policy explains how we collect, use,
                disclose, and safeguard your information when you use our
                AI-powered mock interview service.
              </p>
            </section>

            <section>
              <h2 className="font-display mb-4 text-2xl font-semibold">
                2. Information We Collect
              </h2>

              <h3 className="mt-6 mb-3 text-xl font-semibold">
                2.1 Information You Provide
              </h3>
              <ul className="mb-4 list-disc space-y-2 pl-6">
                <li>
                  Account information (name, email address) when you sign up via
                  Google OAuth
                </li>
                <li>Profile information you choose to provide</li>
                <li>Communication data when you contact us for support</li>
              </ul>

              <h3 className="mt-6 mb-3 text-xl font-semibold">
                2.2 Automatically Collected Information
              </h3>
              <ul className="mb-4 list-disc space-y-2 pl-6">
                <li>
                  Interview session data (audio recordings, transcripts,
                  timestamps)
                </li>
                <li>Performance metrics and feedback scores</li>
                <li>
                  Usage data (features used, session duration, interaction
                  patterns)
                </li>
                <li>
                  Device information (browser type, operating system, IP
                  address)
                </li>
                <li>Cookies and similar tracking technologies</li>
              </ul>

              <h3 className="mt-6 mb-3 text-xl font-semibold">
                2.3 Voice and Audio Data
              </h3>
              <p>
                When you participate in mock interviews, we collect and process:
              </p>
              <ul className="list-disc space-y-2 pl-6">
                <li>Real-time audio recordings of your interview sessions</li>
                <li>Speech-to-text transcriptions of your responses</li>
                <li>AI-generated feedback and performance analysis</li>
              </ul>
            </section>

            <section>
              <h2 className="font-display mb-4 text-2xl font-semibold">
                3. How We Use Your Information
              </h2>
              <p className="mb-4">We use the information we collect to:</p>
              <ul className="list-disc space-y-2 pl-6">
                <li>Provide and maintain our interview coaching service</li>
                <li>
                  Generate personalized feedback and performance analytics
                </li>
                <li>Improve our AI models and service quality</li>
                <li>
                  Communicate with you about your account and service updates
                </li>
                <li>Respond to your inquiries and provide customer support</li>
                <li>Monitor and analyze usage patterns and trends</li>
                <li>
                  Detect, prevent, and address technical issues and fraudulent
                  activity
                </li>
                <li>
                  Comply with legal obligations and enforce our Terms of Service
                </li>
              </ul>
            </section>

            <section>
              <h2 className="font-display mb-4 text-2xl font-semibold">
                4. Data Storage and Security
              </h2>
              <p className="mb-4">
                We implement industry-standard security measures to protect your
                data:
              </p>
              <ul className="list-disc space-y-2 pl-6">
                <li>Encryption of data in transit using TLS/SSL protocols</li>
                <li>Encryption of sensitive data at rest in our databases</li>
                <li>Row-level security policies to isolate user data</li>
                <li>Regular security audits and vulnerability assessments</li>
                <li>
                  Access controls limiting employee access to personal data
                </li>
              </ul>
              <p className="mt-4">
                Your interview data is stored on secure servers hosted by
                Supabase (database) and LiveKit (real-time infrastructure). We
                retain your data for as long as your account is active or as
                needed to provide services.
              </p>
            </section>

            <section>
              <h2 className="font-display mb-4 text-2xl font-semibold">
                5. Data Sharing and Disclosure
              </h2>
              <p className="mb-4">
                We do not sell your personal information. We may share your
                information with:
              </p>

              <h3 className="mt-6 mb-3 text-xl font-semibold">
                5.1 Service Providers
              </h3>
              <ul className="mb-4 list-disc space-y-2 pl-6">
                <li>Supabase (authentication and database hosting)</li>
                <li>LiveKit (real-time voice infrastructure)</li>
                <li>OpenAI (AI language model processing)</li>
                <li>Deepgram (speech recognition)</li>
                <li>Cartesia (text-to-speech synthesis)</li>
                <li>Vercel (application hosting)</li>
              </ul>

              <h3 className="mt-6 mb-3 text-xl font-semibold">
                5.2 Legal Requirements
              </h3>
              <p>
                We may disclose your information if required by law or in
                response to valid requests by public authorities (e.g., court
                orders, subpoenas).
              </p>

              <h3 className="mt-6 mb-3 text-xl font-semibold">
                5.3 Business Transfers
              </h3>
              <p>
                If Meelni is involved in a merger, acquisition, or sale of
                assets, your information may be transferred as part of that
                transaction.
              </p>
            </section>

            <section>
              <h2 className="font-display mb-4 text-2xl font-semibold">
                6. Your Privacy Rights
              </h2>
              <p className="mb-4">You have the right to:</p>
              <ul className="list-disc space-y-2 pl-6">
                <li>
                  <strong>Access:</strong> Request a copy of your personal data
                </li>
                <li>
                  <strong>Correction:</strong> Update or correct inaccurate
                  information
                </li>
                <li>
                  <strong>Deletion:</strong> Request deletion of your account
                  and associated data
                </li>
                <li>
                  <strong>Portability:</strong> Receive your data in a
                  structured, machine-readable format
                </li>
                <li>
                  <strong>Objection:</strong> Object to processing of your
                  personal data
                </li>
                <li>
                  <strong>Restriction:</strong> Request restriction of
                  processing in certain circumstances
                </li>
              </ul>
              <p className="mt-4">
                To exercise these rights, please contact us at{" "}
                <a
                  href="mailto:contact@meelni.com"
                  className="text-primary hover:underline"
                >
                  contact@meelni.com
                </a>
              </p>
            </section>

            <section>
              <h2 className="font-display mb-4 text-2xl font-semibold">
                7. Data Retention
              </h2>
              <p>
                We retain your personal information for as long as necessary to
                provide our services and fulfill the purposes outlined in this
                Privacy Policy. You may request deletion of your account at any
                time, after which we will delete or anonymize data linked to
                that authenticated account within 30 days, except where
                retention is required by law. A support request is linked to
                your account only when you submit it while authenticated using
                the same verified email address. For support communications
                submitted without that verified account match, contact us from
                the same email address so we can verify a separate privacy
                request before deleting or anonymizing the communication.
              </p>
            </section>

            <section>
              <h2 className="font-display mb-4 text-2xl font-semibold">
                8. International Data Transfers
              </h2>
              <p>
                Your information may be transferred to and processed in
                countries other than your country of residence. We ensure
                appropriate safeguards are in place to protect your data in
                accordance with this Privacy Policy and applicable laws.
              </p>
            </section>

            <section>
              <h2 className="font-display mb-4 text-2xl font-semibold">
                9. Cookies and Tracking Technologies
              </h2>
              <p className="mb-4">
                We use cookies and similar technologies to:
              </p>
              <ul className="list-disc space-y-2 pl-6">
                <li>Maintain your session and authentication state</li>
                <li>Remember your preferences and settings</li>
                <li>Analyze usage patterns and improve our service</li>
              </ul>
              <p className="mt-4">
                You can control cookies through your browser settings. Note that
                disabling cookies may affect the functionality of our service.
              </p>
            </section>

            <section>
              <h2 className="font-display mb-4 text-2xl font-semibold">
                10. Children's Privacy
              </h2>
              <p>
                Our service is not intended for individuals under the age of 18.
                We do not knowingly collect personal information from children.
                If you believe we have inadvertently collected data from a
                child, please contact us immediately.
              </p>
            </section>

            <section>
              <h2 className="font-display mb-4 text-2xl font-semibold">
                11. AI and Automated Decision-Making
              </h2>
              <p>
                We use AI to analyze your interview performance and provide
                feedback. While our AI generates automated assessments, these
                are intended as coaching tools, not employment decisions. You
                have the right to request human review of AI-generated feedback.
              </p>
            </section>

            <section>
              <h2 className="font-display mb-4 text-2xl font-semibold">
                12. Changes to This Privacy Policy
              </h2>
              <p>
                We may update this Privacy Policy from time to time. We will
                notify you of any changes by posting the new Privacy Policy on
                this page and updating the "Last Updated" date. We encourage you
                to review this Privacy Policy periodically.
              </p>
            </section>

            <section>
              <h2 className="font-display mb-4 text-2xl font-semibold">
                13. California Privacy Rights (CCPA)
              </h2>
              <p className="mb-4">
                If you are a California resident, you have additional rights
                under the California Consumer Privacy Act:
              </p>
              <ul className="list-disc space-y-2 pl-6">
                <li>
                  Right to know what personal information we collect and how
                  it's used
                </li>
                <li>Right to request deletion of personal information</li>
                <li>
                  Right to opt-out of the sale of personal information (we do
                  not sell your data)
                </li>
                <li>
                  Right to non-discrimination for exercising your privacy rights
                </li>
              </ul>
            </section>

            <section>
              <h2 className="font-display mb-4 text-2xl font-semibold">
                14. European Privacy Rights (GDPR)
              </h2>
              <p>
                If you are in the European Economic Area, you have rights under
                the General Data Protection Regulation, including the rights
                listed in Section 6, as well as the right to lodge a complaint
                with a supervisory authority.
              </p>
            </section>

            <section>
              <h2 className="font-display mb-4 text-2xl font-semibold">
                15. Contact Us
              </h2>
              <p>
                If you have questions or concerns about this Privacy Policy or
                our data practices, please contact us at:
              </p>
              <ul className="mt-4 list-none space-y-2">
                <li>
                  Email:{" "}
                  <a
                    href="mailto:contact@meelni.com"
                    className="text-primary hover:underline"
                  >
                    contact@meelni.com
                  </a>
                </li>
              </ul>
            </section>
          </div>
        </MarketingProse>
      </main>
    </MarketingPage>
  );
}
