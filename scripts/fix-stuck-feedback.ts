/**
 * Script to fix stuck feedback records (status='pending')
 * Run with: npx tsx scripts/fix-stuck-feedback.ts <sessionId>
 */

import { config } from "dotenv";
import { resolve } from "path";
import { existsSync } from "fs";

// Load environment variables from .env.local
// Try workspace directory first, then parent directory
const workspaceEnv = resolve(process.cwd(), ".env.local");
const parentEnv = resolve(process.cwd(), "../.env");

if (existsSync(workspaceEnv)) {
  config({ path: workspaceEnv });
} else if (existsSync(parentEnv)) {
  config({ path: parentEnv });
} else {
  console.error("ERROR: No .env.local or .env file found");
  console.error("Checked:");
  console.error(`  - ${workspaceEnv}`);
  console.error(`  - ${parentEnv}`);
  process.exit(1);
}

import { db } from "../lib/db";
import { feedback } from "../lib/db/schema";
import { eq } from "drizzle-orm";
import { inngest } from "../lib/inngest/client";

async function fixStuckFeedback(sessionId: string) {
  console.log(`Fixing stuck feedback for session: ${sessionId}`);

  // Check if feedback exists
  const feedbackRecord = await db.query.feedback.findFirst({
    where: eq(feedback.sessionId, sessionId),
  });

  if (!feedbackRecord) {
    console.error(`No feedback record found for session ${sessionId}`);
    process.exit(1);
  }

  console.log(`Current status: ${feedbackRecord.status}`);

  if (feedbackRecord.status === "pending") {
    console.log("Retrying Inngest event...");

    // Manually send the Inngest event again
    await inngest.send({
      name: "feedback/generate.requested",
      data: {
        sessionId: sessionId,
        userId: "user-id", // Will be fetched from session by worker
        tier: "full",
      },
    });

    console.log("✓ Inngest event sent successfully");
  } else {
    console.log(`Feedback status is ${feedbackRecord.status}, no action needed`);
  }
}

// Get sessionId from command line
const sessionId = process.argv[2];

if (!sessionId) {
  console.error("Usage: npx tsx scripts/fix-stuck-feedback.ts <sessionId>");
  process.exit(1);
}

fixStuckFeedback(sessionId)
  .then(() => {
    console.log("Done");
    process.exit(0);
  })
  .catch((err) => {
    console.error("Error:", err);
    process.exit(1);
  });
