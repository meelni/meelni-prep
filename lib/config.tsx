import { Icons } from "@/components/icons";
import { PRODUCT_LANGUAGE } from "@/lib/product-language";

export const BLUR_FADE_DELAY = 0.15;

export const siteConfig = {
  name: "Meelni",
  description: PRODUCT_LANGUAGE.oneLine,
  cta: "Start a mock interview",
  url: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
  keywords: [
    "AI interview coach",
    "mock interview AI",
    "PM interview practice",
    "product manager interview prep",
    "product sense interview",
    "behavioral interview practice",
    "AI mock interview",
    "voice interview practice",
    "PM interview questions",
    "interview preparation tool",
  ],
  links: {
    email: "support@meelni.com",
    twitter: "https://twitter.com/meelni",
    discord: "https://discord.gg/meelni",
    github: "https://github.com/meelni",
    instagram: "https://instagram.com/meelni",
  },
  hero: {
    title: PRODUCT_LANGUAGE.heroPromise,
    description: PRODUCT_LANGUAGE.oneLine,
    cta: "Start a mock interview",
    ctaDescription: "Explore question bank",
  },
  features: [
    {
      name: "Curated PM questions",
      description:
        "Practice Product Sense, Execution, Strategy, and Behavioral prompts.",
    },
    {
      name: "Voice practice",
      description: "Say the answer out loud and handle realistic follow-ups.",
    },
    {
      name: "Feedback",
      description:
        "See what was strong, what was missing, and what to change next.",
    },
    {
      name: "Progress",
      description:
        "Track patterns across interviews so your next practice session has a clear focus.",
    },
  ],
  pricing: [
    {
      name: "Trial",
      price: { monthly: "$0", yearly: "$0" },
      frequency: { monthly: "7-day trial", yearly: "7-day trial" },
      description: "Try Meelni before paying",
      usage: "2 interview credits",
      usageDetail: "All PM round types",
      features: [
        "2 full AI mock interviews",
        "All PM round types",
        "Credits expire after 7 days",
      ],
      cta: "Start Trial",
    },
    {
      name: "Interview Pass",
      price: { monthly: "$9", yearly: "$9" },
      frequency: { monthly: "pass", yearly: "pass" },
      description: "One focused interview, no subscription",
      usage: "1 interview credit",
      usageDetail: "Expires after 30 days",
      features: [
        "1 full AI mock interview",
        "All PM round types",
        "No subscription required",
      ],
      cta: "Buy Pass",
    },
    {
      name: "Starter",
      price: { monthly: "$19", yearly: "$19" },
      frequency: { monthly: "month", yearly: "month" },
      description: "Consistent monthly practice",
      usage: "4 interview credits per month",
      usageDetail: "Rollover up to 4 credits for 60 days",
      features: [
        "4 full AI mock interviews each month",
        "All PM round types",
        "Rollover up to 4 unused credits",
      ],
      popular: true,
      cta: "Choose Starter",
    },
    {
      name: "Pro",
      price: { monthly: "$49", yearly: "$49" },
      frequency: { monthly: "month", yearly: "month" },
      description: "Higher-volume interview prep",
      usage: "12 interview credits per month",
      usageDetail: "Rollover up to 12 credits for 60 days",
      features: [
        "12 full AI mock interviews each month",
        "All PM round types",
        "Rollover up to 12 unused credits",
      ],
      cta: "Choose Pro",
    },
  ],
  footer: {
    socialLinks: [
      {
        icon: <Icons.twitter className="h-5 w-5" />,
        url: "https://x.com/trymeelni",
      },
    ],
    links: [
      { text: "Pricing", url: "#" },
      { text: "Contact", url: "#" },
    ],
    bottomText: "All rights reserved.",
    brandText: "AGENT SDK",
  },

  testimonials: [
    {
      id: 1,
      text: "The AI Agent SDK has revolutionized how we build intelligent systems. It's incredibly intuitive and powerful.",
      name: "Alice Johnson",
      company: "OpenMind Labs",
      image:
        "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=500&auto=format&fit=crop&q=60&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxzZWFyY2h8NHx8cG9ydHJhaXR8ZW58MHx8MHx8fDA%3D",
    },
    {
      id: 2,
      text: "We've significantly reduced development time for our AI projects using this SDK. The multi-agent feature is a game-changer.",
      name: "Bob Brown",
      company: "NeuralForge",
      image:
        "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=500&auto=format&fit=crop&q=60&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxzZWFyY2h8MTh8fHBvcnRyYWl0fGVufDB8fDB8fHww",
    },
    {
      id: 3,
      text: "The cross-language support allowed us to seamlessly integrate AI agents into our existing tech stack.",
      name: "Charlie Davis",
      company: "CodeHarbor",
      image:
        "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=500&auto=format&fit=crop&q=60&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxzZWFyY2h8MTJ8fHBvcnRyYWl0fGVufDB8fDB8fHww",
    },
    {
      id: 4,
      text: "The AI Agent SDK's tool integration feature has streamlined our workflow automation processes.",
      name: "Diana Evans",
      company: "AutomateX",
      image:
        "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=500&auto=format&fit=crop&q=60&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxzZWFyY2h8Mjh8fHBvcnRyYWl0fGVufDB8fDB8fHww",
    },
    {
      id: 5,
      text: "The customizable agent behaviors have allowed us to create highly specialized AI solutions for our clients.",
      name: "Ethan Ford",
      company: "AICore",
      image:
        "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=500&auto=format&fit=crop&q=60&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxzZWFyY2h8MzJ8fHBvcnRyYWl0fGVufDB8fDB8fHww",
    },
    {
      id: 6,
      text: "The AI Agent SDK's efficiency features have significantly improved our system's performance and scalability.",
      name: "Fiona Grant",
      company: "ScaleAI",
      image:
        "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=500&auto=format&fit=crop&q=60&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxzZWFyY2h8NDB8fHBvcnRyYWl0fGVufDB8fDB8fHww",
    },
    {
      id: 7,
      text: "The SDK's intuitive APIs have made it easy for our team to quickly prototype and deploy AI agent systems.",
      name: "George Harris",
      company: "RapidAI",
      image:
        "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=500&auto=format&fit=crop&q=60&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxzZWFyY2h8NDR8fHBvcnRyYWl0fGVufDB8fDB8fHww",
    },
    {
      id: 8,
      text: "The AI Agent SDK's multi-agent system has enabled us to build complex, collaborative AI solutions with ease.",
      name: "Hannah Irving",
      company: "CollabAI",
      image:
        "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=500&auto=format&fit=crop&q=60&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxzZWFyY2h8NTJ8fHBvcnRyYWl0fGVufDB8fDB8fHww",
    },
    {
      id: 9,
      text: "The SDK's flexibility in integrating external tools has expanded our AI agents' capabilities tremendously.",
      name: "Ian Johnson",
      company: "FlexAI",
      image:
        "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=500&auto=format&fit=crop&q=60&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxzZWFyY2h8NTZ8fHBvcnRyYWl0fGVufDB8fDB8fHww",
    },
    {
      id: 10,
      text: "The AI Agent SDK's documentation and support have made our learning curve much smoother.",
      name: "Julia Kim",
      company: "DevAI",
      image:
        "https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?w=500&auto=format&fit=crop&q=60&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxzZWFyY2h8NjR8fHBvcnRyYWl0fGVufDB8fDB8fHww",
    },
    {
      id: 11,
      text: "We've seen a significant boost in our AI's decision-making capabilities thanks to the AI Agent SDK.",
      name: "Kevin Lee",
      company: "DecisionTech",
      image:
        "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=500&auto=format&fit=crop&q=60&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxzZWFyY2h8NzB8fHBvcnRyYWl0fGVufDB8fDB8fHww",
    },
    {
      id: 12,
      text: "The SDK's multi-agent system has revolutionized our approach to complex problem-solving.",
      name: "Laura Martinez",
      company: "SolveX",
      image:
        "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=500&auto=format&fit=crop&q=60&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxzZWFyY2h8NzZ8fHBvcnRyYWl0fGVufDB8fDB8fHww",
    },
    {
      id: 13,
      text: "The customization options in the AI Agent SDK have allowed us to create truly unique AI solutions.",
      name: "Michael Chen",
      company: "UniqueAI",
      image:
        "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=500&auto=format&fit=crop&q=60&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxzZWFyY2h8ODJ8fHBvcnRyYWl0fGVufDB8fDB8fHww",
    },
    {
      id: 14,
      text: "The efficiency of the AI Agent SDK has significantly reduced our development time and costs.",
      name: "Natalie Wong",
      company: "FastTrackAI",
      image:
        "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=500&auto=format&fit=crop&q=60&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxzZWFyY2h8ODh8fHBvcnRyYWl0fGVufDB8fDB8fHww",
    },
    {
      id: 15,
      text: "The cross-language support has made it easy for our diverse team to collaborate on AI projects.",
      name: "Oliver Smith",
      company: "GlobalAI",
      image:
        "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=500&auto=format&fit=crop&q=60&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxzZWFyY2h8OTR8fHBvcnRyYWl0fGVufDB8fDB8fHww",
    },
  ],
};

export type SiteConfig = typeof siteConfig;
