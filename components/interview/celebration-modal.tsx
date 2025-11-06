'use client';

import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { SessionStatsCard } from './session-stats-card';
import { BadgesEarned } from './badges-earned';
import { motion, AnimatePresence } from 'framer-motion';
import { Home, Plus, Sparkles } from 'lucide-react';

interface CelebrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  sessionData: {
    duration: number;
    questionCount: number;
    estimatedScore?: number;
    isFirstSession: boolean;
    streakDays: number;
  };
  onReturnToDashboard: () => void;
  onStartAnother: () => void;
}

export function CelebrationModal({
  isOpen,
  onClose,
  sessionData,
  onReturnToDashboard,
  onStartAnother,
}: CelebrationModalProps) {
  const badges = [];

  if (sessionData.isFirstSession) {
    badges.push({
      id: 'first-session',
      title: 'First Interview',
      description: 'Completed your first mock interview',
      icon: '🎉',
      isNew: true,
    });
  }

  if (sessionData.streakDays >= 3) {
    badges.push({
      id: 'streak-3',
      title: '3 Day Streak',
      description: 'Practiced 3 days in a row',
      icon: '🔥',
      isNew: sessionData.streakDays === 3,
    });
  }

  if (sessionData.streakDays >= 7) {
    badges.push({
      id: 'streak-7',
      title: '7 Day Streak',
      description: 'Practiced 7 days in a row',
      icon: '⭐',
      isNew: sessionData.streakDays === 7,
    });
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <Dialog open={isOpen} onOpenChange={onClose}>
          <DialogContent className="max-w-[500px] p-0 overflow-hidden">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="relative"
            >
              {/* Confetti placeholder - will be added in Task 2.2 */}

              {/* Header */}
              <div className="bg-gradient-to-br from-primary/20 via-primary/5 to-transparent p-8 pb-6">
                <motion.div
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.1 }}
                  className="text-center"
                >
                  <Sparkles className="w-12 h-12 mx-auto mb-4 text-primary" />
                  <h2 className="text-2xl font-semibold mb-2">
                    Interview Complete!
                  </h2>
                  <p className="text-muted-foreground">
                    Great job! Here&apos;s how you did:
                  </p>
                </motion.div>
              </div>

              {/* Stats */}
              <div className="px-8 py-6">
                <SessionStatsCard
                  duration={sessionData.duration}
                  questionCount={sessionData.questionCount}
                  estimatedScore={sessionData.estimatedScore}
                />
              </div>

              {/* Badges */}
              {badges.length > 0 && (
                <div className="px-8 pb-6">
                  <h3 className="text-sm font-semibold mb-3">Badges Earned</h3>
                  <BadgesEarned badges={badges} />
                </div>
              )}

              {/* Next Steps */}
              <div className="px-8 pb-6">
                <h3 className="text-sm font-semibold mb-3">Next Steps</h3>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li className="flex items-start gap-2">
                    <span className="text-primary">•</span>
                    Review your performance on the dashboard
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-primary">•</span>
                    Try a different interview type for variety
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-primary">•</span>
                    Practice daily to build your streak
                  </li>
                </ul>
              </div>

              {/* CTAs */}
              <div className="px-8 pb-8 flex flex-col sm:flex-row gap-3">
                <Button
                  onClick={onReturnToDashboard}
                  variant="default"
                  size="lg"
                  className="flex-1"
                >
                  <Home className="mr-2 w-4 h-4" />
                  Return to Dashboard
                </Button>
                <Button
                  onClick={onStartAnother}
                  variant="outline"
                  size="lg"
                  className="flex-1"
                >
                  <Plus className="mr-2 w-4 h-4" />
                  Start Another
                </Button>
              </div>
            </motion.div>
          </DialogContent>
        </Dialog>
      )}
    </AnimatePresence>
  );
}
