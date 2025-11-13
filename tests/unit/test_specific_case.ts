import { getRandomRecentQuestion } from "../../lib/db/questions";

async function testSpecificCase() {
  console.log("=== Testing Specific User Scenario ===");
  console.log("Setup: Behavioral interview, Advanced difficulty\n");

  // Simulate the exact API call that would happen
  const roundType = "behavioral";
  const QUESTION_TYPE_MAP: Record<string, string> = {
    behavioral: "Behavioral",
    product_sense: "Product Sense",
    execution: "Execution",
    strategy: "Product Strategy",
  };

  const dbQuestionType = QUESTION_TYPE_MAP[roundType];
  console.log(`roundType: "${roundType}"`);
  console.log(`dbQuestionType (from mapping): "${dbQuestionType}"\n`);

  // Test with different recency settings
  const recencySettings = [
    { days: 90, label: "Current Trends (90 days)" },
    { days: 365, label: "Broader Practice (365 days)" },
    { days: undefined, label: "All Questions (no filter)" },
  ];

  for (const setting of recencySettings) {
    console.log(`\nTesting: ${setting.label}`);
    console.log("─".repeat(80));

    const question = setting.days
      ? await getRandomRecentQuestion(setting.days, dbQuestionType)
      : await getRandomRecentQuestion(365, dbQuestionType);

    if (!question) {
      console.log(`❌ No question found`);
      continue;
    }

    console.log(`✅ Question selected:`);
    console.log(`   ID: ${question.id}`);
    console.log(`   Company: ${question.company}`);
    console.log(`   Type: ${question.questionType}`);
    console.log(`   Asked: ${question.askedAt}`);
    console.log(`   Text: ${question.questionText.substring(0, 150)}...`);

    // Check if it's truly behavioral
    const isBehavioral = question.questionText.toLowerCase().includes("tell me about") ||
                        question.questionText.toLowerCase().includes("describe a time") ||
                        question.questionText.toLowerCase().includes("give me an example");

    if (question.questionType !== dbQuestionType) {
      console.log(`\n   ⚠️  TYPE MISMATCH!`);
      console.log(`   Expected: "${dbQuestionType}"`);
      console.log(`   Got: "${question.questionType}"`);
    }

    if (!isBehavioral && question.questionType === "Behavioral") {
      console.log(`\n   ⚠️  QUESTION DOESN'T SEEM BEHAVIORAL!`);
      console.log(`   Full text: ${question.questionText}`);
    }
  }

  console.log("\n" + "=".repeat(80));
  console.log("Test complete!");
  process.exit(0);
}

testSpecificCase().catch(console.error);
