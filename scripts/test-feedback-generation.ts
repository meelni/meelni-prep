#!/usr/bin/env tsx
/**
 * Test Feedback Generation Script
 *
 * Creates a fake interview session with transcript data and triggers
 * feedback generation to test the complete flow without doing a real interview.
 *
 * Usage: npm run test:feedback
 * (Environment variables loaded automatically via tsx --env-file flag)
 */

import { db } from "../lib/db";
import { interviewSession, transcriptTurn, feedback } from "../lib/db/schema";
import { inngest } from "../lib/inngest/client";
import { eq } from "drizzle-orm";

// Fake transcript data (realistic product sense interview)
const FAKE_TRANSCRIPT = [
  {
    speaker: "interviewer" as const,
    text: "Hi! Let's start with a product sense question. How would you improve Google Maps for tourists visiting a new city?",
    duration: 8000,
  },
  {
    speaker: "user" as const,
    text: "Great question! Let me start by clarifying the user segment. When you say tourists, are we talking about international travelers or domestic tourists? And what type of cities - major metros or smaller tourist destinations?",
    duration: 12000,
  },
  {
    speaker: "interviewer" as const,
    text: "Good clarification! Let's focus on international travelers visiting major tourist cities like Paris, Tokyo, or New York.",
    duration: 6000,
  },
  {
    speaker: "user" as const,
    text: "Perfect. So for international tourists in major cities, I see a few key pain points. First, language barriers - even with translation, understanding local transit or reading menus is challenging. Second, tourists often don't know the 'hidden gems' that locals love. Third, they're worried about safety and scams in unfamiliar areas. And fourth, they struggle with offline access when roaming data is expensive.",
    duration: 20000,
  },
  {
    speaker: "interviewer" as const,
    text: "Those are solid pain points. Which one would you prioritize and why?",
    duration: 5000,
  },
  {
    speaker: "user" as const,
    text: "I'd prioritize the 'local discovery' problem - helping tourists find authentic, local experiences. Here's my reasoning: the language and offline issues are already being addressed by Google Translate integration and offline maps. Safety concerns are important but harder to solve at scale. But local discovery is both high-impact and achievable. The goal would be to help tourists experience a city like a local, not just hit the typical tourist traps.",
    duration: 25000,
  },
  {
    speaker: "interviewer" as const,
    text: "Interesting choice. What would your solution look like?",
    duration: 4000,
  },
  {
    speaker: "user" as const,
    text: "I'd build a 'Local Guide Mode' feature. When you open Maps in a new city, it detects you're a tourist based on location history and offers to enable this mode. The core experience would include three things: First, a curated 'Local Favorites' layer showing where residents actually eat, shop, and hang out - powered by analyzing location data from locals. Second, contextual micro-recommendations - like if you're near a bakery at 7am, suggest trying their fresh croissants which is what locals do. Third, neighborhood insights - quick cultural tips like 'this is the artist district' or 'locals eat dinner here around 9pm'.",
    duration: 35000,
  },
  {
    speaker: "interviewer" as const,
    text: "How would you measure success for this feature?",
    duration: 4000,
  },
  {
    speaker: "user" as const,
    text: "I'd focus on three key metrics. Primary metric: engagement rate - what percentage of tourists who enable Local Guide Mode interact with local recommendations. Target would be 60% engagement. Secondary metric: time spent exploring - we want tourists spending more time in recommended local spots versus just tourist attractions. I'd measure average session duration in 'local' areas. Third metric: satisfaction - post-trip NPS survey asking if Maps helped them discover authentic local experiences. I'd also track a counter-metric: ensuring we're not overwhelming users with too many suggestions, measured by feature disable rate.",
    duration: 35000,
  },
  {
    speaker: "interviewer" as const,
    text: "What risks or concerns would you consider before launching?",
    duration: 5000,
  },
  {
    speaker: "user" as const,
    text: "Three main risks. First, data quality - we need to ensure the 'local favorites' are actually places locals love, not just popular spots with tourists. We'd need strong signals like revisit rates and time of day patterns. Second, cultural sensitivity - what's considered a 'local experience' varies by culture, and we need to avoid stereotyping or misrepresenting neighborhoods. We'd need local reviewers in each market. Third, business impact - local businesses might not be equipped for tourist influx, and we don't want to ruin authentic spots by overexposing them. We'd need to partner with businesses and potentially throttle visibility.",
    duration: 40000,
  },
  {
    speaker: "interviewer" as const,
    text: "Great thinking! That covers the main points I wanted to discuss. Any questions for me?",
    duration: 6000,
  },
  {
    speaker: "user" as const,
    text: "Yes, actually! I'm curious - when you're evaluating product sense answers, what separates a good answer from a great one?",
    duration: 8000,
  },
];

async function main() {
  console.log("🧪 Testing Feedback Generation Flow\n");

  // Get a test user (assumes you have at least one user in the database)
  console.log("1️⃣  Finding test user...");
  const users = await db.query.appUser.findMany({ limit: 1 });
  
  if (users.length === 0) {
    console.error("❌ No users found in database. Please sign up first.");
    process.exit(1);
  }

  const userId = users[0].id;
  console.log(`✅ Using user: ${userId}\n`);

  // Create fake interview session
  console.log("2️⃣  Creating fake interview session...");
  const [session] = await db
    .insert(interviewSession)
    .values({
      userId: userId,
      roundType: "product_sense",
      mode: "voice_video",
      startedAt: new Date(Date.now() - 15 * 60 * 1000), // Started 15 min ago
      config: {
        voice: "tessa",
        difficulty: "intermediate",
      },
    })
    .returning();

  console.log(`✅ Session created: ${session.id}\n`);

  // Insert transcript turns
  console.log("3️⃣  Inserting transcript turns...");
  let currentTime = new Date(session.startedAt!);

  for (const turn of FAKE_TRANSCRIPT) {
    const startedAt = new Date(currentTime);
    const endedAt = new Date(currentTime.getTime() + turn.duration);

    await db.insert(transcriptTurn).values({
      sessionId: session.id,
      speaker: turn.speaker,
      text: turn.text,
      startedAt,
      endedAt,
      audioMs: turn.duration,
    });

    currentTime = endedAt;
  }

  console.log(`✅ Inserted ${FAKE_TRANSCRIPT.length} transcript turns\n`);

  // Update session as ended
  console.log("4️⃣  Ending session...");
  await db
    .update(interviewSession)
    .set({
      endedAt: new Date(),
      status: "completed",
      totalTurns: FAKE_TRANSCRIPT.length,
      durationSeconds: Math.floor((currentTime.getTime() - new Date(session.startedAt!).getTime()) / 1000),
    })
    .where(eq(interviewSession.id, session.id));

  console.log(`✅ Session ended\n`);

  // Create pending feedback record
  console.log("5️⃣  Creating pending feedback record...");
  const [feedbackRecord] = await db
    .insert(feedback)
    .values({
      sessionId: session.id,
      status: "pending",
      rubricVersion: "1.0.0",
    })
    .returning();

  console.log(`✅ Feedback record created: ${feedbackRecord.id}\n`);

  // Trigger Inngest event
  console.log("6️⃣  Triggering feedback generation event...");
  await inngest.send({
    name: "feedback/generate.requested",
    data: {
      sessionId: session.id,
      userId: userId,
      tier: "full",
    },
  });

  console.log(`✅ Event sent to Inngest!\n`);

  console.log("🎉 Test Complete!\n");
  console.log("Next steps:");
  console.log(`1. Check Inngest Dev Server (http://localhost:8288) for function execution`);
  console.log(`2. Watch the terminal for logs`);
  console.log(`3. Check feedback status: GET /api/feedback/${session.id}`);
  console.log(`4. View feedback page: http://localhost:3000/feedback/${session.id}\n`);
  console.log(`Session ID: ${session.id}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Error:", error);
    process.exit(1);
  });
