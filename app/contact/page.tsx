"use client";

import { useState } from "react";
import Link from "next/link";
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
import { Icons } from "@/components/icons";
import {
  Mail,
  MessageSquare,
  Send,
  ArrowLeft,
  CheckCircle,
  AlertCircle,
  CreditCard,
  HelpCircle,
  Bug,
  Lightbulb,
} from "lucide-react";

type ContactReason = "billing" | "support" | "bug" | "feedback" | "other";

interface FormData {
  name: string;
  email: string;
  reason: ContactReason;
  subject: string;
  message: string;
}

export default function ContactPage() {
  const [formData, setFormData] = useState<FormData>({
    name: "",
    email: "",
    reason: "support",
    subject: "",
    message: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reasons: { value: ContactReason; label: string; icon: React.ReactNode }[] = [
    { value: "billing", label: "Billing & Subscription", icon: <CreditCard className="w-4 h-4" /> },
    { value: "support", label: "General Support", icon: <HelpCircle className="w-4 h-4" /> },
    { value: "bug", label: "Report a Bug", icon: <Bug className="w-4 h-4" /> },
    { value: "feedback", label: "Feature Request", icon: <Lightbulb className="w-4 h-4" /> },
    { value: "other", label: "Other", icon: <MessageSquare className="w-4 h-4" /> },
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to send message");
      }

      setSubmitted(true);
    } catch (err) {
      console.error("Contact form error:", err);
      setError(
        err instanceof Error
          ? err.message
          : "Failed to send message. Please try emailing us directly at support@meelni.com"
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <MarketingPage className="flex items-center justify-center p-4">
        <MarketingCtaCard
          className="w-full max-w-md"
          tone="success"
          mark={<CheckCircle className="h-8 w-8" />}
          title="Message Sent"
          description="Thank you for reaching out. We'll get back to you within 24 hours."
          action={
            <div className="flex w-full flex-col gap-3">
              <Button asChild variant="outline" className="w-full">
                <Link href="/">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Return to Home
                </Link>
              </Button>
              <Button asChild className="w-full">
                <Link href="/dashboard">Go to Dashboard</Link>
              </Button>
            </div>
          }
          footer={
            formData.reason === "billing"
              ? "For billing issues, we prioritize responses within 4 hours during business hours."
              : undefined
          }
        />
      </MarketingPage>
    );
  }

  return (
    <MarketingPage>
      {/* Header */}
      <header className="border-b border-border/60 bg-background/95 backdrop-blur-lg sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <Link href="/" className="flex items-center gap-x-2">
              <Icons.logo className="h-6 w-6 text-primary" />
              <span className="text-xl font-sans font-semibold text-foreground">Meelni</span>
            </Link>
            <Button asChild variant="ghost" size="sm">
              <Link href="/">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Home
              </Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="space-y-8">
          {/* Page Header */}
          <MarketingHero
            className="mb-0"
            eyebrow={<MarketingEyebrow icon={Mail}>Support</MarketingEyebrow>}
            title="Contact Us"
            description="Have a question, need help with your subscription, or want to share feedback? We're here to help."
          />

          <div className="grid md:grid-cols-3 gap-8">
            {/* Contact Form */}
            <AppSurface size="none" className="md:col-span-2">
              <div className="border-b border-border/60 p-6">
                <AppSurfaceTitle className="font-display font-light">
                  Send us a message
                </AppSurfaceTitle>
                <AppSurfaceDescription className="mt-1 text-sm">
                  Fill out the form below and we'll get back to you as soon as possible.
                </AppSurfaceDescription>
              </div>
              <div className="p-6">
                <form onSubmit={handleSubmit} className="space-y-6">
                  {/* Name & Email Row */}
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="name">Name</Label>
                      <Input
                        id="name"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        placeholder="Your name"
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="email">Email</Label>
                      <Input
                        id="email"
                        type="email"
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        placeholder="your@email.com"
                        required
                      />
                    </div>
                  </div>

                  {/* Reason Selection */}
                  <div className="space-y-2">
                    <Label>What can we help you with?</Label>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {reasons.map((reason) => (
                        <SelectableCard
                          key={reason.value}
                          type="button"
                          selected={formData.reason === reason.value}
                          onClick={() => setFormData({ ...formData, reason: reason.value })}
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
                  </div>

                  {/* Subject */}
                  <div className="space-y-2">
                    <Label htmlFor="subject">Subject</Label>
                    <Input
                      id="subject"
                      value={formData.subject}
                      onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                      placeholder="Brief description of your inquiry"
                      required
                    />
                  </div>

                  {/* Message */}
                  <div className="space-y-2">
                    <Label htmlFor="message">Message</Label>
                    <Textarea
                      id="message"
                      value={formData.message}
                      onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                      placeholder="Please provide as much detail as possible..."
                      required
                      rows={6}
                      className="resize-none"
                    />
                  </div>

                  {/* Error Message */}
                  {error && (
                    <AppSurface className="flex items-start gap-3 border-destructive/20 bg-destructive/5">
                      <AlertCircle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
                      <div className="space-y-1">
                        <p className="text-sm font-medium text-destructive">Failed to send message</p>
                        <p className="text-xs text-muted-foreground">{error}</p>
                      </div>
                    </AppSurface>
                  )}

                  {/* Submit Button */}
                  <Button type="submit" className="w-full" disabled={isSubmitting}>
                    {isSubmitting ? (
                      "Sending..."
                    ) : (
                      <>
                        <Send className="w-4 h-4 mr-2" />
                        Send Message
                      </>
                    )}
                  </Button>
                </form>
              </div>
            </AppSurface>

            {/* Contact Info Sidebar */}
            <div className="space-y-6">
              {/* Direct Contact */}
              <MarketingCard className="p-6">
                <div className="pb-3">
                  <h2 className="text-sm font-display font-light text-muted-foreground tracking-wider uppercase">
                    Direct Contact
                  </h2>
                </div>
                <div className="space-y-4">
                  <a
                    href="mailto:support@meelni.com"
                    className="flex items-center gap-3 p-3 rounded-lg border border-border hover:border-primary/50 transition-colors group"
                  >
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <Mail className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">
                        support@meelni.com
                      </p>
                      <p className="text-xs text-muted-foreground">General support</p>
                    </div>
                  </a>
                  <a
                    href="mailto:billing@meelni.com"
                    className="flex items-center gap-3 p-3 rounded-lg border border-border hover:border-primary/50 transition-colors group"
                  >
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <CreditCard className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">
                        billing@meelni.com
                      </p>
                      <p className="text-xs text-muted-foreground">Billing inquiries</p>
                    </div>
                  </a>
                </div>
              </MarketingCard>

              {/* Response Times */}
              <MarketingCard className="p-6">
                <div className="pb-3">
                  <h2 className="text-sm font-display font-light text-muted-foreground tracking-wider uppercase">
                    Response Times
                  </h2>
                </div>
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Billing Issues</span>
                    <span className="font-medium text-foreground">&lt; 4 hours</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">General Support</span>
                    <span className="font-medium text-foreground">&lt; 24 hours</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Feature Requests</span>
                    <span className="font-medium text-foreground">&lt; 48 hours</span>
                  </div>
                  <p className="text-xs text-muted-foreground pt-2 border-t border-border">
                    Business hours: Mon-Fri, 9am-6pm PST
                  </p>
                </div>
              </MarketingCard>

              {/* Quick Help */}
              <MarketingCard className="p-6">
                <div className="pb-3">
                  <h2 className="text-sm font-display font-light text-muted-foreground tracking-wider uppercase">
                    Quick Help
                  </h2>
                </div>
                <div className="space-y-2">
                  <Link
                    href="/dashboard?section=settings"
                    className="block text-sm text-primary hover:underline"
                  >
                    Cancel or modify subscription
                  </Link>
                  <Link
                    href="/dashboard?section=billing"
                    className="block text-sm text-primary hover:underline"
                  >
                    View billing history
                  </Link>
                  <Link href="/privacy" className="block text-sm text-primary hover:underline">
                    Privacy draft
                  </Link>
                  <Link href="/terms" className="block text-sm text-primary hover:underline">
                    Terms draft
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
