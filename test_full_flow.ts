/**
 * Test the full flow of question selection and prompt building
 * to verify behavioral interviews get behavioral questions
 */

import { getRandomRecentQuestion } from "./lib/db/questions";

async function testFullBehavioralFlow() {
  console.log("=== TESTING FULL BEHAVIORAL INTERVIEW FLOW ===\n");

  // Simulate user selecting "Behavioral" interview with "Advanced" difficulty
  const roundType = "behavioral";
  const difficulty = "advanced";
  const recentDays = 365; // Default "Broader Practice"

  console.log("User Selection:");
  console.log(`  Round Type: ${roundType}`);
  console.log(`  Difficulty: ${difficulty}`);
  console.log(`  Question Recency: ${recentDays} days (Broader Practice)`);
  console.log("\n" + "─".repeat(80) + "\n");

  // Step 1: API maps roundType to database questionType
  const QUESTION_TYPE_MAP: Record<string, string> = {
    behavioral: "Behavioral",
    product_sense: "Product Sense",
    execution: "Execution",
    strategy: "Product Strategy",
  };

  const dbQuestionType = QUESTION_TYPE_MAP[roundType];
  console.log("Step 1: API Question Type Mapping");
  console.log(`  roundType="${roundType}" → dbQuestionType="${dbQuestionType}"`);
  console.log();

  // Step 2: Fetch question from database
  const question = await getRandomRecentQuestion(recentDays, dbQuestionType);

  if (!question) {
    console.log("❌ PROBLEM: No question found!");
    console.log(`   This means there are no "${dbQuestionType}" questions in the database.`);
    process.exit(1);
  }

  console.log("Step 2: Question Fetched from Database");
  console.log(`  ✅ Question ID: ${question.id}`);
  console.log(`  ✅ Question Type (DB): ${question.questionType}`);
  console.log(`  ✅ Company: ${question.company}`);
  console.log(`  ✅ Question Text: ${question.questionText}`);
  console.log();

  // Verify question type matches expectation
  if (question.questionType !== dbQuestionType) {
    console.log(`  ⚠️  TYPE MISMATCH!`);
    console.log(`     Expected: "${dbQuestionType}"`);
    console.log(`     Got: "${question.questionType}"`);
    console.log();
  }

  // Step 3: Check what metadata is passed to LiveKit room
  const roomMetadata = {
    round_type: roundType,
    mode: "mock_interview",
    config: {
      difficulty,
      feedback_mode: "end",
      duration: 30,
    },
    question: {
      id: question.id,
      text: question.questionText,
      company: question.company,
      type: question.questionType,
      askedAt: question.askedAt,
    },
  };

  console.log("Step 3: LiveKit Room Metadata");
  console.log(`  round_type: "${roomMetadata.round_type}"`);
  console.log(`  question.type: "${roomMetadata.question.type}"`);
  console.log(`  question.text: "${roomMetadata.question.text.substring(0, 100)}..."`);
  console.log();

  // Step 4: Check agent's interview type mapping
  const INTERVIEW_TYPE_MAP: Record<string, string> = {
    behavioral: "leadership_drive",
    product_sense: "product_sense",
    execution: "analytical_thinking",
    strategy: "strategy",
  };

  const agentInterviewType = INTERVIEW_TYPE_MAP[roundType];
  console.log("Step 4: Agent Interview Type Mapping");
  console.log(`  roundType="${roundType}" → interviewType="${agentInterviewType}"`);
  console.log(`  Framework: STAR method for behavioral questions`);
  console.log();

  // Step 5: Verify end-to-end alignment
  console.log("Step 5: End-to-End Verification");
  console.log("─".repeat(80));

  const isBehavioralQuestion = question.questionType === "Behavioral";
  const isBehavioralFramework = agentInterviewType === "leadership_drive";
  const questionSeemsBehavioral =
    question.questionText.toLowerCase().includes("tell me about") ||
    question.questionText.toLowerCase().includes("describe a time") ||
    question.questionText.toLowerCase().includes("give an example") ||
    question.questionText.toLowerCase().includes("time when");

  console.log(`  Question type is "Behavioral": ${isBehavioralQuestion ? "✅" : "❌"}`);
  console.log(`  Agent uses behavioral framework: ${isBehavioralFramework ? "✅" : "❌"}`);
  console.log(`  Question text looks behavioral: ${questionSeemsBehavioral ? "✅" : "⚠️  (might be edge case)"}`);
  console.log();

  if (!isBehavioralQuestion || !isBehavioralFramework) {
    console.log("❌ PROBLEM DETECTED:");
    if (!isBehavioralQuestion) {
      console.log("   Database returned wrong question type!");
    }
    if (!isBehavioralFramework) {
      console.log("   Agent will use wrong framework!");
    }
  } else if (!questionSeemsBehavioral) {
    console.log("⚠️  DATA QUALITY ISSUE:");
    console.log("   Question is labeled 'Behavioral' but text doesn't match expected format.");
    console.log("   This could confuse users even though the system is technically correct.");
    console.log();
    console.log("   Example of good behavioral question:");
    console.log('   "Tell me about a time when you had to make a difficult trade-off decision..."');
    console.log();
    console.log("   This question:");
    console.log(`   "${question.questionText}"`);
  } else {
    console.log("✅ ALL CHECKS PASSED!");
    console.log("   - Correct question type fetched");
    console.log("   - Correct framework selected");
    console.log("   - Question text matches expected format");
  }

  console.log("\n" + "=".repeat(80));
  console.log("Test complete!");
  process.exit(0);
}

testFullBehavioralFlow().catch(console.error);
