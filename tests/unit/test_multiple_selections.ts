/**
 * Test 20 random behavioral question selections to see if any Product Sense questions sneak in
 */

import { getRandomRecentQuestion } from "../../lib/db/questions";

async function testMultipleSelections() {
  console.log("=== TESTING 20 RANDOM BEHAVIORAL QUESTION SELECTIONS ===\n");

  const QUESTION_TYPE_MAP: Record<string, string> = {
    behavioral: "Behavioral",
    product_sense: "Product Sense",
    execution: "Execution",
    strategy: "Product Strategy",
  };

  const roundType = "behavioral";
  const dbQuestionType = QUESTION_TYPE_MAP[roundType];
  let wrongTypeCount = 0;
  let productSenseCount = 0;

  for (let i = 1; i <= 20; i++) {
    const question = await getRandomRecentQuestion(365, dbQuestionType);

    if (!question) {
      console.log(`${i}. ❌ No question found`);
      continue;
    }

    const isCorrectType = question.questionType === "Behavioral";
    const isProductSense = question.questionType === "Product Sense";

    const status = isCorrectType ? "✅" : "❌";
    const warning = isProductSense ? " ⚠️  PRODUCT SENSE!" : "";

    console.log(
      `${i.toString().padStart(2, " ")}. ${status} ${question.questionType.padEnd(20, " ")} | ${question.company?.padEnd(10, " ") || "N/A".padEnd(10, " ")} | ${question.questionText.substring(0, 60)}...${warning}`
    );

    if (!isCorrectType) {
      wrongTypeCount++;
      if (isProductSense) {
        productSenseCount++;
      }
    }
  }

  console.log("\n" + "=".repeat(100));
  console.log("SUMMARY:");
  console.log(`  Total tests: 20`);
  console.log(`  Wrong type: ${wrongTypeCount}`);
  console.log(`  Product Sense questions: ${productSenseCount}`);

  if (productSenseCount > 0) {
    console.log("\n❌ BUG CONFIRMED: Product Sense questions are being returned for Behavioral interviews!");
  } else if (wrongTypeCount > 0) {
    console.log("\n⚠️  Some questions have wrong type, but not Product Sense.");
  } else {
    console.log("\n✅ All 20 selections returned correct Behavioral questions.");
  }

  process.exit(0);
}

testMultipleSelections().catch(console.error);
