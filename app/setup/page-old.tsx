'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, ArrowRight, Check, Clock } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { fadeInUp, staggerContainer, selectionSpring } from '@/lib/animations';

// Optimal defaults (not exposed to user)
const OPTIMAL_DEFAULTS = {
  voice: "248be419-c632-4f23-adf1-5324ed7dbf1d", // Professional, clear voice
  speed: 1.0,
  emotion: "Confident",
  volume: 1.0,
  ttsModel: "sonic-3", // Best quality
  sttModel: "deepgram/nova-2", // Reliable recognition
  llmModel: "openai/gpt-4o-mini", // Cost-effective, quality balance
};

// Interview type configurations
const INTERVIEW_TYPES = [
  {
    value: "product_sense",
    label: "Product Sense",
    icon: "💡",
    description: "Design features and improve products",
    duration: "45 min",
  },
  {
    value: "analytical_thinking",
    label: "Analytical Thinking",
    icon: "📊",
    description: "Define metrics and analyze performance",
    duration: "45 min",
  },
  {
    value: "leadership_drive",
    label: "Leadership & Drive",
    icon: "🎯",
    description: "Behavioral questions using STAR",
    duration: "30 min",
  },
  {
    value: "strategy",
    label: "Strategy",
    icon: "🗺️",
    description: "Business and strategic discussions",
    duration: "45 min",
  },
];

// Interview modes
const INTERVIEW_MODES = [
  {
    value: "mock_interview",
    label: "Mock Interview",
    icon: "🎬",
    description: "Full realistic interview experience"
  },
  {
    value: "practice",
    label: "Quick Practice",
    icon: "⚡",
    description: "Focused practice on specific areas"
  },
  {
    value: "learning",
    label: "Learning Mode",
    icon: "📚",
    description: "Learn frameworks step-by-step"
  },
];

export default function InterviewSetup() {
  const router = useRouter();
  const [selectedType, setSelectedType] = useState('product_sense');
  const [selectedMode, setSelectedMode] = useState('mock_interview');

  const handleStartInterview = () => {
    const params = new URLSearchParams({
      role: 'interviewee',
      mode: selectedMode,
      interview_type: selectedType,
      voice: OPTIMAL_DEFAULTS.voice,
      skill_level: 'mid',
      speed: OPTIMAL_DEFAULTS.speed.toString(),
      emotion: OPTIMAL_DEFAULTS.emotion,
      volume: OPTIMAL_DEFAULTS.volume.toString(),
      tts_model: OPTIMAL_DEFAULTS.ttsModel,
      stt_model: OPTIMAL_DEFAULTS.sttModel,
      llm_model: OPTIMAL_DEFAULTS.llmModel,
    });

    router.push('/interview?' + params.toString());
  };

  const selectedTypeData = INTERVIEW_TYPES.find((t) => t.value === selectedType);
  const selectedModeData = INTERVIEW_MODES.find((m) => m.value === selectedMode);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <motion.header
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="border-b border-default backdrop-blur-sm bg-background/80 sticky top-0 z-50"
      >
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="inline-flex items-center gap-2 text-sm text-secondary hover:text-primary transition-colors group">
            <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-1" />
            Back to home
          </Link>

          <div className="flex items-center gap-2">
            <Badge variant="primary" size="sm">
              <Clock className="w-3 h-3" />
              ~45 min
            </Badge>
          </div>
        </div>
      </motion.header>

      <motion.div
        initial="initial"
        animate="animate"
        variants={staggerContainer}
        className="max-w-5xl mx-auto px-6 py-12"
      >
        {/* Title Section */}
        <motion.div variants={fadeInUp} className="mb-12">
          <h1 className="text-5xl font-bold mb-4 tracking-tight">
            <span className="gradient-text">Start your session</span>
          </h1>
          <p className="text-xl text-secondary">
            Choose your interview type and practice mode
          </p>
        </motion.div>

        {/* Progress Indicator */}
        <motion.div variants={fadeInUp} className="mb-12">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-indigo-500 text-white flex items-center justify-center text-sm font-semibold">
                1
              </div>
              <span className="text-sm font-medium">Interview Type</span>
            </div>
            <div className="flex-1 h-1 bg-surface rounded-full overflow-hidden">
              <div className="h-full bg-indigo-500 w-1/2" />
            </div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-surface text-secondary flex items-center justify-center text-sm font-semibold">
                2
              </div>
              <span className="text-sm font-medium text-secondary">Practice Mode</span>
            </div>
          </div>
        </motion.div>

        <div className="space-y-12">
          {/* Interview Type Selection */}
          <motion.section variants={fadeInUp}>
            <h2 className="text-xs font-semibold text-tertiary uppercase tracking-wider mb-6">
              Select Interview Type
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <AnimatePresence mode="wait">
                {INTERVIEW_TYPES.map((type) => (
                  <motion.button
                    key={type.value}
                    onClick={() => setSelectedType(type.value)}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    transition={selectionSpring}
                    className={`
                      relative p-6 rounded-xl text-left transition-all
                      ${
                        selectedType === type.value
                          ? 'bg-surface border-2 border-indigo-500 shadow-lg shadow-indigo-500/20'
                          : 'bg-surface border border-default hover:border-hover'
                      }
                    `}
                  >
                    <div className="flex items-start gap-4">
                      <div className="text-3xl">{type.icon}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <h3 className="font-semibold text-lg text-primary">
                            {type.label}
                          </h3>
                          {selectedType === type.value && (
                            <motion.div
                              initial={{ scale: 0 }}
                              animate={{ scale: 1 }}
                              transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                              className="w-6 h-6 rounded-full bg-indigo-500 flex items-center justify-center flex-shrink-0"
                            >
                              <Check className="w-4 h-4 text-white" />
                            </motion.div>
                          )}
                        </div>
                        <p className="text-sm text-secondary mb-3 leading-relaxed">
                          {type.description}
                        </p>
                        <div className="flex items-center gap-2 text-xs text-tertiary">
                          <Clock className="w-3.5 h-3.5" />
                          {type.duration}
                        </div>
                      </div>
                    </div>
                  </motion.button>
                ))}
              </AnimatePresence>
            </div>
          </motion.section>

          {/* Practice Mode Selection */}
          <motion.section variants={fadeInUp}>
            <h2 className="text-xs font-semibold text-tertiary uppercase tracking-wider mb-6">
              Choose Practice Mode
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {INTERVIEW_MODES.map((mode) => (
                <motion.button
                  key={mode.value}
                  onClick={() => setSelectedMode(mode.value)}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  transition={selectionSpring}
                  className={`
                    p-6 rounded-xl text-left transition-all
                    ${
                      selectedMode === mode.value
                        ? 'bg-surface border-2 border-indigo-500 shadow-lg shadow-indigo-500/20'
                        : 'bg-surface border border-default hover:border-hover'
                    }
                  `}
                >
                  <div className="text-3xl mb-4">{mode.icon}</div>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold text-primary">{mode.label}</h3>
                    {selectedMode === mode.value && (
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                        className="w-5 h-5 rounded-full bg-indigo-500 flex items-center justify-center"
                      >
                        <Check className="w-3 h-3 text-white" />
                      </motion.div>
                    )}
                  </div>
                  <p className="text-xs text-secondary leading-relaxed">
                    {mode.description}
                  </p>
                </motion.button>
              ))}
            </div>
          </motion.section>

          {/* Summary & Start Button */}
          <motion.section variants={fadeInUp}>
            <Card variant="glow" padding="lg" className="backdrop-blur-sm">
              <div className="flex flex-col md:flex-row items-center justify-between gap-6">
                <div>
                  <h3 className="text-lg font-semibold text-primary mb-2">
                    Ready to begin?
                  </h3>
                  <div className="flex flex-wrap items-center gap-3 text-sm text-secondary">
                    <span className="flex items-center gap-2">
                      <span className="text-xl">{selectedTypeData?.icon}</span>
                      {selectedTypeData?.label}
                    </span>
                    <span className="text-tertiary">•</span>
                    <span>{selectedModeData?.label}</span>
                    <span className="text-tertiary">•</span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" />
                      {selectedTypeData?.duration}
                    </span>
                  </div>
                </div>

                <Button
                  onClick={handleStartInterview}
                  variant="glow"
                  size="lg"
                  className="group whitespace-nowrap"
                >
                  Start interview
                  <ArrowRight className="w-5 h-5 transition-transform group-hover:translate-x-1" />
                </Button>
              </div>
            </Card>
          </motion.section>
        </div>
      </motion.div>
    </div>
  );
}
