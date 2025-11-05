'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowRight, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { fadeInUp, staggerContainer } from '@/lib/animations';

const features = [
  {
    icon: '💡',
    title: 'Multiple Interview Types',
    description: 'Product Sense, Analytics, Leadership, and Strategy',
  },
  {
    icon: '🎬',
    title: 'Flexible Practice Modes',
    description: 'Mock interviews, quick practice, or learning mode',
  },
  {
    icon: '⚡',
    title: 'Real-time Conversations',
    description: 'Natural voice interaction with instant responses',
  },
];

export default function Home() {
  return (
    <div className="relative min-h-screen flex items-center justify-center bg-background overflow-hidden">
      {/* Animated gradient background */}
      <div className="absolute inset-0 gradient-bg" />

      {/* Subtle grid pattern */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(99,102,241,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(99,102,241,0.03)_1px,transparent_1px)] bg-[size:64px_64px]" />

      <motion.div
        className="relative z-10 w-full max-w-5xl mx-auto px-6 py-20"
        initial="initial"
        animate="animate"
        variants={staggerContainer}
      >
        {/* Logo badge */}
        <motion.div variants={fadeInUp} className="flex justify-center mb-8">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-surface border border-default shadow-sm">
            <Sparkles className="w-4 h-4 text-indigo-500" />
            <span className="text-sm font-medium text-secondary">
              AI-Powered Interview Prep
            </span>
          </div>
        </motion.div>

        {/* Hero content */}
        <div className="text-center mb-20">
          <motion.div variants={fadeInUp} className="mb-8">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 shadow-lg mb-8">
              <span className="text-2xl">🎯</span>
            </div>
          </motion.div>

          <motion.h1
            variants={fadeInUp}
            className="text-4xl md:text-5xl font-bold mb-5 tracking-tight leading-tight"
          >
            <span className="gradient-text">MockMate</span>
          </motion.h1>

          <motion.p
            variants={fadeInUp}
            className="text-base md:text-lg text-secondary mb-10 max-w-xl mx-auto leading-relaxed"
          >
            Master PM interviews with AI-powered practice sessions
          </motion.p>

          <motion.div variants={fadeInUp}>
            <Link href="/setup">
              <Button variant="glow" size="md" className="group">
                Start practicing now
                <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
              </Button>
            </Link>
          </motion.div>
        </div>

        {/* Features grid */}
        <motion.div
          variants={staggerContainer}
          className="grid grid-cols-1 md:grid-cols-3 gap-4"
        >
          {features.map((feature, index) => (
            <motion.div
              key={index}
              variants={fadeInUp}
              whileHover={{ scale: 1.01, y: -2 }}
              transition={{ type: 'spring', stiffness: 300, damping: 25 }}
              className="group p-6 rounded-xl bg-surface/50 backdrop-blur-sm border border-default hover:border-hover hover:shadow-md transition-all"
            >
              <div className="text-2xl mb-3 transform group-hover:scale-105 transition-transform">
                {feature.icon}
              </div>
              <h3 className="text-sm font-semibold text-primary mb-2">
                {feature.title}
              </h3>
              <p className="text-xs text-secondary leading-relaxed">
                {feature.description}
              </p>
            </motion.div>
          ))}
        </motion.div>

      </motion.div>
    </div>
  );
}
