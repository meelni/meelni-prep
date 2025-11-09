import { db } from "./lib/db";
import { interviewQuestion } from "./lib/db/schema";
import { eq, sql } from "drizzle-orm";

async function analyzeQuestions() {
  console.log("=== Question Type Distribution ===");

  // Get count by question type
  const distribution = await db
    .select({
      questionType: interviewQuestion.questionType,
      count: sql<number>`count(*)::int`
    })
    .from(interviewQuestion)
    .where(eq(interviewQuestion.isActive, true))
    .groupBy(interviewQuestion.questionType)
    .orderBy(interviewQuestion.questionType);

  console.table(distribution);

  console.log("\n=== Distinct Question Types ===");
  const distinct = await db
    .selectDistinct({ questionType: interviewQuestion.questionType })
    .from(interviewQuestion)
    .orderBy(interviewQuestion.questionType);

  distinct.forEach(row => console.log(`  - "${row.questionType}"`));

  // Sample behavioral questions
  console.log("\n=== Sample Behavioral Questions ===");
  const behavioral = await db
    .select({
      company: interviewQuestion.company,
      questionText: interviewQuestion.questionText,
      questionType: interviewQuestion.questionType,
    })
    .from(interviewQuestion)
    .where(eq(interviewQuestion.questionType, "Behavioral"))
    .limit(5);

  behavioral.forEach(q => {
    const preview = q.questionText.substring(0, 80);
    console.log(`  [${q.company}] ${preview}...`);
  });

  // Check if there are any questions with lowercase or different casing
  console.log("\n=== Checking for Casing Issues ===");
  const allTypes = await db
    .selectDistinct({ questionType: interviewQuestion.questionType })
    .from(interviewQuestion);

  const expected = ["Behavioral", "Product Sense", "Execution", "Product Strategy"];
  const actual = allTypes.map(t => t.questionType);

  console.log("Expected types:", expected);
  console.log("Actual types:", actual);

  const missing = expected.filter(t => !actual.includes(t));
  const extra = actual.filter(t => !expected.includes(t));

  if (missing.length > 0) {
    console.log("\n⚠️  Missing question types:", missing);
  }
  if (extra.length > 0) {
    console.log("\n⚠️  Extra question types (not in API mapping):", extra);
  }

  process.exit(0);
}

analyzeQuestions().catch(console.error);
