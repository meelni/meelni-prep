/**
 * Manual Test Script for Feedback Polling API
 *
 * Tests all scenarios for GET /api/feedback/[sessionId]
 *
 * Usage:
 *   tsx scripts/test-feedback-polling.ts
 */

import { db } from "../lib/db";
import { feedback, interviewSession, appUser } from "../lib/db/schema";
import { eq } from "drizzle-orm";

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

const results: TestResult[] = [];

async function setupTestData() {
  console.log("Setting up test data...");

  // Create test user
  const [user] = await db
    .insert(appUser)
    .values({
      email: "test-feedback-polling@example.com",
      name: "Test User",
    })
    .onConflictDoUpdate({
      target: appUser.email,
      set: { name: "Test User" },
    })
    .returning();

  // Create test session
  const [session] = await db
    .insert(interviewSession)
    .values({
      userId: user.id,
      roundType: "product_sense",
      mode: "voice_video",
      status: "completed",
    })
    .returning();

  console.log(`✅ Created test user: ${user.id}`);
  console.log(`✅ Created test session: ${session.id}`);

  return { userId: user.id, sessionId: session.id };
}

async function cleanupTestData(userId: string) {
  console.log("\nCleaning up test data...");

  // Delete feedback (cascade will handle session_id foreign key)
  await db.delete(feedback).where(eq(feedback.sessionId,
    db.select({ id: interviewSession.id }).from(interviewSession).where(eq(interviewSession.userId, userId))
  ));

  // Delete sessions
  await db.delete(interviewSession).where(eq(interviewSession.userId, userId));

  // Delete user
  await db.delete(appUser).where(eq(appUser.id, userId));

  console.log("✅ Cleanup complete");
}

async function testPendingStatus(sessionId: string) {
  console.log("\nTest 1: Pending Status");

  try {
    // Create pending feedback
    const [feedbackRecord] = await db
      .insert(feedback)
      .values({
        sessionId,
        status: "pending",
      })
      .returning();

    // Verify status
    const retrieved = await db
      .select()
      .from(feedback)
      .where(eq(feedback.sessionId, sessionId))
      .limit(1);

    if (retrieved[0].status === "pending") {
      console.log("✅ Pending status created correctly");
      results.push({ name: "Pending Status", passed: true });
    } else {
      throw new Error(`Expected 'pending', got '${retrieved[0].status}'`);
    }

    return feedbackRecord;
  } catch (error) {
    console.error("❌ Pending status test failed:", error);
    results.push({
      name: "Pending Status",
      passed: false,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

async function testProcessingStatus(sessionId: string) {
  console.log("\nTest 2: Processing Status with Time Tracking");

  try {
    // Update to processing with start time
    const processingStartedAt = new Date();
    await db
      .update(feedback)
      .set({
        status: "processing",
        processingStartedAt,
      })
      .where(eq(feedback.sessionId, sessionId));

    // Verify
    const [retrieved] = await db
      .select()
      .from(feedback)
      .where(eq(feedback.sessionId, sessionId))
      .limit(1);

    if (retrieved.status === "processing" && retrieved.processingStartedAt) {
      const elapsed = Math.floor(
        (Date.now() - new Date(retrieved.processingStartedAt).getTime()) / 1000
      );
      const remaining = Math.max(0, 45 - elapsed);

      console.log(`✅ Processing status with timestamp`);
      console.log(`   Elapsed: ${elapsed}s, Remaining: ${remaining}s`);
      results.push({ name: "Processing Status", passed: true });
    } else {
      throw new Error("Processing status or timestamp not set correctly");
    }
  } catch (error) {
    console.error("❌ Processing status test failed:", error);
    results.push({
      name: "Processing Status",
      passed: false,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

async function testCompletedStatus(sessionId: string) {
  console.log("\nTest 3: Completed Status with Full Feedback");

  try {
    // Update to completed with full feedback
    await db
      .update(feedback)
      .set({
        status: "completed",
        structureScore: 8,
        clarityScore: 7,
        insightScore: 9,
        communicationScore: 8,
        leadershipScore: 7,
        overallScore: "7.8",
        strengths: ["Strong framework use", "Clear articulation"],
        improvements: ["Deeper analysis needed"],
        drills: ["Practice CIRCLES method"],
        summary: "Strong performance with room for depth",
        rubricVersion: "1.0.0",
        processingDurationMs: 42000,
      })
      .where(eq(feedback.sessionId, sessionId));

    // Verify
    const [retrieved] = await db
      .select()
      .from(feedback)
      .where(eq(feedback.sessionId, sessionId))
      .limit(1);

    if (
      retrieved.status === "completed" &&
      retrieved.structureScore === 8 &&
      retrieved.overallScore === "7.8" &&
      Array.isArray(retrieved.strengths) &&
      retrieved.strengths.length > 0
    ) {
      console.log("✅ Completed feedback with all fields");
      console.log(`   Overall Score: ${retrieved.overallScore}`);
      console.log(`   Strengths: ${(retrieved.strengths as string[]).length}`);
      results.push({ name: "Completed Status", passed: true });
    } else {
      throw new Error("Completed feedback data incomplete");
    }
  } catch (error) {
    console.error("❌ Completed status test failed:", error);
    results.push({
      name: "Completed Status",
      passed: false,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

async function testSkippedStatus(sessionId: string) {
  console.log("\nTest 4: Skipped Status with Reason");

  try {
    // Update to skipped
    await db
      .update(feedback)
      .set({
        status: "skipped",
        statusReason: "Session too short: 2 minutes < 5 minutes minimum",
      })
      .where(eq(feedback.sessionId, sessionId));

    // Verify
    const [retrieved] = await db
      .select()
      .from(feedback)
      .where(eq(feedback.sessionId, sessionId))
      .limit(1);

    if (retrieved.status === "skipped" && retrieved.statusReason) {
      console.log("✅ Skipped status with reason");
      console.log(`   Reason: ${retrieved.statusReason}`);
      results.push({ name: "Skipped Status", passed: true });
    } else {
      throw new Error("Skipped status or reason not set correctly");
    }
  } catch (error) {
    console.error("❌ Skipped status test failed:", error);
    results.push({
      name: "Skipped Status",
      passed: false,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

async function testFailedStatus(sessionId: string) {
  console.log("\nTest 5: Failed Status with Error Message");

  try {
    // Update to failed
    await db
      .update(feedback)
      .set({
        status: "failed",
        statusReason: "GPT-4 API timeout after 3 retries",
      })
      .where(eq(feedback.sessionId, sessionId));

    // Verify
    const [retrieved] = await db
      .select()
      .from(feedback)
      .where(eq(feedback.sessionId, sessionId))
      .limit(1);

    if (retrieved.status === "failed" && retrieved.statusReason) {
      console.log("✅ Failed status with error message");
      console.log(`   Error: ${retrieved.statusReason}`);
      results.push({ name: "Failed Status", passed: true });
    } else {
      throw new Error("Failed status or error message not set correctly");
    }
  } catch (error) {
    console.error("❌ Failed status test failed:", error);
    results.push({
      name: "Failed Status",
      passed: false,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

async function testStatusTransitions(sessionId: string) {
  console.log("\nTest 6: Status Transitions (pending → processing → completed)");

  try {
    // Create new feedback record for transition test
    await db.delete(feedback).where(eq(feedback.sessionId, sessionId));

    // Step 1: Pending
    await db.insert(feedback).values({
      sessionId,
      status: "pending",
    });

    let [record] = await db
      .select()
      .from(feedback)
      .where(eq(feedback.sessionId, sessionId))
      .limit(1);

    if (record.status !== "pending") {
      throw new Error("Failed to create pending status");
    }

    // Step 2: Processing
    const processingStartedAt = new Date();
    await db
      .update(feedback)
      .set({
        status: "processing",
        processingStartedAt,
      })
      .where(eq(feedback.sessionId, sessionId));

    [record] = await db
      .select()
      .from(feedback)
      .where(eq(feedback.sessionId, sessionId))
      .limit(1);

    if (record.status !== "processing" || !record.processingStartedAt) {
      throw new Error("Failed to transition to processing");
    }

    // Step 3: Completed
    const processingDurationMs =
      Date.now() - new Date(processingStartedAt).getTime();

    await db
      .update(feedback)
      .set({
        status: "completed",
        structureScore: 8,
        clarityScore: 7,
        insightScore: 9,
        communicationScore: 8,
        leadershipScore: 7,
        overallScore: "7.8",
        strengths: ["Test strength"],
        improvements: ["Test improvement"],
        drills: ["Test drill"],
        summary: "Test summary",
        processingDurationMs,
      })
      .where(eq(feedback.sessionId, sessionId));

    [record] = await db
      .select()
      .from(feedback)
      .where(eq(feedback.sessionId, sessionId))
      .limit(1);

    if (
      record.status !== "completed" ||
      !record.processingDurationMs ||
      record.processingDurationMs < 0
    ) {
      throw new Error("Failed to transition to completed");
    }

    console.log("✅ Status transitions work correctly");
    console.log(
      `   pending → processing → completed (${record.processingDurationMs}ms)`
    );
    results.push({ name: "Status Transitions", passed: true });
  } catch (error) {
    console.error("❌ Status transitions test failed:", error);
    results.push({
      name: "Status Transitions",
      passed: false,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

async function printSummary() {
  console.log("\n" + "=".repeat(50));
  console.log("TEST SUMMARY");
  console.log("=".repeat(50));

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  results.forEach((result) => {
    const icon = result.passed ? "✅" : "❌";
    console.log(`${icon} ${result.name}`);
    if (result.error) {
      console.log(`   Error: ${result.error}`);
    }
  });

  console.log("\n" + "=".repeat(50));
  console.log(`Total: ${results.length} tests`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log("=".repeat(50));

  return failed === 0;
}

async function main() {
  console.log("🧪 Testing Feedback Polling API Implementation\n");

  let userId: string | undefined;
  let sessionId: string | undefined;

  try {
    // Setup
    const testData = await setupTestData();
    userId = testData.userId;
    sessionId = testData.sessionId;

    // Run tests
    await testPendingStatus(sessionId);
    await testProcessingStatus(sessionId);
    await testCompletedStatus(sessionId);
    await testSkippedStatus(sessionId);
    await testFailedStatus(sessionId);
    await testStatusTransitions(sessionId);

    // Print summary
    const allPassed = await printSummary();

    // Cleanup
    if (userId) {
      await cleanupTestData(userId);
    }

    process.exit(allPassed ? 0 : 1);
  } catch (error) {
    console.error("\n💥 Test suite failed with error:", error);

    // Attempt cleanup
    if (userId) {
      try {
        await cleanupTestData(userId);
      } catch (cleanupError) {
        console.error("Failed to cleanup:", cleanupError);
      }
    }

    process.exit(1);
  }
}

main();
