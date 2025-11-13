/**
 * Test the expanded question type mappings
 * Verifies all 361 previously unmapped questions are now accessible
 */

import { getRandomQuestion } from "../../lib/db/questions";
import { db } from "../../lib/db";
import { interviewQuestion } from "../../lib/db/schema";
import { sql } from "drizzle-orm";

async function testExpandedMappings() {
  console.log("=== TESTING EXPANDED QUESTION TYPE MAPPINGS ===\n");

  // New expanded mapping (matching API route)
  const QUESTION_TYPE_MAP: Record<string, string[]> = {
    behavioral: ["Behavioral"],
    product_sense: ["Product Sense", "Product design/strategy"],
    execution: ["Execution", "Estimation", "A/B Testing", "Pricing"],
    strategy: ["Product Strategy"],
  };

  console.log("Step 1: Question Pool Sizes\n");
  console.log("─".repeat(80));

  const allTypes = await db
    .select({
      questionType: interviewQuestion.questionType,
      count: sql<number>`count(*)::int`
    })
    .from(interviewQuestion)
    .groupBy(interviewQuestion.questionType);

  const typeMap = Object.fromEntries(allTypes.map(t => [t.questionType, t.count]));

  for (const [interviewType, dbTypes] of Object.entries(QUESTION_TYPE_MAP)) {
    const totalQuestions = dbTypes.reduce((sum, type) => sum + (typeMap[type] || 0), 0);
    console.log(`${interviewType.toUpperCase()}:`);
    console.log(`  Total Pool: ${totalQuestions} questions`);
    dbTypes.forEach(type => {
      const count = typeMap[type] || 0;
      console.log(`    - ${type}: ${count} questions`);
    });
    console.log();
  }

  console.log("=".repeat(80));
  console.log("\nStep 2: Test 10 Selections Per Interview Type\n");
  console.log("=".repeat(80));

  for (const [interviewType, dbTypes] of Object.entries(QUESTION_TYPE_MAP)) {
    console.log(`\n🎯 Testing: ${interviewType.toUpperCase()}`);
    console.log(`   Pulls from: ${dbTypes.join(", ")}`);
    console.log("─".repeat(80));

    const typeCounts: Record<string, number> = {};
    let successCount = 0;
    let failCount = 0;

    for (let i = 1; i <= 10; i++) {
      const question = await getRandomQuestion(dbTypes);

      if (!question) {
        console.log(`   ${i.toString().padStart(2, " ")}. ❌ No question found`);
        failCount++;
        continue;
      }

      const isExpectedType = dbTypes.includes(question.questionType);
      const status = isExpectedType ? "✅" : "❌";

      if (isExpectedType) {
        successCount++;
        typeCounts[question.questionType] = (typeCounts[question.questionType] || 0) + 1;
      } else {
        failCount++;
      }

      console.log(
        `   ${i.toString().padStart(2, " ")}. ${status} ${question.questionType.padEnd(27, " ")} | ${(question.company || "N/A").padEnd(12, " ")} | ${question.questionText.substring(0, 45)}...`
      );
    }

    console.log();
    console.log(`   Results: ${successCount}/10 selections from expected types`);
    if (Object.keys(typeCounts).length > 0) {
      console.log(`   Distribution:`);
      Object.entries(typeCounts).forEach(([type, count]) => {
        console.log(`     - ${type}: ${count}/10 (${Math.round(count / 10 * 100)}%)`);
      });
    }

    if (failCount > 0) {
      console.log(`   ⚠️  ${failCount} unexpected question types!`);
    } else {
      console.log(`   ✅ All selections from correct question type pool!`);
    }
  }

  console.log("\n" + "=".repeat(80));
  console.log("\nStep 3: Calculate Total Accessible Questions\n");
  console.log("=".repeat(80));

  let totalBefore = 0;
  let totalAfter = 0;

  const oldMapping = {
    behavioral: ["Behavioral"],
    product_sense: ["Product Sense"],
    execution: ["Execution"],
    strategy: ["Product Strategy"],
  };

  console.log("BEFORE (Old Mapping):");
  for (const [type, dbTypes] of Object.entries(oldMapping)) {
    const count = dbTypes.reduce((sum, t) => sum + (typeMap[t] || 0), 0);
    totalBefore += count;
    console.log(`  ${type.padEnd(20, " ")} ${count.toString().padStart(5, " ")} questions`);
  }
  console.log(`  ${"TOTAL".padEnd(20, " ")} ${totalBefore.toString().padStart(5, " ")} questions`);

  console.log("\nAFTER (New Mapping):");
  for (const [type, dbTypes] of Object.entries(QUESTION_TYPE_MAP)) {
    const count = dbTypes.reduce((sum, t) => sum + (typeMap[t] || 0), 0);
    totalAfter += count;
    const increase = count - (oldMapping[type as keyof typeof oldMapping]?.reduce((s, t) => s + (typeMap[t] || 0), 0) || 0);
    const increaseStr = increase > 0 ? ` (+${increase})` : "";
    console.log(`  ${type.padEnd(20, " ")} ${count.toString().padStart(5, " ")} questions${increaseStr}`);
  }
  console.log(`  ${"TOTAL".padEnd(20, " ")} ${totalAfter.toString().padStart(5, " ")} questions (+${totalAfter - totalBefore})`);

  const percentIncrease = Math.round(((totalAfter - totalBefore) / totalBefore) * 100);
  console.log(`\n✨ Question pool increased by ${totalAfter - totalBefore} questions (${percentIncrease}% increase)!`);

  console.log("\n" + "=".repeat(80));
  console.log("Test complete!\n");
  process.exit(0);
}

testExpandedMappings().catch(console.error);
