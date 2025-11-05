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
  voice: '6ccbfb76-1fc6-48f7-b71d-91ac6298247b',  // Tessa - emotive voice
  speed: 1.0,
  emotion: 'Confident',
  volume: 1.0,
  ttsModel: 'sonic-3',
  sttModel: 'deepgram/nova-3',
  llmModel: 'openai/gpt-4.1-mini',
};

// Interview type configurations
const INTERVIEW_TYPES = [
  {
    value: 'product_sense',
    label: 'Product Sense',
    icon: '💡',
    description: 'Design features and improve products',
    duration: '45 min',
  },
  {
    value: 'analytical_thinking',
    label: 'Analytical Thinking',
    icon: '📊',
    description: 'Define metrics and analyze performance',
    duration: '45 min',
  },
  {
    value: 'leadership_drive',
    label: 'Leadership & Drive',
    icon: '🎯',
    description: 'Behavioral questions using STAR',
    duration: '30 min',
  },
  {
    value: 'strategy',
    label: 'Strategy',
    icon: '🗺️',
    description: 'Business and strategic discussions',
    duration: '45 min',
  },
];

// Interview modes
const INTERVIEW_MODES = [
  {
    value: 'mock_interview',
    label: 'Mock Interview',
    icon: '🎬',
    description: 'Full realistic interview experience',
  },
  {
    value: 'practice',
    label: 'Quick Practice',
    icon: '⚡',
    description: 'Focused practice on specific areas',
  },
  {
    value: 'learning',
    label: 'Learning Mode',
    icon: '📚',
    description: 'Learn frameworks step-by-step',
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
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="border-b border-default backdrop-blur-sm bg-background/80 sticky top-0 z-50"
      >
        <div className="max-w-4xl mx-auto px-6 py-3 flex items-center justify-between">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-xs text-secondary hover:text-primary transition-colors group"
          >
            <ArrowLeft className="w-3.5 h-3.5 transition-transform group-hover:-translate-x-0.5" />
            Back
          </Link>

          <Badge variant="primary" size="sm">
            <Clock className="w-3 h-3" />
            ~45 min
          </Badge>
        </div>
      </motion.header>

      <motion.div
        initial="initial"
        animate="animate"
        variants={staggerContainer}
        className="max-w-4xl mx-auto px-6 py-8"
      >
        {/* Title Section */}
        <motion.div variants={fadeInUp} className="mb-8">
          <h1 className="text-2xl font-bold mb-2 tracking-tight">
            <span className="gradient-text">Start your session</span>
          </h1>
          <p className="text-sm text-secondary">Choose your interview type and practice mode</p>
        </motion.div>

        {/* Progress Indicator */}
        <motion.div variants={fadeInUp} className="mb-8">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 rounded-full bg-indigo-500 text-white flex items-center justify-center text-xs font-semibold">
                1
              </div>
              <span className="text-xs font-medium hidden sm:inline">Interview Type</span>
            </div>
            <div className="flex-1 h-px bg-surface rounded-full overflow-hidden">
              <div className="h-full bg-indigo-500 w-1/2" />
            </div>
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 rounded-full bg-surface text-secondary flex items-center justify-center text-xs font-semibold">
                2
              </div>
              <span className="text-xs font-medium text-secondary hidden sm:inline">Mode</span>
            </div>
          </div>
        </motion.div>

        <div className="space-y-6">
          {/* Interview Type Selection */}
          <motion.section variants={fadeInUp}>
            <h2 className="text-[10px] font-semibold text-tertiary uppercase tracking-wider mb-3">
              Interview Type
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              {INTERVIEW_TYPES.map((type) => (
                <motion.button
                  key={type.value}
                  onClick={() => setSelectedType(type.value)}
                  whileHover={{ scale: 1.005 }}
                  whileTap={{ scale: 0.995 }}
                  transition={selectionSpring}
                  className={`
                    relative p-3.5 rounded-lg text-left transition-all
                    ${
                      selectedType === type.value
                        ? 'bg-surface border-2 border-indigo-500 shadow-md shadow-indigo-500/10'
                        : 'bg-surface border border-default hover:border-hover'
                    }
                  `}
                >
                  <div className="flex items-start gap-3">
                    <div className="text-xl mt-0.5">{type.icon}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <h3 className="font-semibold text-sm text-primary leading-tight">
                          {type.label}
                        </h3>
                        {selectedType === type.value && (
                          <motion.div
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                            className="w-4 h-4 rounded-full bg-indigo-500 flex items-center justify-center flex-shrink-0"
                          >
                            <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />
                          </motion.div>
                        )}
                      </div>
                      <p className="text-xs text-secondary mb-1.5 leading-snug">
                        {type.description}
                      </p>
                      <div className="flex items-center gap-1 text-[10px] text-tertiary">
                        <Clock className="w-2.5 h-2.5" />
                        {type.duration}
                      </div>
                    </div>
                  </div>
                </motion.button>
              ))}
            </div>
          </motion.section>

          {/* Practice Mode Selection */}
          <motion.section variants={fadeInUp}>
            <h2 className="text-[10px] font-semibold text-tertiary uppercase tracking-wider mb-3">
              Practice Mode
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
              {INTERVIEW_MODES.map((mode) => (
                <motion.button
                  key={mode.value}
                  onClick={() => setSelectedMode(mode.value)}
                  whileHover={{ scale: 1.005 }}
                  whileTap={{ scale: 0.995 }}
                  transition={selectionSpring}
                  className={`
                    p-3.5 rounded-lg text-left transition-all
                    ${
                      selectedMode === mode.value
                        ? 'bg-surface border-2 border-indigo-500 shadow-md shadow-indigo-500/10'
                        : 'bg-surface border border-default hover:border-hover'
                    }
                  `}
                >
                  <div className="text-xl mb-2.5">{mode.icon}</div>
                  <div className="flex items-center justify-between mb-1">
                    <h3 className="font-semibold text-sm text-primary leading-tight">
                      {mode.label}
                    </h3>
                    {selectedMode === mode.value && (
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                        className="w-4 h-4 rounded-full bg-indigo-500 flex items-center justify-center"
                      >
                        <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />
                      </motion.div>
                    )}
                  </div>
                  <p className="text-xs text-secondary leading-snug">{mode.description}</p>
                </motion.button>
              ))}
            </div>
          </motion.section>

          {/* Summary & Start Button */}
          <motion.section variants={fadeInUp}>
            <Card variant="glow" padding="md" className="backdrop-blur-sm">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <h3 className="text-sm font-semibold text-primary mb-1.5">Ready to begin?</h3>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-secondary">
                    <span className="flex items-center gap-1">
                      <span className="text-sm">{selectedTypeData?.icon}</span>
                      {selectedTypeData?.label}
                    </span>
                    <span className="text-tertiary">•</span>
                    <span>{selectedModeData?.label}</span>
                    <span className="text-tertiary">•</span>
                    <span className="flex items-center gap-0.5">
                      <Clock className="w-3 h-3" />
                      {selectedTypeData?.duration}
                    </span>
                  </div>
                </div>

                <Button
                  onClick={handleStartInterview}
                  variant="glow"
                  size="sm"
                  className="group whitespace-nowrap w-full sm:w-auto"
                >
                  Start interview
                  <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
                </Button>
              </div>
            </Card>
          </motion.section>
        </div>
      </motion.div>
    </div>
  );
}
