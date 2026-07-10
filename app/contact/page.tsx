"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  Bug,
  CheckCircle,
  CreditCard,
  HelpCircle,
  Lightbulb,
  Mail,
  MessageSquare,
  Send,
} from "lucide-react";

import { Icons } from "@/components/icons";
import {
  MarketingCard,
  MarketingCtaCard,
  MarketingEyebrow,
  MarketingHero,
  MarketingPage,
} from "@/components/marketing/marketing-surface";
import {
  AppSurface,
  AppSurfaceDescription,
  AppSurfaceTitle,
} from "@/components/ui/app-surface";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  SelectableCard,
  SelectableCardIcon,
} from "@/components/ui/selectable-card";
import { Textarea } from "@/components/ui/textarea";
import type {
  ContactReason,
  ContactSubmissionResponse,
} from "@/lib/contact/contracts";
import { isCurrentContactSubmissionVersion } from "@/lib/contact/client-state";

interface FormData {
  name: string;
  email: string;
  reason: ContactReason;
  subject: string;
  message: string;
}

interface SubmissionError {
  title: string;
  message: string;
}

const reasons: Array<{
  value: ContactReason;
  label: string;
  icon: React.ReactNode;
}> = [
  {
    value: "billing",
    label: "Billing & Subscription",
    icon: <CreditCard className="h-4 w-4" />,
  },
  {
    value: "support",
    label: "General Support",
    icon: <HelpCircle className="h-4 w-4" />,
  },
  {
    value: "bug",
    label: "Report a Bug",
    icon: <Bug className="h-4 w-4" />,
  },
  {
    value: "feedback",
    label: "Feature Request",
    icon: <Lightbulb className="h-4 w-4" />,
  },
  {
    value: "other",
    label: "Other",
    icon: <MessageSquare className="h-4 w-4" />,
  },
];

export default function ContactPage() {
  const [formData, setFormData] = useState<FormData>({
    name: "",
    email: "",
    reason: "support",
    subject: "",
    message: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [receiptId, setReceiptId] = useState<string | null>(null);
  const [error, setError] = useState<SubmissionError | null>(null);
  const idempotencyKey = useRef<string | null>(null);
  const formVersion = useRef(0);

  const updateForm = <Key extends keyof FormData>(
    field: Key,
    value: FormData[Key]
  ) => {
    formVersion.current += 1;
    idempotencyKey.current = null;
    setError(null);
    setFormData((current) => ({ ...current, [field]: value }));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);
    const submittedVersion = formVersion.current;

    if (!idempotencyKey.current) {
      idempotencyKey.current = crypto.randomUUID();
    }

    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey.current,
        },
        body: JSON.stringify(formData),
      });
      const result = (await response.json()) as ContactSubmissionResponse;

      if (response.ok && result.ok && result.state === "stored") {
        if (
          !isCurrentContactSubmissionVersion(
            submittedVersion,
            formVersion.current
          )
        )
          return;
        setReceiptId(result.receiptId);
        return;
      }

      if (!result.ok) {
        if (
          !isCurrentContactSubmissionVersion(
            submittedVersion,
            formVersion.current
          )
        )
          return;
        if (result.code === "idempotency_conflict") {
          idempotencyKey.current = null;
        }
        setError({
          title:
            result.code === "rate_limited"
              ? "Please wait before trying again"
              : "Request not saved",
          message: result.message,
        });
        return;
      }

      setError({
        title: "Request not saved",
        message:
          "We could not confirm that your request was saved. Try again or email support@meelni.com directly.",
      });
    } catch {
      if (
        !isCurrentContactSubmissionVersion(
          submittedVersion,
          formVersion.current
        )
      )
        return;
      setError({
        title: "Request not saved",
        message:
          "We could not reach the support inbox. Try again or email support@meelni.com directly.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (receiptId) {
    return (
      <MarketingPage className="flex items-center justify-center p-4">
        <MarketingCtaCard
          className="w-full max-w-md"
          tone="success"
          mark={<CheckCircle className="h-8 w-8" />}
          title="Request saved"
          description="Your request is stored in our support inbox. Keep the receipt below if you need to follow up by email."
          action={
            <div className="flex w-full flex-col gap-3">
              <Button asChild variant="outline" className="w-full">
                <Link href="/">
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Return to Home
                </Link>
              </Button>
              <Button asChild className="w-full">
                <Link href="/dashboard">Go to Dashboard</Link>
              </Button>
            </div>
          }
          footer={
            <span className="font-mono text-xs">Receipt: {receiptId}</span>
          }
          role="status"
          aria-live="polite"
        />
      </MarketingPage>
    );
  }

  return (
    <MarketingPage>
      <header className="border-border/60 bg-background/95 sticky top-0 z-50 border-b backdrop-blur-lg">
        <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            <Link href="/" className="flex items-center gap-x-2">
              <Icons.logo className="text-primary h-6 w-6" />
              <span className="text-foreground font-sans text-xl font-semibold">
                Meelni
              </span>
            </Link>
            <Button asChild variant="ghost" size="sm">
              <Link href="/">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Home
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="space-y-8">
          <MarketingHero
            className="mb-0"
            eyebrow={<MarketingEyebrow icon={Mail}>Support</MarketingEyebrow>}
            title="Contact Us"
            description="Have a question, need help with your subscription, or want to share feedback? Send a request or email us directly."
          />

          <div className="grid gap-8 md:grid-cols-3">
            <AppSurface size="none" className="md:col-span-2">
              <div className="border-border/60 border-b p-6">
                <AppSurfaceTitle className="font-display font-light">
                  Send a support request
                </AppSurfaceTitle>
                <AppSurfaceDescription className="mt-1 text-sm">
                  We’ll save your request before confirming it was received.
                </AppSurfaceDescription>
              </div>
              <div className="p-6">
                <form
                  onSubmit={handleSubmit}
                  className="space-y-6"
                  aria-busy={isSubmitting}
                >
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="name">Name</Label>
                      <Input
                        id="name"
                        value={formData.name}
                        onChange={(event) =>
                          updateForm("name", event.target.value)
                        }
                        autoComplete="name"
                        maxLength={100}
                        required
                        disabled={isSubmitting}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="email">Email</Label>
                      <Input
                        id="email"
                        type="email"
                        value={formData.email}
                        onChange={(event) =>
                          updateForm("email", event.target.value)
                        }
                        autoComplete="email"
                        maxLength={320}
                        required
                        disabled={isSubmitting}
                      />
                    </div>
                  </div>

                  <fieldset className="space-y-2">
                    <legend className="text-sm leading-none font-medium">
                      What can we help you with?
                    </legend>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {reasons.map((reason) => (
                        <SelectableCard
                          key={reason.value}
                          selected={formData.reason === reason.value}
                          disabled={isSubmitting}
                          onClick={() => updateForm("reason", reason.value)}
                          className="flex items-center gap-2 p-3 text-sm"
                        >
                          <SelectableCardIcon
                            selected={formData.reason === reason.value}
                            className="p-1"
                          >
                            {reason.icon}
                          </SelectableCardIcon>
                          <span>{reason.label}</span>
                        </SelectableCard>
                      ))}
                    </div>
                  </fieldset>

                  <div className="space-y-2">
                    <Label htmlFor="subject">Subject</Label>
                    <Input
                      id="subject"
                      value={formData.subject}
                      onChange={(event) =>
                        updateForm("subject", event.target.value)
                      }
                      maxLength={200}
                      required
                      disabled={isSubmitting}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="message">Message</Label>
                    <Textarea
                      id="message"
                      value={formData.message}
                      onChange={(event) =>
                        updateForm("message", event.target.value)
                      }
                      placeholder="Include the details we’ll need to help."
                      minLength={10}
                      maxLength={5000}
                      required
                      rows={6}
                      className="resize-y"
                      disabled={isSubmitting}
                    />
                  </div>

                  {error && (
                    <AppSurface
                      className="border-destructive/20 bg-destructive/5 flex items-start gap-3"
                      role="alert"
                      aria-live="assertive"
                    >
                      <AlertCircle className="text-destructive mt-0.5 h-5 w-5 shrink-0" />
                      <div className="space-y-2">
                        <p className="text-destructive text-sm font-medium">
                          {error.title}
                        </p>
                        <p className="text-muted-foreground text-xs">
                          {error.message}
                        </p>
                        <a
                          href="mailto:support@meelni.com"
                          className="text-primary inline-block text-xs font-medium hover:underline"
                        >
                          Email support@meelni.com
                        </a>
                      </div>
                    </AppSurface>
                  )}

                  <Button
                    type="submit"
                    className="w-full"
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? (
                      "Saving request…"
                    ) : (
                      <>
                        <Send className="mr-2 h-4 w-4" />
                        Save request
                      </>
                    )}
                  </Button>
                </form>
              </div>
            </AppSurface>

            <div className="space-y-6">
              <MarketingCard className="p-6">
                <div className="pb-3">
                  <h2 className="text-muted-foreground font-display text-sm font-light tracking-wider uppercase">
                    Direct contact
                  </h2>
                </div>
                <div className="space-y-4">
                  <ContactEmail
                    address="support@meelni.com"
                    label="General support"
                    icon={<Mail className="h-5 w-5" />}
                  />
                  <ContactEmail
                    address="billing@meelni.com"
                    label="Billing inquiries"
                    icon={<CreditCard className="h-5 w-5" />}
                  />
                </div>
              </MarketingCard>

              <MarketingCard className="p-6">
                <div className="pb-3">
                  <h2 className="text-muted-foreground font-display text-sm font-light tracking-wider uppercase">
                    What happens next
                  </h2>
                </div>
                <ol className="text-muted-foreground space-y-3 text-sm">
                  <li>Your request is saved with a receipt.</li>
                  <li>Keep the receipt for your records.</li>
                  <li>Include the receipt if you follow up by email.</li>
                </ol>
              </MarketingCard>

              <MarketingCard className="p-6">
                <div className="pb-3">
                  <h2 className="text-muted-foreground font-display text-sm font-light tracking-wider uppercase">
                    Quick help
                  </h2>
                </div>
                <div className="space-y-2">
                  <Link
                    href="/dashboard?section=settings"
                    className="text-primary block text-sm hover:underline"
                  >
                    Cancel or modify subscription
                  </Link>
                  <Link
                    href="/dashboard?section=billing"
                    className="text-primary block text-sm hover:underline"
                  >
                    View billing history
                  </Link>
                  <Link
                    href="/privacy"
                    className="text-primary block text-sm hover:underline"
                  >
                    Privacy Policy
                  </Link>
                  <Link
                    href="/terms"
                    className="text-primary block text-sm hover:underline"
                  >
                    Terms of Service
                  </Link>
                </div>
              </MarketingCard>
            </div>
          </div>
        </div>
      </main>
    </MarketingPage>
  );
}

function ContactEmail({
  address,
  label,
  icon,
}: {
  address: string;
  label: string;
  icon: React.ReactNode;
}) {
  return (
    <a
      href={`mailto:${address}`}
      className="border-border hover:border-primary/50 group flex items-center gap-3 rounded-lg border p-3 transition-colors"
    >
      <span className="bg-primary/10 text-primary flex h-10 w-10 shrink-0 items-center justify-center rounded-full">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="text-foreground group-hover:text-primary block truncate text-sm font-medium transition-colors">
          {address}
        </span>
        <span className="text-muted-foreground block text-xs">{label}</span>
      </span>
    </a>
  );
}
