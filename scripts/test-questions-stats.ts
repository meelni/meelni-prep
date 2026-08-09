// Load environment variables from .env.local
import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(process.cwd(), ".env.local") });

import { db } from "@/lib/db";
import { interviewQuestion } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";

async function main() {
  console.log("\n📊 Question Bank Statistics\n");

  // Count by type
  const byType = await db
    .select({
      questionType: interviewQuestion.questionType,
      count: sql<number>`count(*)`,
    })
    .from(interviewQuestion)
    .where(eq(interviewQuestion.isActive, true))
    .groupBy(interviewQuestion.questionType)
    .orderBy(sql`count(*) DESC`);

  console.log("Questions by Type:");
  let total = 0;
  byType.forEach(({ questionType, count }) => {
    total += Number(count);
    console.log(
      `  ${questionType.padEnd(30)} ${count.toString().padStart(4)} questions`
    );
  });
  console.log(
    `  ${"TOTAL".padEnd(30)} ${total.toString().padStart(4)} questions\n`
  );

  // Sample questions
  console.log("Sample Questions:");
  const samples = await db
    .select({
      questionType: interviewQuestion.questionType,
      company: interviewQuestion.company,
      questionText: interviewQuestion.questionText,
    })
    .from(interviewQuestion)
    .where(eq(interviewQuestion.isActive, true))
    .limit(5);

  samples.forEach(({ questionType, company, questionText }) => {
    const preview =
      questionText.length > 60
        ? questionText.substring(0, 60) + "..."
        : questionText;
    console.log(`  [${questionType}] ${company}: ${preview}`);
  });

  process.exit(0);
}

main().catch(console.error);
