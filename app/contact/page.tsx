"use client";

import { useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full text-center">
          <CardContent className="p-8 space-y-6">
            <div className="w-16 h-16 mx-auto rounded-full bg-green-500/10 flex items-center justify-center">
              <CheckCircle className="w-8 h-8 text-green-500" />
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-display font-light text-foreground">Message Sent</h2>
              <p className="text-muted-foreground">
                Thank you for reaching out. We'll get back to you within 24 hours.
              </p>
              {formData.reason === "billing" && (
                <p className="text-sm text-primary">
                  For billing issues, we prioritize responses within 4 hours during business hours.
                </p>
              )}
            </div>
            <div className="flex flex-col gap-3">
              <Link href="/">
                <Button variant="outline" className="w-full">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Return to Home
                </Button>
              </Link>
              <Link href="/dashboard">
                <Button className="w-full">Go to Dashboard</Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border/60 bg-background/95 backdrop-blur-lg sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <Link href="/" className="flex items-center gap-x-2">
              <Icons.logo className="h-6 w-6 text-primary" />
              <span className="text-xl font-sans font-semibold text-foreground">Meelni</span>
            </Link>
            <Link href="/">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Home
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="space-y-8">
          {/* Page Header */}
          <div className="text-center space-y-4">
            <h1 className="text-4xl font-display font-light text-foreground">Contact Us</h1>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Have a question, need help with your subscription, or want to share feedback? We're
              here to help.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {/* Contact Form */}
            <Card className="md:col-span-2">
              <CardHeader>
                <CardTitle className="font-display font-light">Send us a message</CardTitle>
                <CardDescription>
                  Fill out the form below and we'll get back to you as soon as possible.
                </CardDescription>
              </CardHeader>
              <CardContent>
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
                        <button
                          key={reason.value}
                          type="button"
                          onClick={() => setFormData({ ...formData, reason: reason.value })}
                          className={`flex items-center gap-2 p-3 rounded-lg border text-sm transition-all ${
                            formData.reason === reason.value
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-border hover:border-primary/50 text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          {reason.icon}
                          <span>{reason.label}</span>
                        </button>
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
                    <textarea
                      id="message"
                      value={formData.message}
                      onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                      placeholder="Please provide as much detail as possible..."
                      required
                      rows={6}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
                    />
                  </div>

                  {/* Error Message */}
                  {error && (
                    <div className="flex items-start gap-3 p-4 rounded-lg bg-red-500/10 border border-red-500/20">
                      <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                      <div className="space-y-1">
                        <p className="text-sm font-medium text-red-500">Failed to send message</p>
                        <p className="text-xs text-muted-foreground">{error}</p>
                      </div>
                    </div>
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
              </CardContent>
            </Card>

            {/* Contact Info Sidebar */}
            <div className="space-y-6">
              {/* Direct Contact */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-display font-light text-muted-foreground tracking-wider uppercase">
                    Direct Contact
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
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
                </CardContent>
              </Card>

              {/* Response Times */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-display font-light text-muted-foreground tracking-wider uppercase">
                    Response Times
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
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
                </CardContent>
              </Card>

              {/* Quick Help */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-display font-light text-muted-foreground tracking-wider uppercase">
                    Quick Help
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
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
                    Privacy Policy
                  </Link>
                  <Link href="/terms" className="block text-sm text-primary hover:underline">
                    Terms of Service
                  </Link>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
