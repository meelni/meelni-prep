import { db } from "@/lib/db";
import { interviewQuestion } from "@/lib/db/schema";

const sampleQuestions = [
  {
    company: "Meta",
    questionText: "How would you improve Facebook Marketplace?",
    questionType: "Product Sense",
    difficulty: "Medium",
  },
  {
    company: "Google",
    questionText: "Design a product for people who want to learn a new language.",
    questionType: "Product design/strategy",
    difficulty: "Medium",
  },
  {
    company: "Amazon",
    questionText: "How would you measure the success of Amazon Prime?",
    questionType: "Product Sense",
    difficulty: "Hard",
  },
  {
    company: "Netflix",
    questionText: "Should Netflix add a live TV feature?",
    questionType: "Product Strategy",
    difficulty: "Hard",
  },
  {
    company: "Spotify",
    questionText: "How would you test whether adding a karaoke feature increases user engagement?",
    questionType: "A/B Testing",
    difficulty: "Medium",
  },
  {
    company: "Uber",
    questionText: "Design a feature to reduce rider cancellations.",
    questionType: "Product design/strategy",
    difficulty: "Medium",
  },
  {
    company: "Airbnb",
    questionText: "How would you prioritize features for the Airbnb host mobile app?",
    questionType: "Execution",
    difficulty: "Hard",
  },
  {
    company: "LinkedIn",
    questionText: "Tell me about a time you had to make a decision without complete information.",
    questionType: "Behavioral",
    difficulty: "Easy",
  },
  {
    company: "Microsoft",
    questionText: "How many searches happen on Bing per day?",
    questionType: "Estimation",
    difficulty: "Medium",
  },
  {
    company: "Apple",
    questionText: "How would you price a new Apple subscription service?",
    questionType: "Pricing",
    difficulty: "Hard",
  },
  {
    company: "Redfin",
    questionText: "What metrics would you track for a new home valuation feature?",
    questionType: "Product Sense",
    difficulty: "Medium",
  },
  {
    company: "Stripe",
    questionText: "How would you expand Stripe into a new international market?",
    questionType: "Product Strategy",
    difficulty: "Hard",
  },
  {
    company: "Slack",
    questionText: "Design a feature to help remote teams feel more connected.",
    questionType: "Product design/strategy",
    difficulty: "Medium",
  },
  {
    company: "DoorDash",
    questionText: "How would you test two different commission structures for restaurant partners?",
    questionType: "A/B Testing",
    difficulty: "Hard",
  },
  {
    company: "Twitter",
    questionText: "You need to ship a feature in 2 weeks but your team says it will take 4 weeks. What do you do?",
    questionType: "Execution",
    difficulty: "Medium",
  },
  {
    company: "Pinterest",
    questionText: "Describe a time when you influenced a team to adopt your product vision.",
    questionType: "Behavioral",
    difficulty: "Easy",
  },
  {
    company: "Dropbox",
    questionText: "How many files are stored in Dropbox worldwide?",
    questionType: "Estimation",
    difficulty: "Medium",
  },
  {
    company: "Instagram",
    questionText: "How would you monetize Instagram Reels?",
    questionType: "Pricing",
    difficulty: "Hard",
  },
  {
    company: null,
    questionText: "Design a product for elderly people to stay connected with their families.",
    questionType: "Product design/strategy",
    difficulty: "Medium",
  },
  {
    company: "Zoom",
    questionText: "What features would you build to make Zoom better for large webinars?",
    questionType: "Product Sense",
    difficulty: "Medium",
  },
];

async function seedQuestions() {
  try {
    console.log("🌱 Seeding interview questions...");

    const result = await db.insert(interviewQuestion).values(sampleQuestions);

    console.log(`✅ Successfully seeded ${sampleQuestions.length} questions!`);
    console.log("\n📊 Question breakdown:");

    // Count by type
    const typeCounts = sampleQuestions.reduce((acc, q) => {
      acc[q.questionType] = (acc[q.questionType] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    Object.entries(typeCounts).forEach(([type, count]) => {
      console.log(`   ${type}: ${count} questions`);
    });

    process.exit(0);
  } catch (error) {
    console.error("❌ Error seeding questions:", error);
    process.exit(1);
  }
}

seedQuestions();
