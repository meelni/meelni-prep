#!/usr/bin/env node
/**
 * Script to fix stuck feedback records (status='pending')
 * Run with: npx tsx scripts/fix-stuck-feedback.ts <sessionId>
 */

import { config } from "dotenv";
import { resolve } from "path";
import { existsSync } from "fs";

async function main() {
  // Load environment variables FIRST
  const workspaceEnv = resolve(process.cwd(), ".env.local");
  const parentEnv = resolve(process.cwd(), "../.env");

  if (existsSync(workspaceEnv)) {
    console.log("Loading env from:", workspaceEnv);
    config({ path: workspaceEnv });
  } else if (existsSync(parentEnv)) {
    console.log("Loading env from:", parentEnv);
    config({ path: parentEnv });
  } else {
    console.error("ERROR: No .env.local or .env file found");
    console.error("Checked:");
    console.error(`  - ${workspaceEnv}`);
    console.error(`  - ${parentEnv}`);
    process.exit(1);
  }

  // Verify DATABASE_URL is loaded
  if (!process.env.DATABASE_URL) {
    console.error("ERROR: DATABASE_URL not found in environment file");
    console.error("Please check your .env file contains DATABASE_URL");
    process.exit(1);
  }

  // Get sessionId from command line
  const sessionId = process.argv[2];

  if (!sessionId) {
    console.error("Usage: npx tsx scripts/fix-stuck-feedback.ts <sessionId>");
    process.exit(1);
  }

  // NOW dynamically import modules that need env vars
  const { db } = await import("../lib/db/index.js");
  const { feedback } = await import("../lib/db/schema.js");
  const { eq } = await import("drizzle-orm");
  const { inngest } = await import("../lib/inngest/client.js");

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

  console.log("Done");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Error:", err);
    process.exit(1);
  });
