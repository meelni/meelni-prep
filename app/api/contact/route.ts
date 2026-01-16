import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

// Contact form validation schema
const contactSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  email: z.string().email("Invalid email address"),
  reason: z.enum(["billing", "support", "bug", "feedback", "other"]),
  subject: z.string().min(1, "Subject is required").max(200),
  message: z.string().min(10, "Message must be at least 10 characters").max(5000),
});

/**
 * POST /api/contact
 *
 * Handles contact form submissions.
 * Stores the message and sends notification email.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Validate input
    const result = contactSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { error: result.error.issues[0]?.message || "Invalid input" },
        { status: 400 }
      );
    }

    const { name, email, reason, subject, message } = result.data;

    // Determine priority based on reason
    const priority = reason === "billing" ? "high" : "normal";

    // Build email content
    const emailSubject = `[Meelni ${reason.toUpperCase()}] ${subject}`;
    const emailBody = `
New contact form submission:

From: ${name} <${email}>
Reason: ${reason}
Priority: ${priority}
Subject: ${subject}

Message:
${message}

---
Submitted at: ${new Date().toISOString()}
    `.trim();

    // Try to send via Resend if configured
    const resendApiKey = process.env.RESEND_API_KEY;
    const notificationEmail = process.env.CONTACT_NOTIFICATION_EMAIL || "support@meelni.com";

    if (resendApiKey) {
      try {
        const resendResponse = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${resendApiKey}`,
          },
          body: JSON.stringify({
            from: "Meelni Contact <noreply@meelni.com>",
            to: [notificationEmail],
            reply_to: email,
            subject: emailSubject,
            text: emailBody,
          }),
        });

        if (!resendResponse.ok) {
          const errorData = await resendResponse.json();
          console.error("Resend API error:", errorData);
          // Don't fail the request - message is still received
        }
      } catch (emailError) {
        console.error("Failed to send email via Resend:", emailError);
        // Don't fail the request - message is still received
      }
    }

    // Also send auto-reply to user
    if (resendApiKey) {
      try {
        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${resendApiKey}`,
          },
          body: JSON.stringify({
            from: "Meelni Support <support@meelni.com>",
            to: [email],
            subject: "We received your message - Meelni Support",
            text: `Hi ${name},

Thank you for reaching out to Meelni. We've received your message and will get back to you as soon as possible.

For billing inquiries, we prioritize responses within 4 hours during business hours.
For all other inquiries, expect a response within 24 hours.

Your message reference:
Subject: ${subject}
Reason: ${reason}

If this is urgent, you can also email us directly at:
- billing@meelni.com (for billing issues)
- support@meelni.com (for general support)

Best regards,
The Meelni Team

---
This is an automated message. Please do not reply directly to this email.
            `.trim(),
          }),
        });
      } catch (emailError) {
        console.error("Failed to send auto-reply:", emailError);
        // Don't fail the request
      }
    }

    // Log the contact for tracking (even without email service)
    console.log("Contact form submission received:", {
      name,
      email,
      reason,
      subject,
      priority,
      timestamp: new Date().toISOString(),
    });

    return NextResponse.json({
      success: true,
      message: "Your message has been received. We'll get back to you soon.",
    });
  } catch (error) {
    console.error("Contact form error:", error);
    return NextResponse.json(
      { error: "Failed to process your message. Please try again or email us directly at support@meelni.com" },
      { status: 500 }
    );
  }
}
