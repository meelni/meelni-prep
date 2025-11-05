import {
  Brain,
  MessageSquare,
  Mic,
  Sparkles,
  Target,
  Zap,
} from 'lucide-react';

export const BLUR_FADE_DELAY = 0.15;

export const siteConfig = {
  name: 'MockMate',
  description: 'Master PM interviews with AI-powered practice sessions.',
  cta: 'Start Practicing',
  url: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
  keywords: [
    'PM interviews',
    'Interview prep',
    'Product management',
    'AI coaching',
    'Mock interviews',
  ],
  links: {
    email: 'support@mockmate.ai',
    twitter: 'https://twitter.com/mockmate',
    github: 'https://github.com/mockmate',
  },
  hero: {
    title: 'Master PM Interviews with AI',
    description:
      'Practice real-time mock interviews with an AI coach. Get instant feedback, refine your answers, and land your dream PM role.',
    cta: 'Start Practicing Now',
    ctaDescription: 'Free to get started. No credit card required.',
  },
  features: [
    {
      name: 'Real-Time Voice Practice',
      description:
        'Natural conversation with AI that adapts to your responses, just like a real interview.',
      icon: <Mic className="h-6 w-6" />,
    },
    {
      name: 'Multiple Interview Types',
      description:
        'Practice Product Sense, Analytical Thinking, Leadership, and Strategy questions.',
      icon: <Target className="h-6 w-6" />,
    },
    {
      name: 'Instant AI Feedback',
      description:
        'Get detailed feedback on your answers with specific areas for improvement.',
      icon: <MessageSquare className="h-6 w-6" />,
    },
    {
      name: 'PM Frameworks',
      description:
        'Learn and apply proven frameworks like STAR, 5-step Product Sense, and more.',
      icon: <Brain className="h-6 w-6" />,
    },
    {
      name: 'Flexible Practice Modes',
      description:
        'Choose from Mock Interview, Practice, Learning, or Interactive Coaching modes.',
      icon: <Sparkles className="h-6 w-6" />,
    },
    {
      name: 'Track Your Progress',
      description:
        'Monitor your improvement over time with detailed analytics and session history.',
      icon: <Zap className="h-6 w-6" />,
    },
  ],
  footer: {
    links: [
      { text: 'About', url: '#' },
      { text: 'Contact', url: '#' },
      { text: 'Privacy', url: '#' },
    ],
    bottomText: '© 2025 MockMate. All rights reserved.',
    brandText: 'MockMate',
  },
};

export type SiteConfig = typeof siteConfig;
