"use client";

import { motion } from "framer-motion";
import { ArrowRight, ArrowLeft, Clock, Settings, Mic } from "lucide-react";
import { Users, Lightbulb, Target, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  InterviewConfig,
  ROUND_TYPES,
  DIFFICULTY_LEVELS,
  RoundType,
  DifficultyLevel,
} from "@/lib/interview-config";
import { fadeInUp, staggerContainer } from "@/lib/animations";

interface SetupSummaryProps {
  roundType: RoundType;
  difficulty: DifficultyLevel;
  config: InterviewConfig;
  voiceName?: string;
  onStart: () => void;
  onBack?: () => void;
  isLoading?: boolean;
}

const iconMap = {
  Users,
  Lightbulb,
  Target,
  TrendingUp,
};

export function SetupSummary({
  roundType,
  difficulty,
  config,
  voiceName = "Tessa",
  onStart,
  onBack,
  isLoading = false,
}: SetupSummaryProps) {
  const roundConfig = ROUND_TYPES[roundType];
  const difficultyConfig = DIFFICULTY_LEVELS[difficulty];
  const Icon = iconMap[roundConfig.icon as keyof typeof iconMap];

  return (
    <motion.div
      variants={staggerContainer}
      initial="initial"
      animate="animate"
      className="space-y-6"
    >
      {/* Main Summary Card */}
      <motion.div variants={fadeInUp}>
        <Card className="p-8">
          <div className="space-y-6">
            {/* Title */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold">Ready to start?</h2>
                <Badge className="text-xs px-3 py-1">
                  <Clock className="w-3 h-3 mr-1" />
                  30-45 min
                </Badge>
              </div>
              <p className="text-muted-foreground">
                Review your interview setup before beginning
              </p>
            </div>

            {/* Interview Type */}
            <div className="flex items-start gap-4 p-4 rounded-lg bg-muted/50">
              <div className="p-3 rounded-lg bg-primary/10">
                <Icon className="w-6 h-6 text-primary" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-semibold">{roundConfig.label}</h3>
                  <Badge>{difficultyConfig.label}</Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  {roundConfig.description}
                </p>
              </div>
            </div>

            {/* Details Grid */}
            <div className="grid gap-4 md:grid-cols-2">
              {/* Duration */}
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-muted">
                  <Clock className="w-4 h-4 text-muted-foreground" />
                </div>
                <div>
                  <div className="text-sm font-medium">Duration</div>
                  <div className="text-sm text-muted-foreground">
                    ~{config.duration} minutes
                  </div>
                </div>
              </div>

              {/* Voice */}
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-muted">
                  <Mic className="w-4 h-4 text-muted-foreground" />
                </div>
                <div>
                  <div className="text-sm font-medium">AI Interviewer</div>
                  <div className="text-sm text-muted-foreground">
                    {voiceName} • {config.emotion}
                  </div>
                </div>
              </div>

              {/* Feedback Mode */}
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-muted">
                  <Settings className="w-4 h-4 text-muted-foreground" />
                </div>
                <div>
                  <div className="text-sm font-medium">Feedback</div>
                  <div className="text-sm text-muted-foreground">
                    {config.feedback_mode === "real_time"
                      ? "Real-time feedback"
                      : config.feedback_mode === "end_only"
                      ? "After completion"
                      : "Silent mode"}
                  </div>
                </div>
              </div>

              {/* Speech Speed */}
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-muted">
                  <Settings className="w-4 h-4 text-muted-foreground" />
                </div>
                <div>
                  <div className="text-sm font-medium">Speech Speed</div>
                  <div className="text-sm text-muted-foreground">
                    {config.speed}x
                  </div>
                </div>
              </div>
            </div>

            {/* Tips */}
            <div className="p-4 rounded-lg bg-primary/5 border border-primary/20">
              <h4 className="font-medium text-sm mb-2">💡 Tips for Success</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• Find a quiet space with good internet connection</li>
                <li>• Test your microphone before starting</li>
                <li>• Treat this like a real interview - stay focused</li>
                <li>
                  • Don't worry about perfection - this is practice to improve
                </li>
              </ul>
            </div>
          </div>
        </Card>
      </motion.div>

      {/* Start Button */}
      <motion.div variants={fadeInUp} className="flex gap-3">
        {onBack && (
          <Button
            onClick={onBack}
            variant="outline"
            size="lg"
            className="h-14 px-6"
            disabled={isLoading}
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
        )}
        <Button
          onClick={onStart}
          disabled={isLoading}
          size="lg"
          className="flex-1 h-14 text-base"
        >
          {isLoading ? (
            <>
              <motion.div
                className="w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-2"
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
              />
              Starting Interview...
            </>
          ) : (
            <>
              Start Interview
              <ArrowRight className="w-5 h-5 ml-2" />
            </>
          )}
        </Button>
      </motion.div>

      {/* Privacy note */}
      <motion.div variants={fadeInUp}>
        <p className="text-xs text-center text-muted-foreground">
          Your conversation will be recorded and analyzed to provide feedback.
          All data is encrypted and stored securely.
        </p>
      </motion.div>
    </motion.div>
  );
}
