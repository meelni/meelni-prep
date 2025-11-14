import { Icons } from "@/components/icons";
import {
  MicIcon,
  MessageSquareIcon,
  TrendingUpIcon,
  TargetIcon,
  SparklesIcon,
  LayoutGridIcon,
} from "lucide-react";

export const BLUR_FADE_DELAY = 0.15;

export const siteConfig = {
  name: "Meelni",
  description: "Practice the interview. Land the offer.",
  cta: "Start a mock",
  url: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
  keywords: [
    "Mock Interviews",
    "Interview Practice",
    "Product Management",
    "Interview Preparation",
  ],
  links: {
    email: "support@meelni.com",
    twitter: "https://twitter.com/meelni",
    discord: "https://discord.gg/meelni",
    github: "https://github.com/meelni",
    instagram: "https://instagram.com/meelni",
  },
  hero: {
    title: "Ace your PM interview",
    description:
      "The AI interview coach that helps you land your dream PM role.",
    cta: "Start a mock",
    ctaDescription: "Explore question bank",
  },
  features: [
    {
      name: "Natural Voice Conversations",
      description:
        "Practice with Meelni through realistic voice interviews. Natural interruptions, real-time responses, and conversational flow that feels human.",
      icon: <MicIcon className="h-6 w-6" />,
    },
    {
      name: "4 PM Interview Types",
      description:
        "Master Product Sense, Execution, Behavioral, and Strategy interviews. Each with proven frameworks tailored to top tech companies.",
      icon: <TargetIcon className="h-6 w-6" />,
    },
    {
      name: "Post-Interview Feedback",
      description:
        "Receive comprehensive feedback after each session. Get insights on structure, clarity, and framework usage to improve your next interview.",
      icon: <SparklesIcon className="h-6 w-6" />,
    },
    {
      name: "Performance Dashboard",
      description:
        "Track your interview practice sessions and monitor your progress. Review transcripts and see your preparation journey over time.",
      icon: <TrendingUpIcon className="h-6 w-6" />,
    },
  ],
  pricing: [
    {
      name: "Free",
      price: { monthly: "$0", yearly: "$0" },
      frequency: { monthly: "month", yearly: "year" },
      description: "Perfect for exploring",
      usage: "3 AI mock interviews per month",
      usageDetail: "Product Sense questions only",
      features: [
        "3 interviews per month",
        "Product Sense questions only",
        "Basic scoring & feedback",
        "Last 5 sessions visible",
        "Voice conversation mode",
        "Basic analytics",
      ],
      cta: "Start Free",
    },
    {
      name: "Pro",
      price: { monthly: "$29", yearly: "$249" },
      frequency: { monthly: "month", yearly: "year" },
      description: "For serious interview prep",
      usage: "UNLIMITED AI mock interviews",
      usageDetail: "All 4 interview types",
      features: [
        "Unlimited interviews",
        "All 4 interview types",
        "2,879 curated PM questions",
        "Detailed framework feedback",
        "Full analytics dashboard",
        "All session history",
      ],
      popular: true,
      cta: "Start 7-Day Trial",
    },
    {
      name: "Premium",
      price: { monthly: "$79", yearly: "$699" },
      frequency: { monthly: "month", yearly: "year" },
      description: "For power users & career switchers",
      usage: "Everything in Pro, PLUS:",
      usageDetail: "Advanced coaching & features",
      features: [
        "Everything in Pro",
        "Advanced analytics & benchmarks",
        "Custom improvement drills",
        "Early access to new features",
        "API access (coming soon)",
        "Priority support",
      ],
      cta: "Start 14-Day Trial",
    },
  ],
  footer: {
    socialLinks: [
      {
        icon: <Icons.github className="h-5 w-5" />,
        url: "#",
      },
      {
        icon: <Icons.twitter className="h-5 w-5" />,
        url: "#",
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
