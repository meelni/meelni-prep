/**
 * Comprehensive test of all interview type mappings
 * Tests all 4 interview types with multiple selections to ensure proper mapping
 */

import {
  getRandomRecentQuestion,
  getRandomQuestion,
} from "../../lib/db/questions";
import { db } from "../../lib/db";
import { interviewQuestion } from "../../lib/db/schema";
import { sql } from "drizzle-orm";

async function testAllInterviewTypes() {
  console.log("=== COMPREHENSIVE INTERVIEW TYPE MAPPING TEST ===\n");

  // API mapping from setup page
  const QUESTION_TYPE_MAP: Record<string, string> = {
    behavioral: "Behavioral",
    product_sense: "Product Sense",
    execution: "Execution",
    strategy: "Product Strategy",
  };

  console.log("Step 1: Check what question types exist in database\n");
  console.log("─".repeat(80));

  const allTypes = await db
    .select({
      questionType: interviewQuestion.questionType,
      count: sql<number>`count(*)::int`,
    })
    .from(interviewQuestion)
    .groupBy(interviewQuestion.questionType)
    .orderBy(interviewQuestion.questionType);

  console.log("Database Question Types:");
  allTypes.forEach((t) => {
    console.log(
      `  ${t.questionType.padEnd(30, " ")} | ${t.count.toString().padStart(5, " ")} questions`
    );
  });

  console.log("\n" + "=".repeat(80));
  console.log("\nStep 2: Check API mapping coverage\n");
  console.log("─".repeat(80));

  const mappedTypes = Object.values(QUESTION_TYPE_MAP);
  const dbTypes = allTypes.map((t) => t.questionType);

  console.log("API Maps These Types:");
  Object.entries(QUESTION_TYPE_MAP).forEach(([key, value]) => {
    const count = allTypes.find((t) => t.questionType === value)?.count || 0;
    const status = count > 0 ? "✅" : "❌";
    console.log(
      `  ${status} ${key.padEnd(20, " ")} → ${value.padEnd(30, " ")} (${count} questions)`
    );
  });

  console.log("\n⚠️  Types in Database NOT Mapped by API:");
  const unmappedTypes = dbTypes.filter((t) => !mappedTypes.includes(t));
  if (unmappedTypes.length === 0) {
    console.log("  ✅ None - all database types are mapped!");
  } else {
    unmappedTypes.forEach((type) => {
      const count = allTypes.find((t) => t.questionType === type)?.count || 0;
      console.log(
        `  ❌ ${type.padEnd(30, " ")} (${count} questions) - NOT ACCESSIBLE`
      );
    });
  }

  console.log("\n" + "=".repeat(80));
  console.log("\nStep 3: Test each interview type with 5 random selections\n");
  console.log("=".repeat(80));

  for (const [roundType, dbQuestionType] of Object.entries(QUESTION_TYPE_MAP)) {
    console.log(`\n🎯 Testing: ${roundType.toUpperCase()}`);
    console.log(`   API maps to: "${dbQuestionType}"`);
    console.log("─".repeat(80));

    let successCount = 0;
    let wrongTypeCount = 0;
    const wrongTypes: string[] = [];

    for (let i = 1; i <= 5; i++) {
      const question = await getRandomRecentQuestion(365, dbQuestionType);

      if (!question) {
        console.log(`   ${i}. ❌ No question found`);
        continue;
      }

      const isCorrect = question.questionType === dbQuestionType;
      const status = isCorrect ? "✅" : "❌";

      if (isCorrect) {
        successCount++;
      } else {
        wrongTypeCount++;
        if (!wrongTypes.includes(question.questionType)) {
          wrongTypes.push(question.questionType);
        }
      }

      console.log(
        `   ${i}. ${status} ${question.questionType.padEnd(25, " ")} | ${(question.company || "N/A").padEnd(12, " ")} | ${question.questionText.substring(0, 50)}...`
      );
    }

    console.log();
    if (wrongTypeCount > 0) {
      console.log(
        `   ⚠️  WARNING: ${wrongTypeCount}/5 selections returned wrong type!`
      );
      console.log(`   Wrong types returned: ${wrongTypes.join(", ")}`);
    } else {
      console.log(
        `   ✅ SUCCESS: 5/5 selections returned correct type "${dbQuestionType}"`
      );
    }
  }

  console.log("\n" + "=".repeat(80));
  console.log("\nStep 4: Mapping Recommendations\n");
  console.log("=".repeat(80));

  // Suggest additional mappings for unmapped types
  if (unmappedTypes.length > 0) {
    console.log(
      "\n⚠️  UNMAPPED QUESTION TYPES - Consider adding these mappings:\n"
    );

    const suggestions: Record<string, string> = {
      "Product design/strategy": "product_sense (alias)",
      "A/B Testing": "execution (alias for analytical)",
      Estimation: "execution (alias for analytical)",
      "Technical Strategy": "strategy (alias)",
      "Market Research": "execution (alias for analytical)",
      Pricing: "execution (alias for analytical)",
      Leadership: "behavioral (alias)",
      Prioritization: "execution (alias for analytical)",
    };

    unmappedTypes.forEach((type) => {
      const count = allTypes.find((t) => t.questionType === type)?.count || 0;
      const suggestion = suggestions[type] || "??? (needs manual review)";
      console.log(
        `   ${type.padEnd(30, " ")} (${count.toString().padStart(4, " ")} questions) → ${suggestion}`
      );
    });

    console.log("\n💡 RECOMMENDATION:");
    console.log(
      "   1. Update QUESTION_TYPE_MAP to support multiple database types per interview type"
    );
    console.log(
      "   2. OR normalize database question types to match the 4 main categories"
    );
    console.log("   3. OR add type aliases in the query function");
  } else {
    console.log("\n✅ All database question types are properly mapped!");
  }

  console.log("\n" + "=".repeat(80));
  console.log("Test complete!\n");
  process.exit(0);
}

testAllInterviewTypes().catch(console.error);
