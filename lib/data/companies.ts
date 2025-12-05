// Company interview process data
// This file contains structured data for company PM interview guides

export interface InterviewStage {
  name: string;
  duration?: string;
  description: string;
}

export interface QuestionCategory {
  category: string;
  questions: string[];
}

export interface InterviewTip {
  title: string;
  description: string;
}

export interface SalaryLevel {
  level: string;
  baseSalary: string;
  totalComp: string;
}

export interface Company {
  slug: string;
  name: string;
  logo?: string;
  industry: string;
  description: string;
  interviewDuration: string;
  interviewRounds: number;
  difficulty: "Easy" | "Medium" | "Hard" | "Very Hard";

  // Role overview
  roleOverview: {
    description: string;
    skills: string[];
  };

  // Salary data
  salaryLevels?: SalaryLevel[];
  salaryNote?: string;

  // Interview process
  interviewStages: InterviewStage[];

  // Question types/categories
  questionCategories: QuestionCategory[];

  // Tips for interviewing
  interviewTips: InterviewTip[];

  // Preparation resources (internal links)
  preparationSteps: string[];
}

export const companies: Company[] = [
  {
    slug: "coinbase",
    name: "Coinbase",
    industry: "Cryptocurrency / Fintech",
    description: "Product manager interviews at Coinbase are extremely competitive. You'll face in-depth and challenging questions over the course of at least seven different interview rounds.",
    interviewDuration: "8-10 weeks",
    interviewRounds: 7,
    difficulty: "Very Hard",

    roleOverview: {
      description: "As a Coinbase Product Manager, you will be in charge of the product roadmap for the company's next generation of cryptocurrency products and experiences. Coinbase often assigns the Product Manager as the \"Directly Responsible Individual\" (DRI) for outcomes affecting their users, empowering the PM to act like a \"mini CEO\" for their product. One thing that makes Coinbase unique is that it's a major player in a very new industry. That means you'll need to be learning all the time and pivoting on the fly as the industry evolves.",
      skills: [
        "Technical, business, and interpersonal skills",
        "Strategic and analytical thinking",
        "Strong user-centric focus",
        "Market awareness and problem-solving",
        "Leadership and cross-functional collaboration",
        "Strong communication and adaptability",
        "Comfort navigating high levels of ambiguity",
        "Understanding of technical aspects of cryptocurrencies",
        "Ability to evaluate broad trade-offs at scale"
      ]
    },

    salaryLevels: [
      { level: "Associate Product Manager (IC3)", baseSalary: "$146,000", totalComp: "$204,000" },
      { level: "Product Manager I (IC4)", baseSalary: "$158,000", totalComp: "$233,000" },
      { level: "Product Manager II (IC5)", baseSalary: "$205,000", totalComp: "$418,000" },
      { level: "Senior Product Manager (IC6)", baseSalary: "$230,000", totalComp: "$504,000" },
      { level: "Group Product Manager (IC7)", baseSalary: "$276,000", totalComp: "$793,000" }
    ],
    salaryNote: "Total compensation includes stocks and bonuses on top of base salary. As of 2021, Coinbase eliminated salary and equity negotiations from the hiring process—all employees in the same position, in the same location, receive the same salary and equity offer.",

    interviewStages: [
      {
        name: "Application Review",
        description: "Recruiters assess if your experience matches the open position. High-impact work and experience at fast-paced, high-pressure companies similar to Coinbase will give you an edge. Approximately 5% of applications progress beyond this stage."
      },
      {
        name: "Recruiter Phone Screen",
        duration: "30-45 min",
        description: "A call with a recruiter to confirm you've got a chance of getting the job. Be prepared to explain your background and why you're a good fit at Coinbase. Share your product experience and enthusiasm for cryptocurrency. Expect questions like \"Why Coinbase?\", \"What do you know about cryptocurrency?\", and \"Tell me about a product you launched.\""
      },
      {
        name: "Structured Assessments",
        duration: "~30 min",
        description: "An assessment measuring general intelligence (logical/spatial reasoning, verbal reasoning, and mathematical reasoning) as well as predicting your performance within Coinbase's culture. PM candidates will also complete CodeSignal, a standard assessment for technical ability."
      },
      {
        name: "Interviews",
        duration: "Up to 4 rounds",
        description: "Coinbase is a remote-first company, so expect all your interview rounds via Google Meet. Your interviews may be scheduled in blocks or back-to-back. Each interviewer will have a particular focus during their schedule, covering: Product Sense, Product Execution, Behavioral and PM Skillset, and Engineering."
      },
      {
        name: "Work Trial",
        description: "The last part of the panel interviews. You'll be given a scenario based on real-life Coinbase business challenges, then tasked to prepare a solution and present it to a panel. The panel usually consists of interviewers from past interviews. Limit your presentation to 15 minutes or less to give your panel enough time to discuss and ask questions."
      },
      {
        name: "Offer Review",
        description: "Final stage where compensation and offer details are discussed. Remember that Coinbase has eliminated salary negotiations—the offer you receive is standardized for your position and location."
      }
    ],

    questionCategories: [
      {
        category: "Product Sense",
        questions: [
          "What is your vision for Coinbase?",
          "Share a crypto product you like. How would you grow that product 10x?",
          "What's your favorite app? How would you improve it?",
          "What is the best way to describe crypto volatility risks to users of Coinbase?",
          "Should we alert customers of Coinbase about risky trades? If so, how would we set thresholds? Which factors would determine that?",
          "Pinpoint areas within the crypto economy that could benefit from improved user experiences.",
          "How would you grow Spotify by 10%?",
          "Imagine you are the product manager for Google Maps. How would you expand the user base?",
          "How would you design a user interface for banks?",
          "Design an app for a traveler who wants to taste Indian cuisine.",
          "How would you design a web-based application for collaborative work?"
        ]
      },
      {
        category: "Product Execution",
        questions: [
          "How would you respond to a 6% decline in completed orders on Coinbase?",
          "How would you design metrics for Coinbase?",
          "Imagine X has broken. How would you go about determining the root cause?",
          "How would you decide goals for Spotify?"
        ]
      },
      {
        category: "Behavioral & PM Skillset",
        questions: [
          "Why Coinbase?",
          "What are your thoughts on cryptocurrency?",
          "What do you think would be the biggest challenge you'll face in this role?",
          "When did you take a risk, make a mistake, or fail? How did you respond, and how did you grow from that experience?",
          "Describe in your current role how you've created something that didn't previously exist to solve a problem you identified.",
          "Tell me about a time when you were faced with a problem that had a number of possible solutions. What was the problem, and how did you determine the course of action? What was the outcome of that choice?",
          "Walk me through some of the projects that you consider most impactful.",
          "Tell me about the product that you're most proud of building.",
          "Share a product launch you had that you were proud of.",
          "Tell me about a time you had to make a decision based on data.",
          "Tell me about a time when you led a product or feature launch from ideation to execution.",
          "Tell me about a time when you had a conflict with a peer.",
          "Teach me to do something I've never done before.",
          "Something in your product broke. To whom do you communicate this and how?",
          "How would you teach a 6-year-old what a prime number is?",
          "How would you prioritize between 2 features?",
          "Tell me about a time when you had to make a key product decision. How did you prioritize it? What metrics did you use to measure success?",
          "Tell me about a time when you had to make unpopular product decisions."
        ]
      },
      {
        category: "Engineering / Technical",
        questions: [
          "How would you decide between launching a growth project or delaying it because of the tech debt it would create?",
          "Tell me about the technical complexities of this [past project on resume].",
          "Explain recursion to my grandmother.",
          "How does the internet work?",
          "Explain the concept of \"protocol\" to a 4-year-old child.",
          "What is the difference between C++ and Java?",
          "Explain what happens when executing mergesort.",
          "What is virtualization?"
        ]
      }
    ],

    interviewTips: [
      {
        title: "Ask clarifying questions",
        description: "Some questions will be ambiguous. Ask clarifying questions to get more information about the problem and reduce its scope. Jumping straight in without asking questions first will be a red flag to the interviewer."
      },
      {
        title: "Justify your choices",
        description: "Coinbase wants to see the reasoning behind your answer. Make sure to justify each decision you make and call out trade-offs as you arrive at a solution. Keep your explanations direct and succinct—clear communication is one of Coinbase's valued behaviors."
      },
      {
        title: "Be data-driven",
        description: "Coinbase is looking for product managers who can make decisions based on data and can judge everything they do by relevant metrics. In an interview situation, it's okay to make assumptions, but make it clear that in real life, you would seek out that data."
      },
      {
        title: "Demonstrate user empathy",
        description: "Coinbase wants product managers who can empathize with its users. When answering questions, focus on the user first: Identify who uses the product, why, and what the use cases are. Think about different kinds of Coinbase users, their pain points, and their user journey on the platform."
      },
      {
        title: "Use frameworks methodically",
        description: "Use the STAR (Situation, Task, Action, Result) framework for behavioral questions. Consider the BUS (Business objective - User problems - Solutions) framework for product insight questions and the SPSIL (Situation - Problem - Solution - Impact - Lessons) framework for behavioral questions."
      },
      {
        title: "Don't get stuck in a framework",
        description: "While frameworks are helpful, excessive reliance on them may hinder your performance. Trust your instinct and don't be afraid to deviate from the framework if needed. A framework is there to help you craft a better answer, not make you twist your answer to fit the framework."
      },
      {
        title: "Center on the company's core values",
        description: "Before your interview, study Coinbase's culture and product principles. When answering behavioral questions, share stories from past experiences that align with Coinbase's core values. When designing a product or strategy, consider how your answer aligns with their values and product principles."
      },
      {
        title: "Save questions for your interviewer",
        description: "You'll have a few minutes to ask your interviewer questions as the interview wraps up. Arriving without questions may suggest a lack of interest. Prepare thoughtful questions that go beyond what you could have found out online—ask about career growth opportunities or specific ways of working in the company."
      }
    ],

    preparationSteps: [
      "Deep dive into the product/organization - understand Coinbase's products, mission, and the cryptocurrency industry",
      "Learn a consistent method for answering PM interview questions using frameworks",
      "Practice with mock interviews to get real feedback",
      "Study Coinbase's mission statement, values, and product principles",
      "Familiarize yourself with how Coinbase makes decisions and their DRI culture"
    ]
  },
  {
    slug: "spotify",
    name: "Spotify",
    industry: "Music Streaming / Technology",
    description: "Spotify's PM interview process is unique and rigorous. As one of the world's most popular streaming platforms, they look for product managers who can drive innovation in audio content while maintaining their user-first culture.",
    interviewDuration: "4-6 weeks",
    interviewRounds: 5,
    difficulty: "Hard",

    roleOverview: {
      description: "As a Spotify Product Manager, you'll be responsible for driving the product strategy and roadmap for features that reach hundreds of millions of users worldwide. Spotify PMs work in autonomous squads following their unique 'Spotify Model' of agile development. You'll collaborate with designers, engineers, and data scientists to create personalized audio experiences. The role requires balancing user needs with business goals while navigating the complex landscape of music licensing and creator relationships.",
      skills: [
        "Strong product intuition and user empathy",
        "Data-driven decision making",
        "Experience with consumer products at scale",
        "Understanding of the music/audio industry",
        "Ability to work in autonomous, cross-functional teams",
        "Strong communication and stakeholder management",
        "Experience with personalization and recommendation systems",
        "Comfort with A/B testing and experimentation"
      ]
    },

    salaryLevels: [
      { level: "Product Manager I", baseSalary: "$140,000", totalComp: "$190,000" },
      { level: "Product Manager II", baseSalary: "$165,000", totalComp: "$240,000" },
      { level: "Senior Product Manager", baseSalary: "$195,000", totalComp: "$320,000" },
      { level: "Principal Product Manager", baseSalary: "$225,000", totalComp: "$420,000" },
      { level: "Director of Product", baseSalary: "$260,000", totalComp: "$550,000" }
    ],
    salaryNote: "Total compensation includes base salary, bonus, and equity. Spotify offers competitive benefits including generous parental leave, wellness stipends, and free Premium subscription.",

    interviewStages: [
      {
        name: "Application & Resume Screen",
        description: "Recruiters review your application for relevant product management experience, particularly in consumer tech or media. Experience with data-driven products and personalization is highly valued."
      },
      {
        name: "Recruiter Phone Screen",
        duration: "30 min",
        description: "Initial conversation to discuss your background, interest in Spotify, and basic fit for the role. Expect questions about your product experience and why you want to work at Spotify."
      },
      {
        name: "Hiring Manager Interview",
        duration: "45-60 min",
        description: "Deep dive into your product experience with the hiring manager. Expect behavioral questions and discussion of past products you've built. They'll assess your product thinking and leadership style."
      },
      {
        name: "Product Case Interview",
        duration: "60 min",
        description: "You'll work through a product case study, often related to Spotify's business. This tests your product sense, analytical thinking, and ability to structure ambiguous problems. Expect questions like 'How would you improve Spotify's discover weekly?' or 'Design a feature for podcast listeners.'"
      },
      {
        name: "Cross-functional Interviews",
        duration: "3-4 hours",
        description: "Multiple interviews with potential team members including engineers, designers, and data scientists. These assess your collaboration style, technical communication, and cultural fit with Spotify's squad model."
      }
    ],

    questionCategories: [
      {
        category: "Product Sense",
        questions: [
          "How would you improve Spotify's Discover Weekly playlist?",
          "Design a new feature for podcast listeners on Spotify.",
          "How would you increase engagement for casual Spotify users?",
          "What metrics would you use to measure the success of Spotify Wrapped?",
          "How would you design a social feature for Spotify?",
          "What would you build to help emerging artists grow their audience?",
          "How would you improve the car listening experience on Spotify?",
          "Design a feature to help users discover live music events.",
          "How would you monetize Spotify's free tier differently?"
        ]
      },
      {
        category: "Product Execution",
        questions: [
          "You notice that skip rates have increased 15% this month. How would you investigate?",
          "How would you prioritize between improving search and improving recommendations?",
          "What KPIs would you set for a new podcast feature?",
          "How would you run an A/B test for a new homepage design?",
          "Premium conversion dropped 10% last quarter. Walk me through your analysis.",
          "How would you measure the success of Spotify's algorithmic playlists?"
        ]
      },
      {
        category: "Behavioral",
        questions: [
          "Tell me about a product you launched that didn't succeed. What did you learn?",
          "Describe a time you had to make a decision with incomplete data.",
          "How do you handle disagreements with engineering about scope?",
          "Tell me about a time you had to influence without authority.",
          "Describe your approach to prioritization.",
          "Tell me about a time you had to pivot a product strategy.",
          "How do you stay connected to users?",
          "Describe a situation where you had to balance user needs with business goals."
        ]
      },
      {
        category: "Technical",
        questions: [
          "How do recommendation systems work at a high level?",
          "Explain how you would approach building a personalization feature.",
          "What technical considerations would you have for a real-time lyrics feature?",
          "How would you think about the architecture for a collaborative playlist feature?",
          "What are the tradeoffs between client-side and server-side A/B testing?"
        ]
      }
    ],

    interviewTips: [
      {
        title: "Know Spotify's product deeply",
        description: "Use Spotify extensively before your interview. Understand the free vs premium experience, explore features like Discover Weekly, Daily Mix, and Spotify Wrapped. Have opinions on what works and what could be improved."
      },
      {
        title: "Understand the audio landscape",
        description: "Spotify isn't just music anymore. Understand their podcast strategy, audiobook expansion, and how they're competing with Apple Music, YouTube Music, and podcast platforms. Know the creator economy and how Spotify supports artists."
      },
      {
        title: "Think in terms of squads",
        description: "Spotify's organizational model is unique. Understand how squads, tribes, chapters, and guilds work. Show that you can thrive in an autonomous team environment with high ownership."
      },
      {
        title: "Be data-driven but user-focused",
        description: "Spotify makes heavy use of data for personalization. Show you can balance quantitative metrics with qualitative user insights. Reference specific metrics you'd use to measure success."
      },
      {
        title: "Demonstrate passion for audio",
        description: "Spotify wants PMs who genuinely love music, podcasts, or audio content. Share your personal connection to audio and how it would fuel your work."
      },
      {
        title: "Show collaborative mindset",
        description: "The squad model requires strong collaboration. Prepare examples of working closely with engineers, designers, and data scientists. Show how you empower your team rather than dictate solutions."
      }
    ],

    preparationSteps: [
      "Use Spotify daily and explore all features - free and premium experiences",
      "Research Spotify's company culture, mission, and the squad model",
      "Understand the competitive landscape: Apple Music, YouTube Music, podcast platforms",
      "Practice product sense questions focused on personalization and recommendations",
      "Prepare stories about data-driven decision making and cross-functional collaboration",
      "Read about Spotify's engineering blog and how they approach technical challenges"
    ]
  },
  {
    slug: "stripe",
    name: "Stripe",
    industry: "Fintech / Payments",
    description: "Don't underestimate the Stripe product manager interviews. The process is known to be quite rigorous, with challenging questions that are specific to the company. Expect interviewers to ask you behavioral, product sense, product execution, and technical questions. Be prepared to show off your systems thinking, user empathy, and technical curiosity.",
    interviewDuration: "4 weeks",
    interviewRounds: 5,
    difficulty: "Very Hard",

    roleOverview: {
      description: "Stripe provides internet-based financial services to a range of users: from big enterprises that need secure payment processing; freelancers and small business owners who use Stripe to invoice and receive payment from clients; to online retail customers looking for a trusted payment platform. As a Stripe product manager, you'll be responsible for building products for any of these users, balancing user-centricity with business objectives. Stripe has different teams and domains where you could function as a PM: Payments, Revenue and Finance Automation, Banking-as-a-Service, and more. You'll collaborate closely with other functions, including design teams, finance, customer-facing teams, risk and fraud management teams, and even legal. Stripe has a high ownership culture, with PMs operating as mini GMs. You're expected to define your own scope, create alignment across teams, and push projects forward without a lot of top-down direction.",
      skills: [
        "Strong systems thinking ability",
        "User empathy and customer focus",
        "Technical curiosity and API understanding",
        "Data-driven decision making",
        "Ability to navigate ambiguity",
        "Experience with payments or fintech (preferred)",
        "Strong writing and communication skills",
        "Risk management awareness"
      ]
    },

    salaryLevels: [
      { level: "Product Manager (L2)", baseSalary: "$175,000", totalComp: "$270,000" },
      { level: "Product Manager (L3)", baseSalary: "$221,000", totalComp: "$387,000" },
      { level: "Product Manager (L4)", baseSalary: "$260,000", totalComp: "$490,000" },
      { level: "Product Manager (L5)", baseSalary: "$231,000", totalComp: "$542,000" }
    ],
    salaryNote: "Total compensation includes stocks and bonuses on top of base salary. Stripe's total pay is approximately 52% higher than the estimated average total pay for a US product manager.",

    interviewStages: [
      {
        name: "Resume Screen",
        description: "Recruiters will look at your resume and assess if your experience matches the open position. High-impact work and relevant fintech or platform experience will give you an edge."
      },
      {
        name: "Recruiter Phone Screen",
        duration: "30 min",
        description: "Once you've been invited to interview with Stripe, you'll first speak with a recruiter on a phone screen. Expect typical resume and behavioral questions. They'll evaluate your fit with Stripe's culture, your overall qualifications for the role, and whether you have a chance of succeeding in future interview rounds. Stripe's recruitment team is known for being transparent with the steps in their interview process."
      },
      {
        name: "Hiring Manager Interview",
        duration: "45-60 min",
        description: "After the recruiter phone screen, you'll have your first PM-focused interview over video conference with a hiring manager. Prepare to answer common PM interview questions. This round assesses your product experience and thinking."
      },
      {
        name: "Take-home Exercise",
        duration: "A few days",
        description: "Stripe has a strong writing culture, so after you've passed the first PM-focused interview, expect to get a written take-home exercise. You can prepare by practicing with PM interview questions. Asking your interviewer questions as you work on your written exercise is highly recommended - it shows your curiosity about the work and how you would collaborate on real challenges."
      },
      {
        name: "Onsite Interviews",
        duration: "Up to 5 rounds",
        description: "If you manage to clear the hiring manager screen, you'll be invited to the final round - an interview loop of up to 5 separate interviews. You'll have at least one PM interview (though you could have more). You'll also have interviews with people from a variety of other functions/levels like engineering, design, data science, or even senior leadership. Apart from question-and-answer interviews, you can also expect a presentation and a written exercise. According to Stripe CTO Singleton, interviews at Stripe always involve real-life simulations of work challenges - this is not just to test your abilities but also to discern whether you'll want to do the work 'in a way that is curious, digging into the details, and collaborative.'"
      }
    ],

    questionCategories: [
      {
        category: "Product Sense",
        questions: [
          "How would you build a Spotify for children?",
          "Describe a past project in detail.",
          "Describe a product you like.",
          "Build a platform to teach people about a sport you like.",
          "Design an API for a restaurant delivery service.",
          "How will you improve product XYZ?",
          "What is your favorite product? Why is it a favorite? How would you improve it?",
          "If you were the CEO of Stripe, what are the top three things you would do?",
          "You have been hired by an airline consortium and given a budget of $1 million to change the perception that air travel is not enjoyable - what would you do?",
          "What are 3 of your favorite products? Pick one and tell me how it could be expanded to a new market."
        ]
      },
      {
        category: "Behavioral",
        questions: [
          "Have you ever made a mistake while leading a big project before? How did you rectify it and what did you learn from the experience?",
          "How do you manage ambiguity?",
          "Tell me about a product that you are proud of delivering.",
          "Tell me why you are leaving your current company.",
          "Tell me about a time you were faced with a challenge and how you overcame it.",
          "What is your biggest strength as a Product Manager?",
          "When did you say no to something recently?",
          "What was a difficult moment you had to deal with?"
        ]
      },
      {
        category: "Product Execution",
        questions: [
          "Walk me through how you'll launch a product and measure key metrics.",
          "You have been hired as a CPO of a small brick-and-mortar supermarket chain that has no online presence and has seen declining revenue over the last 5-10 years. What would you do?",
          "How do you prioritize product features?",
          "What are the things that Stripe should measure and analyze on a daily basis?"
        ]
      },
      {
        category: "Technical",
        questions: [
          "What makes a good API?",
          "How would you get authentication to work across domains?",
          "Explain the concept of 'protocol' to a 4-year-old child.",
          "Explain recursion to my grandmother.",
          "Design a method that removes every other node from a linked list.",
          "Write a program to randomly shuffle an array of numbers.",
          "Write a function that returns how many digits are in a number."
        ]
      }
    ],

    interviewTips: [
      {
        title: "Take charge of the interview",
        description: "Stripe PM interview questions are intentionally messy. This is because Stripe wants to see how you operate under ambiguous circumstances. Own the interview by scoping proactively, clarifying assumptions, and leading the problem-solving. Don't wait for hints, but listen actively for them. Don't panic if you don't have all the information — show how you make rational, defensible decisions anyway."
      },
      {
        title: "Show system-level awareness",
        description: "Systems thinking is a non-negotiable skill in Stripe PMs. Frame your answers in terms of system dynamics, user impact, technical feasibility, and business consequences — not just isolated features. Demonstrate your knowledge of how products interact with each other, how incentives compound, and how seemingly small changes ripple through ecosystems (e.g., risk models, onboarding flows, APIs)."
      },
      {
        title: "Be data-driven and precise",
        description: "Stripe is looking for product managers who can make decisions based on data and can judge everything they do by relevant metrics. In an interview situation, it's okay to make assumptions because you might not have access to the facts and data. But make it clear that in real life, you would seek out that data and that your approach would be highly data-driven. Stripe also wants its PMs to be precise. So when proposing solutions or improvements, resist giving vague answers. Quantify the impact. Show that you care about latency, risk, fraud, or margin where relevant."
      },
      {
        title: "Balance user empathy with business impact",
        description: "Show that your decisions are anchored on business impact. It's not enough to build delightful experiences — you also have to prove they move the right metrics. During your prep, review how Stripe uses friction logs with highly specific user personas to improve product and user experience."
      },
      {
        title: "Expect tough questions about risk",
        description: "Stripe wants PMs to think like risk managers as well as product optimizers. Be sure to familiarize yourself with risk management, especially for anything touching money movement, onboarding, or APIs."
      },
      {
        title: "Ask questions and seek feedback",
        description: "At Stripe, candidates are encouraged to ask interviewers questions as they work through their answers. Through the questions you ask, interviewers can gauge how curious you are about the work and how well you collaborate. Stripe has a strong culture of feedback, with rigorous, high-velocity feedback loops. Demonstrate that seeking feedback (and applying it) is part of how you work, that you welcome and grow from tough feedback."
      },
      {
        title: "Answer methodically using frameworks",
        description: "Like other tech companies, Stripe wants you to solve problems methodically. Using answer frameworks can be extremely helpful. Use the BUS (Business objective - User problems - Solutions) framework for product insight questions and the SPSIL (Situation - Problem - Solution - Impact - Lessons) framework for behavioral questions."
      },
      {
        title: "Don't get stuck in a framework",
        description: "Frameworks can be helpful, but excessive reliance on them can hinder your performance. Trust your instinct, and don't be afraid to deviate from the framework if needed. A framework is only there to help you craft a better answer."
      },
      {
        title: "Center on the company's core values",
        description: "Before coming into a Stripe phone screen or interview, it's important to study the company's operating principles. When answering behavioral questions, share stories from past experiences that align with Stripe's core values. When designing a product or proposing a strategy, consider how your answer aligns with their values and product principles."
      },
      {
        title: "Treat the interview like a conversation",
        description: "Keep in mind that the interview is a two-way discovery process. While the interviewer assesses if you're a good fit for Stripe, you're also evaluating if the company aligns with your aspirations and preferences. Stripe always allocates time for questions after interviews. Come prepared with thoughtful questions that go beyond what you could have found out online. You can ask about career growth opportunities or specific ways of working in the company."
      }
    ],

    preparationSteps: [
      "Deep dive into Stripe's products - understand Payments, Billing, Connect, Atlas, and other offerings",
      "Learn about Stripe's operating principles and company culture",
      "Practice systems thinking - understand how different parts of a payment ecosystem interact",
      "Review API design principles and be ready to discuss technical tradeoffs",
      "Prepare examples of data-driven decision making from your past experience",
      "Familiarize yourself with risk management concepts in fintech",
      "Practice the SPSIL framework for behavioral questions",
      "Read Stripe's engineering blog and understand their technical approach"
    ]
  },
  {
    slug: "netflix",
    name: "Netflix",
    industry: "Entertainment / Streaming",
    description: "Netflix PM interviews are highly competitive and focus heavily on data-driven decision making, consumer insight, and innovation. As a global entertainment leader, Netflix looks for PMs who can balance creative vision with analytical rigor.",
    interviewDuration: "4-6 weeks",
    interviewRounds: 5,
    difficulty: "Very Hard",

    roleOverview: {
      description: "As a Netflix Product Manager, you'll be responsible for shaping the future of entertainment for over 230 million subscribers worldwide. Netflix PMs work on everything from content discovery and personalization to streaming technology and user experience. The role requires a unique blend of creative thinking and data-driven decision making. Netflix's famous culture of 'Freedom and Responsibility' means PMs have significant autonomy but are also held to high standards of performance and impact.",
      skills: [
        "Strong analytical and data interpretation skills",
        "Consumer insight and user empathy",
        "Experience with personalization and recommendation systems",
        "Ability to balance creative and business objectives",
        "Comfort with ambiguity and rapid experimentation",
        "Strong communication and influence skills",
        "Understanding of streaming technology and content delivery",
        "Experience with A/B testing at scale"
      ]
    },

    salaryLevels: [
      { level: "Product Manager", baseSalary: "$180,000", totalComp: "$300,000" },
      { level: "Senior Product Manager", baseSalary: "$250,000", totalComp: "$450,000" },
      { level: "Director of Product", baseSalary: "$300,000", totalComp: "$600,000" },
      { level: "VP of Product", baseSalary: "$400,000", totalComp: "$900,000" }
    ],
    salaryNote: "Netflix is known for paying top-of-market compensation. Total compensation is primarily cash-based with the option to take a portion in stock options. Netflix does not offer traditional bonuses - instead, they pay higher base salaries.",

    interviewStages: [
      {
        name: "Application & Resume Screen",
        description: "Recruiters review your application for relevant product management experience, particularly in consumer tech, entertainment, or media. Experience with personalization, recommendations, or content platforms is highly valued."
      },
      {
        name: "Recruiter Phone Screen",
        duration: "30-45 min",
        description: "Initial conversation about your background, interest in Netflix, and culture fit. Netflix places heavy emphasis on their culture, so expect questions about how you align with their values of freedom, responsibility, and candor."
      },
      {
        name: "Hiring Manager Interview",
        duration: "45-60 min",
        description: "Deep dive into your product experience with the hiring manager. Expect behavioral questions, discussion of past products, and assessment of your product thinking. They'll evaluate your ability to drive results with autonomy."
      },
      {
        name: "Case Study / Product Exercise",
        duration: "60-90 min",
        description: "You'll work through a product case study, often related to Netflix's business - improving engagement, content discovery, or user experience. This tests your analytical thinking, creativity, and ability to structure ambiguous problems."
      },
      {
        name: "Onsite / Virtual Loop",
        duration: "4-5 hours",
        description: "Multiple interviews with cross-functional partners including engineering, design, data science, and content teams. Expect a mix of behavioral, product sense, and analytical questions. Netflix values 'stunning colleagues' so they assess whether you'd raise the bar for the team."
      }
    ],

    questionCategories: [
      {
        category: "Product Sense",
        questions: [
          "How would you improve Netflix's content discovery experience?",
          "Design a feature to increase engagement for users who are about to churn.",
          "How would you approach building a social feature for Netflix?",
          "What metrics would you use to measure the success of Netflix's recommendation algorithm?",
          "How would you improve the Netflix experience on mobile devices?",
          "Design a feature to help users find something to watch faster.",
          "How would you approach Netflix's expansion into gaming?",
          "What would you build to improve the experience for users watching in groups?"
        ]
      },
      {
        category: "Analytical & Metrics",
        questions: [
          "Netflix's watch time dropped 5% last month. How would you investigate?",
          "How would you measure the success of a new homepage design?",
          "What KPIs would you set for Netflix's mobile app?",
          "How would you determine if a new feature is cannibalizing existing features?",
          "Design an A/B test for a new content recommendation approach.",
          "How would you prioritize between improving retention vs. acquisition?"
        ]
      },
      {
        category: "Behavioral",
        questions: [
          "Tell me about a time you made a decision with incomplete data.",
          "Describe a situation where you had to influence without authority.",
          "Tell me about a product failure and what you learned.",
          "How do you handle disagreements with stakeholders?",
          "Describe a time when you had to make a controversial product decision.",
          "Tell me about how you've given or received difficult feedback.",
          "How do you balance user needs with business objectives?",
          "Describe a time when you took a big risk on a product decision."
        ]
      },
      {
        category: "Culture Fit",
        questions: [
          "How do you embody 'Freedom and Responsibility'?",
          "What does 'radical candor' mean to you?",
          "How would you handle a situation where you disagree with leadership?",
          "Tell me about a time you proactively identified and solved a problem.",
          "How do you stay informed about the entertainment industry?",
          "What would you do in your first 90 days at Netflix?"
        ]
      }
    ],

    interviewTips: [
      {
        title: "Deeply understand Netflix's culture",
        description: "Read the Netflix Culture Memo thoroughly. Netflix's culture of 'Freedom and Responsibility' is central to how they operate. Be prepared to discuss how you embody these values and give examples of times you've demonstrated autonomy, candor, and high performance."
      },
      {
        title: "Be data-obsessed",
        description: "Netflix makes decisions based on data. In your interviews, demonstrate comfort with metrics, A/B testing, and data-driven decision making. Be ready to discuss how you'd measure success and what metrics matter most."
      },
      {
        title: "Show consumer insight",
        description: "Netflix cares deeply about understanding their users. Demonstrate that you think about problems from the user's perspective and can translate consumer insights into product decisions."
      },
      {
        title: "Demonstrate creative thinking",
        description: "As an entertainment company, Netflix values creativity. Show that you can think beyond conventional solutions and bring fresh perspectives to product challenges."
      },
      {
        title: "Practice radical candor",
        description: "Netflix values direct, honest feedback. In your interviews, be straightforward about your opinions, acknowledge weaknesses, and show that you can both give and receive feedback constructively."
      },
      {
        title: "Know the competitive landscape",
        description: "Understand how Netflix competes with Disney+, Amazon Prime Video, HBO Max, and other streaming services. Have opinions on Netflix's strategy and where they should focus."
      }
    ],

    preparationSteps: [
      "Read the Netflix Culture Memo and understand their values deeply",
      "Use Netflix extensively and develop opinions on what could be improved",
      "Study Netflix's business model, key metrics, and competitive positioning",
      "Practice product sense questions focused on recommendations and personalization",
      "Prepare examples that demonstrate autonomy, data-driven decisions, and candor",
      "Research Netflix's technology and how they approach innovation"
    ]
  },
  {
    slug: "openai",
    name: "OpenAI",
    industry: "Artificial Intelligence / Research",
    description: "OpenAI PM interviews are uniquely challenging, combining traditional product management skills with deep understanding of AI capabilities, safety considerations, and ethical implications. As a frontier AI company, OpenAI looks for PMs who can navigate unprecedented product challenges.",
    interviewDuration: "4-8 weeks",
    interviewRounds: 5,
    difficulty: "Very Hard",

    roleOverview: {
      description: "As an OpenAI Product Manager, you'll be guiding the translation of breakthrough AI research into impactful products, whether that means building secure systems for public sector deployment or enabling broader enterprise adoption through tools like SSO or guardrails. OpenAI PMs define strategy and product roadmaps for complex, safety-first initiatives, such as cross-agency ChatGPT deployments or scaled abuse detection systems. You'll lead features that require deep technical understanding and compliance, partnering with research, engineering, design, policy, and operations teams to launch responsible AI tools at scale. OpenAI PMs do more than just ship features—they're expected to weigh the broader ethical and societal implications of their decisions.",
      skills: [
        "Deep understanding of AI/ML capabilities and limitations",
        "Strong analytical and data-driven thinking",
        "Ability to navigate extreme ambiguity",
        "Safety-first product mindset",
        "Technical curiosity and ability to work with researchers",
        "Strong communication and stakeholder management",
        "Experience with API products or developer platforms",
        "Understanding of AI ethics and responsible deployment"
      ]
    },

    salaryLevels: [
      { level: "Product Manager", baseSalary: "$250,000", totalComp: "$860,000" },
      { level: "Senior Product Manager", baseSalary: "$300,000", totalComp: "$999,000" },
      { level: "Director of Product", baseSalary: "$350,000", totalComp: "$1,100,000" }
    ],
    salaryNote: "OpenAI PMs make significantly more than other PMs in the US, earning about 1.5-2x more than their peers at Meta or Google. Average yearly total compensation is approximately $860K-$999K, with reported packages reaching up to $1.1M. Compensation depends on role level and OpenAI's unique equity structure (PPUs - Profit Participation Units) which vest over four years.",

    interviewStages: [
      {
        name: "Resume & Application Review",
        description: "Recruiters review your application and resume to see if your experience matches the role. This is the most competitive stage, so make sure your résumé highlights impact, leadership, and alignment with OpenAI's mission."
      },
      {
        name: "Introductory Recruiter Call",
        duration: "30-45 min",
        description: "If your application is strong, you'll be invited to an initial call with a recruiter or hiring manager. Expect to answer questions about your background, motivations, and past product experience. This is also a good chance to show you've researched OpenAI's mission and recent projects."
      },
      {
        name: "Skills-based Assessment",
        duration: "Take-home or live",
        description: "Depending on the team, you may be asked to complete a take-home project, case study, or technical test. These assignments are designed to evaluate structured thinking, creativity, and communication. For PMs, assessments often focus on product strategy, analytical skills, or execution under ambiguity."
      },
      {
        name: "Final Interviews",
        duration: "4-5 rounds",
        description: "Multiple interviews covering behavioral, product sense, analytical & metrics, and culture fit. Interviewers will test how you approach complex, ambiguous problems and evaluate your ability to communicate clearly while driving towards impact."
      },
      {
        name: "Decision & Offer",
        description: "After final interviews, feedback is compiled into a candidate packet for the hiring team to review. You can expect to hear back within about a week. At this stage, recruiters may also request references."
      }
    ],

    questionCategories: [
      {
        category: "Behavioral",
        questions: [
          "Tell me about a test you've done.",
          "If you had to do this project faster, what would you have done differently?",
          "How do you handle working in highly ambiguous environments?",
          "How do you process and grow from past experiences?",
          "How do you overcome difficult situations?",
          "How do you get stuff done and prioritize projects?"
        ]
      },
      {
        category: "Product Sense",
        questions: [
          "What goal would you set for an AI-only social network that OpenAI is building?",
          "What industry could benefit most from enterprise ChatGPT?",
          "What's your experience with AI-driven products?",
          "What's your favorite product and how would you improve it?",
          "Design an umbrella for kids.",
          "How would you improve ChatGPT's user experience?"
        ]
      },
      {
        category: "Analytical & Metrics",
        questions: [
          "Estimate the number of ChatGPT users worldwide.",
          "How would you measure success for OpenAI? What if instrumentation went down?",
          "What topline metric goal would you set for Airbnb?",
          "How would you design metrics for a new AI feature?",
          "ChatGPT usage dropped 10% - how would you investigate?"
        ]
      },
      {
        category: "Culture Fit",
        questions: [
          "Why are you interested in working at OpenAI?",
          "Why do you want to work at OpenAI?",
          "How do you think about AI safety?",
          "What concerns do you have about AI development?",
          "How would you balance moving fast with being responsible?"
        ]
      }
    ],

    interviewTips: [
      {
        title: "Align with OpenAI's mission and values",
        description: "OpenAI puts a huge emphasis on its mission to build safe AGI that benefits all of humanity. Expect interviewers to test whether you genuinely share that vision. Be ready to reference the OpenAI Charter and highlight how your past work connects to building ethical, impactful products."
      },
      {
        title: "Be comfortable with ambiguity",
        description: "Unlike companies with decades of playbooks, OpenAI PMs operate in uncharted product spaces. You'll need to show you can take a vague, complex problem and break it down into a structured, logical approach."
      },
      {
        title: "Show strong analytical and data-driven thinking",
        description: "OpenAI prides itself on research-driven rigor. Expect estimation and metric-based questions, such as 'How would you measure success for ChatGPT?' or 'What would you do if instrumentation went down?' The goal is less about the 'right' answer and more about showing structured, data-informed thinking."
      },
      {
        title: "Demonstrate technical curiosity",
        description: "You don't need to code, but OpenAI PMs work hand-in-hand with researchers and engineers. Expect to discuss how ML systems are deployed, what trade-offs exist in scaling APIs, or what risks need to be mitigated in new releases."
      },
      {
        title: "Communicate like a collaborator",
        description: "Top companies like OpenAI want product managers who are excellent collaborators and can influence without authority. Show you can keep stakeholders aligned, explain trade-offs simply, and build trust across research and product teams."
      },
      {
        title: "Emphasize adaptability and resilience",
        description: "OpenAI moves fast and pivots often. Show that you can adapt to changing priorities, learn quickly, and maintain effectiveness even when plans change."
      }
    ],

    preparationSteps: [
      "Study the OpenAI Charter and understand their mission and long-term principles",
      "Use ChatGPT, GPT-4, and DALL-E extensively - have opinions on improvements",
      "Read OpenAI's blog for latest research and product updates",
      "Understand AI safety concepts and responsible AI deployment",
      "Practice product sense drills focused on AI-driven products",
      "Prepare examples of working in ambiguous environments with high autonomy",
      "Research the competitive landscape: Anthropic, Google DeepMind, Meta AI"
    ]
  },
  {
    slug: "google",
    name: "Google",
    industry: "Technology / Internet",
    description: "Google's PM interview process is one of the most rigorous in the industry. As one of the world's most influential technology companies, Google seeks product managers who can combine deep technical understanding with strategic thinking and user empathy at massive scale.",
    interviewDuration: "6-8 weeks",
    interviewRounds: 5,
    difficulty: "Very Hard",

    roleOverview: {
      description: "As a Google Product Manager, you'll be responsible for guiding products used by billions of people worldwide. Google PMs work across a vast portfolio including Search, YouTube, Cloud, Android, Chrome, Maps, and emerging AI products. The role requires balancing innovation with reliability, as even small changes can impact hundreds of millions of users. Google's data-driven culture means PMs need strong analytical skills while maintaining user empathy. You'll collaborate with world-class engineers, designers, and researchers to build products that organize the world's information and make it universally accessible.",
      skills: [
        "Strong analytical and quantitative skills",
        "Technical depth and ability to work with engineers",
        "User empathy and customer focus",
        "Strategic thinking and product vision",
        "Data-driven decision making",
        "Experience with products at scale",
        "Strong communication and influence skills",
        "Ability to prioritize ruthlessly"
      ]
    },

    salaryLevels: [
      { level: "Product Manager (L4)", baseSalary: "$160,000", totalComp: "$250,000" },
      { level: "Product Manager (L5)", baseSalary: "$195,000", totalComp: "$350,000" },
      { level: "Senior Product Manager (L6)", baseSalary: "$235,000", totalComp: "$500,000" },
      { level: "Group Product Manager (L7)", baseSalary: "$280,000", totalComp: "$700,000" },
      { level: "Director of Product (L8)", baseSalary: "$320,000", totalComp: "$1,000,000" }
    ],
    salaryNote: "Total compensation includes base salary, bonus, and equity (GSUs). Google is known for competitive compensation that increases significantly at higher levels. L5 is the standard entry level for experienced PMs, while L4 is typical for APM graduates.",

    interviewStages: [
      {
        name: "Application & Resume Screen",
        description: "Google receives hundreds of thousands of applications. Recruiters look for demonstrated product impact, technical background, and experience at scale. Having a referral significantly improves your chances of getting screened."
      },
      {
        name: "Recruiter Phone Screen",
        duration: "30-45 min",
        description: "Initial conversation about your background, product experience, and interest in Google. The recruiter will assess basic fit and explain the interview process. Expect questions about your resume and why you want to work at Google."
      },
      {
        name: "Phone Interviews",
        duration: "2 rounds x 45 min",
        description: "Two technical phone interviews with Google PMs. Expect a mix of product sense, analytical, and behavioral questions. You may be asked to design a product, analyze metrics, or walk through a past project in detail."
      },
      {
        name: "Onsite Interviews",
        duration: "4-5 rounds x 45 min",
        description: "Full-day onsite (or virtual) loop with multiple interviewers. Typically includes: 2 Product Sense interviews, 1 Analytical interview, 1 Technical interview, and 1 Leadership & Drive interview. Each interviewer submits independent feedback."
      },
      {
        name: "Hiring Committee Review",
        description: "Unlike most companies, Google uses a hiring committee (not the hiring manager) to make final decisions. The committee reviews all interview feedback to ensure consistent hiring standards. This can add 1-2 weeks to the process."
      }
    ],

    questionCategories: [
      {
        category: "Product Sense",
        questions: [
          "How would you improve Google Maps?",
          "Design a product for Google to enter the fitness market.",
          "How would you improve YouTube for creators?",
          "What product would you build to help students learn remotely?",
          "How would you design a smart home product for seniors?",
          "What would you do to increase Gmail engagement?",
          "Design a feature to make Google Search more useful for shopping.",
          "How would you improve Google Photos?",
          "What product would you build to compete with TikTok?"
        ]
      },
      {
        category: "Analytical & Metrics",
        questions: [
          "YouTube watch time dropped 5% week over week. How would you investigate?",
          "How would you measure the success of Google Translate?",
          "What metrics would you use for a new Google Assistant feature?",
          "Gmail signups are down 20%. Walk me through your analysis.",
          "How would you set goals for Chrome browser?",
          "Design an A/B test for a new Google Search feature.",
          "How would you prioritize between improving latency vs. adding features?"
        ]
      },
      {
        category: "Technical",
        questions: [
          "How does Google Search work at a high level?",
          "Explain how you would approach building a recommendation system.",
          "What technical considerations would you have for a real-time translation feature?",
          "How does YouTube handle video processing at scale?",
          "What are the tradeoffs between accuracy and latency in Search?"
        ]
      },
      {
        category: "Leadership & Drive",
        questions: [
          "Tell me about a time you led a cross-functional team.",
          "Describe a situation where you had to influence without authority.",
          "Tell me about a product you launched that didn't succeed. What did you learn?",
          "How do you handle disagreements with engineering?",
          "Describe a time when you had to make a difficult prioritization decision.",
          "Tell me about a time you had to pivot your product strategy.",
          "How do you stay connected to users?",
          "Describe your biggest product achievement and the impact it had."
        ]
      }
    ],

    interviewTips: [
      {
        title: "Structure your answers clearly",
        description: "Google interviewers appreciate structured thinking. Use frameworks to organize your answers, but don't be robotic. Start with clarifying questions, state your approach, then walk through systematically. Summarize key points at the end."
      },
      {
        title: "Be deeply analytical",
        description: "Google is extremely data-driven. When discussing metrics, be specific about what you'd measure and why. Show comfort with numbers, estimation, and A/B testing. Don't just list metrics—explain how you'd interpret them and make decisions."
      },
      {
        title: "Demonstrate technical depth",
        description: "While you don't need to code, Google expects PMs to understand technical concepts. Be prepared to discuss system design, tradeoffs, and how you'd work with engineers. Show genuine curiosity about how things work."
      },
      {
        title: "Think at Google scale",
        description: "Google products serve billions of users. Consider scale implications in your answers—what works for 1,000 users may break at 1 billion. Think about edge cases, internationalization, and infrastructure constraints."
      },
      {
        title: "Know Google's products deeply",
        description: "Use Google products extensively and form opinions. Understand the ecosystem—how Search, Android, Chrome, and Assistant work together. Be ready to discuss competitors and Google's strategic positioning."
      },
      {
        title: "Show Googleyness",
        description: "Google looks for collaborative, humble people who do the right thing. Demonstrate that you can disagree respectfully, admit when you're wrong, and put users first. Avoid arrogance or excessive self-promotion."
      }
    ],

    preparationSteps: [
      "Use Google products daily and develop strong opinions on improvements",
      "Study Google's mission, values, and organizational structure",
      "Practice structured problem-solving with PM interview frameworks",
      "Review basic technical concepts (APIs, databases, ML fundamentals)",
      "Prepare stories that demonstrate leadership, impact, and collaboration",
      "Practice metrics and analytical questions with specific examples",
      "Research Google's competitive landscape and strategic priorities"
    ]
  },
  {
    slug: "meta",
    name: "Meta",
    industry: "Social Media / Technology",
    description: "Meta's PM interview process is known for its emphasis on product sense, execution, and leadership. With billions of users across Facebook, Instagram, WhatsApp, and emerging metaverse products, Meta seeks PMs who can drive impact at massive scale while navigating complex organizational dynamics.",
    interviewDuration: "4-8 weeks",
    interviewRounds: 6,
    difficulty: "Very Hard",

    roleOverview: {
      description: "Product managers at Meta are responsible for the supervision of the product team's content design, user research, and data analysis. In certain cases, the scope may also include product marketing and program management. Two things are unique about being a product manager at Meta: you get a lot of autonomy, and things move fast. Meta's 'Move Fast' culture still holds strong, meaning you can usually get things done more quickly than at other FAANG companies. Meta is looking for strong product strategy skills, ability to thrive in chaos due to changing priorities, strong prioritization skills, ability to say no often, strong cross-functional collaboration, and strong communication skills at all levels.",
      skills: [
        "Strong product strategy and design skills",
        "Ability to thrive in ambiguity and changing priorities",
        "Data-driven decision making with strong metrics focus",
        "Cross-functional collaboration and influence",
        "User empathy and research skills",
        "Technical proficiency to work effectively with engineers",
        "Strong communication at all organizational levels",
        "Leadership and drive to take ownership"
      ]
    },

    salaryLevels: [
      { level: "Rotational PM (L3)", baseSalary: "$123,000", totalComp: "$161,000" },
      { level: "Product Manager (L4)", baseSalary: "$157,000", totalComp: "$224,000" },
      { level: "Product Manager (L5)", baseSalary: "$200,000", totalComp: "$369,000" },
      { level: "Product Manager (L6)", baseSalary: "$234,000", totalComp: "$569,000" },
      { level: "Product Manager (L7)", baseSalary: "$265,000", totalComp: "$1,100,000" }
    ],
    salaryNote: "Meta PMs make 46.5% more than other PMs in the US. Total compensation includes stocks and bonuses on top of base salary. Meta Senior PMs (L6 and L7) even have higher total compensation than Google's senior PMs. Compensation packages are always negotiable.",

    interviewStages: [
      {
        name: "Resume, Cover Letter & Referrals",
        description: "Recruiters assess if your experience matches the open position. Having a referral from a current Meta employee significantly improves your chances. Tailor your resume to highlight product impact and leadership."
      },
      {
        name: "HR Phone Screen",
        duration: "30-45 min",
        description: "Initial call with an HR recruiter to confirm you have a chance of getting the job. Be prepared to explain your background and why you're a good fit at Meta. Expect typical behavioral and resume questions like 'Tell me about yourself,' 'Why Meta?' and 'Tell me about a product you launched.'"
      },
      {
        name: "PM Phone Screen",
        duration: "2 rounds x 45 min",
        description: "Two phone interviews with Meta PMs. Each interview follows one of three themes: Product Sense, Analytical Thinking (Execution), or Leadership & Drive. At this stage, you'll typically get one Product Sense and one Analytical Thinking interview."
      },
      {
        name: "PM Onsite",
        duration: "3 rounds x 45 min",
        description: "Three interviews at Meta's office (or virtual). At the onsite stage, you'll typically get one of each type of interview: Product Sense, Analytical Thinking, and Leadership & Drive. The interviewers submit ratings and notes to an internal system."
      },
      {
        name: "Hiring Committee Review",
        description: "After the PM phone screen, interviewers have 24h to submit feedback. Your recruiter reviews this and decides whether to advance you. After the onsite, interviewers make a recommendation and the recruiter compiles your 'packet' for the hiring committee."
      },
      {
        name: "Final Decision",
        description: "The hiring committee includes senior leaders from across Meta who review your packet and make a final decision. The committee also sets your level and therefore compensation. Hiring managers and referrers have little influence at this stage."
      }
    ],

    questionCategories: [
      {
        category: "Product Sense",
        questions: [
          "How would you build Uber for kids?",
          "How would you build a fitness app for Meta?",
          "How would you design an app for an amusement park?",
          "Build a product for Facebook farmers.",
          "Build a product for group travel.",
          "How would you design an app for pet owners?",
          "Design a new experience for a grocery store.",
          "How would you design a new feature for an existing Meta product?",
          "How would you improve user engagement for a specific Meta product?",
          "Pick any Meta product - how would you improve it?",
          "How would you improve Instagram Shopping?",
          "How would you improve Facebook Campus?",
          "How would you improve Facebook Groups?",
          "Should Meta add a product for museums and their visitors?"
        ]
      },
      {
        category: "Analytical Thinking (Execution)",
        questions: [
          "Measure the success of Facebook Live.",
          "What should be the goal for Meta Pay? What should be the metric?",
          "You are a PM for Horizon Worlds. What metrics do you focus on first?",
          "Instagram feed engagement drops 10% - what do you do?",
          "The number of dollars sent using Meta Pay went down, why?",
          "Facebook Events dropped by 30%, how will you revamp it?",
          "Likes are down in Brazil, what's going on?",
          "Prioritize WhatsApp features.",
          "Facebook newsfeed engagement dropped by 2% — what do you do?",
          "You are the PM for Facebook Newsfeed — how would you rank posts?"
        ]
      },
      {
        category: "Leadership & Drive",
        questions: [
          "Tell me about yourself.",
          "Why Meta?",
          "Why product management?",
          "What's your biggest accomplishment?",
          "What is your biggest weakness?",
          "How do you earn the trust of your team?",
          "Tell me about a time you dealt with a conflict in a team.",
          "Tell me about a time you failed at work.",
          "Tell me about a time you led a team.",
          "Tell me about a time you had to prioritize numerous different projects.",
          "Tell me about a product you led from idea to launch.",
          "Tell me about a time you overcame a really difficult challenge."
        ]
      }
    ],

    interviewTips: [
      {
        title: "Know Meta's mission and products",
        description: "Familiarize yourself with Meta's mission statement, core values, and the range of products and services it offers. In product design questions, you'll want to cite the company's mission. Highlight how your work can contribute to its goals."
      },
      {
        title: "Product sense is key",
        description: "Product sense is really the most important interview at Meta. Focus your preparation on product sense questions. You must show empathy for all kinds of users, use strong prioritization criteria to justify why Meta would build something, demonstrate alignment with Meta's overall mission and strengths, and show a strong understanding about the risks that may come throughout the process."
      },
      {
        title: "Showcase leadership",
        description: "Meta wants to hire candidates who can inspire and lead. In behavioral interviews, be ready to discuss instances where you've taken initiative, made tough decisions, and led projects to success. Show leadership in every interview, not just behavioral questions. Be confident—say 'Here's my segmentation, and I'm going to choose this segment because of X.'"
      },
      {
        title: "Know your metrics",
        description: "You should be schooled on all the activation metrics - adoption, engagement, quality, retention, etc. There are dozens of metrics and you need to be solid on them all. Often people don't think enough about retention, and especially at Meta, that's a huge metric."
      },
      {
        title: "Get enough technical proficiency",
        description: "Meta doesn't require PMs to be as technical as other companies, but a solid understanding of software development processes, system design, and technical challenges is crucial. Be able to discuss technical trade-offs and work effectively with engineering teams."
      },
      {
        title: "Understand user experience (UX)",
        description: "Demonstrate a keen sense for UX design and user psychology. You should be able to critique existing designs and propose improvements grounded in user research. Be ready to create wireframes and mock-ups during product sense interviews."
      },
      {
        title: "Practice behavioral questions",
        description: "Prepare for questions about past experiences that illustrate your problem-solving skills, leadership, teamwork, and resilience. Use the STAR method (Situation, Task, Action, Result) to structure your answers. Keep answers under 5 minutes."
      },
      {
        title: "Stay informed about tech trends",
        description: "Being knowledgeable about recent technological advancements and industry trends can help you bring fresh perspectives to the table. This demonstrates your enthusiasm and commitment to staying relevant in a fast-paced field."
      },
      {
        title: "Mock interviews are crucial",
        description: "Practice with peers and also try to use platforms that offer mock interviews with current or former PMs from Meta. Feedback from these sessions can be invaluable in identifying areas for improvement."
      },
      {
        title: "Thank your interviewer",
        description: "It's a small thing, but when you finish the interview and can breathe a sigh of relief, the interviewer still has to spend an hour writing up their evaluation. Show your appreciation of their situation and you'll demonstrate a key PM skill: empathy!"
      }
    ],

    preparationSteps: [
      "Study Meta's 6 core values and understand how they guide product decisions",
      "Use Facebook, Instagram, WhatsApp, and Messenger extensively - develop opinions on improvements",
      "Learn about different question types: behavioral, product design, product improvement, strategy, estimation, metric, and prioritization questions",
      "Practice product sense questions - this is the most important interview type at Meta",
      "Prepare examples that demonstrate leadership, ownership, and thriving in ambiguity",
      "Review Meta's annual reports and strategy presentations",
      "Understand the competitive landscape and Meta's position in social media, messaging, and VR/AR"
    ]
  }
];

export function getCompanyBySlug(slug: string): Company | undefined {
  return companies.find(c => c.slug === slug);
}

export function getAllCompanySlugs(): string[] {
  return companies.map(c => c.slug);
}
