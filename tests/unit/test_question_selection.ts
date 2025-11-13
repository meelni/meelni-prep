import { getRandomQuestion, getRandomRecentQuestion } from "../../lib/db/questions";

async function testQuestionSelection() {
  const QUESTION_TYPE_MAP: Record<string, string> = {
    behavioral: "Behavioral",
    product_sense: "Product Sense",
    execution: "Execution",
    strategy: "Product Strategy",
  };

  console.log("=== Testing Question Selection by Type ===\n");

  for (const [roundType, dbQuestionType] of Object.entries(QUESTION_TYPE_MAP)) {
    console.log(`\nTesting roundType="${roundType}" → dbQuestionType="${dbQuestionType}"`);
    console.log("─".repeat(80));

    // Test with recent days (365)
    const recentQuestion = await getRandomRecentQuestion(365, dbQuestionType);
    if (recentQuestion) {
      console.log(`✅ Recent question found (365 days):`);
      console.log(`   Company: ${recentQuestion.company}`);
      console.log(`   Type: ${recentQuestion.questionType}`);
      console.log(`   Text: ${recentQuestion.questionText.substring(0, 100)}...`);

      if (recentQuestion.questionType !== dbQuestionType) {
        console.log(`   ⚠️  WARNING: Expected "${dbQuestionType}" but got "${recentQuestion.questionType}"`);
      }
    } else {
      console.log(`❌ No recent question found for type "${dbQuestionType}"`);
    }

    // Test without date filter
    const anyQuestion = await getRandomQuestion(dbQuestionType);
    if (anyQuestion) {
      console.log(`✅ Random question found (no date filter):`);
      console.log(`   Company: ${anyQuestion.company}`);
      console.log(`   Type: ${anyQuestion.questionType}`);
      console.log(`   Text: ${anyQuestion.questionText.substring(0, 100)}...`);

      if (anyQuestion.questionType !== dbQuestionType) {
        console.log(`   ⚠️  WARNING: Expected "${dbQuestionType}" but got "${anyQuestion.questionType}"`);
      }
    } else {
      console.log(`❌ No question found for type "${dbQuestionType}"`);
    }
  }

  console.log("\n" + "=".repeat(80));
  console.log("Testing complete!");
  process.exit(0);
}

testQuestionSelection().catch(console.error);
