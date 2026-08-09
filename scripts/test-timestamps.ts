// Load environment variables from .env.local
import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(process.cwd(), ".env.local") });

import { db } from "@/lib/db";
import { interviewQuestion } from "@/lib/db/schema";
import { sql } from "drizzle-orm";

async function testTimestamps() {
  console.log("\n📊 Testing Timestamp Import\n");

  // Check questions with timestamps
  const withTimestamp = await db
    .select({
      count: sql<number>`count(*)`,
    })
    .from(interviewQuestion)
    .where(sql`${interviewQuestion.askedAt} IS NOT NULL`);

  // Check questions without timestamps
  const withoutTimestamp = await db
    .select({
      count: sql<number>`count(*)`,
    })
    .from(interviewQuestion)
    .where(sql`${interviewQuestion.askedAt} IS NULL`);

  console.log("Timestamp Coverage:");
  console.log(`  ✅ With timestamp:    ${withTimestamp[0].count} questions`);
  console.log(
    `  ⚠️  Without timestamp: ${withoutTimestamp[0].count} questions\n`
  );

  // Show sample questions with timestamps
  const samples = await db
    .select({
      company: interviewQuestion.company,
      questionText: interviewQuestion.questionText,
      questionType: interviewQuestion.questionType,
      askedAt: interviewQuestion.askedAt,
    })
    .from(interviewQuestion)
    .where(sql`${interviewQuestion.askedAt} IS NOT NULL`)
    .orderBy(interviewQuestion.askedAt)
    .limit(5);

  console.log("Oldest 5 Questions:");
  samples.forEach(({ company, questionText, questionType, askedAt }) => {
    const preview =
      questionText.length > 50
        ? questionText.substring(0, 50) + "..."
        : questionText;
    const dateStr = askedAt
      ? new Date(askedAt).toLocaleDateString()
      : "No date";
    console.log(`  ${dateStr} - [${questionType}] ${company}: ${preview}`);
  });

  // Show newest questions
  const newest = await db
    .select({
      company: interviewQuestion.company,
      questionText: interviewQuestion.questionText,
      questionType: interviewQuestion.questionType,
      askedAt: interviewQuestion.askedAt,
    })
    .from(interviewQuestion)
    .where(sql`${interviewQuestion.askedAt} IS NOT NULL`)
    .orderBy(sql`${interviewQuestion.askedAt} DESC`)
    .limit(5);

  console.log("\nNewest 5 Questions:");
  newest.forEach(({ company, questionText, questionType, askedAt }) => {
    const preview =
      questionText.length > 50
        ? questionText.substring(0, 50) + "..."
        : questionText;
    const dateStr = askedAt
      ? new Date(askedAt).toLocaleDateString()
      : "No date";
    console.log(`  ${dateStr} - [${questionType}] ${company}: ${preview}`);
  });

  process.exit(0);
}

testTimestamps().catch(console.error);
