"use client";

import { useId, useRef, useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type SubmitState =
  | { status: "idle" }
  | { status: "submitting" }
  | { status: "success"; receiptId: string; duplicate: boolean }
  | { status: "error"; message: string };

const REASONS = [
  { value: "account", label: "Account" },
  { value: "billing", label: "Billing" },
  { value: "interview", label: "Interview session" },
  { value: "feedback", label: "Feedback" },
  { value: "privacy", label: "Privacy" },
  { value: "other", label: "Other" },
] as const;

export function ContactForm() {
  const formId = useId();
  const idempotencyKey = useRef(crypto.randomUUID());
  const [reason, setReason] = useState<string>("account");
  const [state, setState] = useState<SubmitState>({ status: "idle" });

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setState({ status: "submitting" });

    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": idempotencyKey.current,
        },
        body: JSON.stringify({
          name: data.get("name"),
          email: data.get("email"),
          reason,
          message: data.get("message"),
        }),
      });
      const body = (await response.json()) as {
        receiptId?: string;
        duplicate?: boolean;
        error?: string;
      };
      if (!response.ok || !body.receiptId) {
        setState({
          status: "error",
          message:
            response.status === 429
              ? "We received too many requests from this browser or email recently. Please try again later."
              : "We could not store your message. Please try again in a bit.",
        });
        return;
      }
      setState({
        status: "success",
        receiptId: body.receiptId,
        duplicate: Boolean(body.duplicate),
      });
      idempotencyKey.current = crypto.randomUUID();
      form.reset();
      setReason("account");
    } catch {
      setState({
        status: "error",
        message: "We could not store your message. Please try again in a bit.",
      });
    }
  }

  return (
    <form
      onSubmit={submit}
      className="space-y-5"
      aria-describedby={`${formId}-status`}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`${formId}-name`}>Name</Label>
          <Input
            id={`${formId}-name`}
            name="name"
            autoComplete="name"
            required
            maxLength={120}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${formId}-email`}>Email</Label>
          <Input
            id={`${formId}-email`}
            name="email"
            type="email"
            autoComplete="email"
            required
            maxLength={254}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor={`${formId}-reason`}>What is this about?</Label>
        <Select value={reason} onValueChange={setReason} required>
          <SelectTrigger id={`${formId}-reason`}>
            <SelectValue placeholder="Choose a topic" />
          </SelectTrigger>
          <SelectContent>
            {REASONS.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor={`${formId}-message`}>Message</Label>
        <Textarea
          id={`${formId}-message`}
          name="message"
          required
          maxLength={4000}
          rows={7}
          placeholder="Tell us what happened. Please avoid sending sensitive credentials or payment card details."
        />
      </div>

      <div id={`${formId}-status`} aria-live="polite">
        {state.status === "success" ? (
          <p className="text-success flex items-start gap-2 text-sm">
            <CheckCircle2 className="mt-0.5 h-4 w-4" aria-hidden="true" />
            <span>
              Message stored. Receipt:{" "}
              <span className="font-mono">{state.receiptId}</span>
              {state.duplicate ? " (same retry)" : ""}
            </span>
          </p>
        ) : state.status === "error" ? (
          <p className="text-destructive text-sm">{state.message}</p>
        ) : (
          <p className="text-muted-foreground text-sm">
            We store your message before showing success. We do not accept
            passwords, API keys, or card details here.
          </p>
        )}
      </div>

      <Button type="submit" disabled={state.status === "submitting"}>
        {state.status === "submitting" ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
            Storing message
          </>
        ) : (
          "Send message"
        )}
      </Button>
    </form>
  );
}
