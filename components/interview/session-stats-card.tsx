'use client';

import { AnimatedNumber } from '@/components/ui/animated-number';
import { Clock, MessageSquare, TrendingUp } from 'lucide-react';

interface SessionStatsCardProps {
  duration: number; // minutes
  questionCount: number;
  estimatedScore?: number;
}

export function SessionStatsCard({
  duration,
  questionCount,
  estimatedScore,
}: SessionStatsCardProps) {
  return (
    <div className="grid grid-cols-3 gap-4">
      {/* Duration */}
      <div className="text-center">
        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-2">
          <Clock className="w-5 h-5 text-primary" />
        </div>
        <div className="text-2xl font-bold">
          <AnimatedNumber value={duration} suffix=" min" />
        </div>
        <div className="text-xs text-muted-foreground">Duration</div>
      </div>

      {/* Questions */}
      <div className="text-center">
        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-2">
          <MessageSquare className="w-5 h-5 text-primary" />
        </div>
        <div className="text-2xl font-bold">
          <AnimatedNumber value={questionCount} />
        </div>
        <div className="text-xs text-muted-foreground">Questions</div>
      </div>

      {/* Score (placeholder) */}
      {estimatedScore !== undefined && (
        <div className="text-center">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-2">
            <TrendingUp className="w-5 h-5 text-primary" />
          </div>
          <div className="text-2xl font-bold">
            <AnimatedNumber value={estimatedScore} suffix="/100" />
          </div>
          <div className="text-xs text-muted-foreground">Est. Score</div>
        </div>
      )}
    </div>
  );
}
