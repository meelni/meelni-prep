'use client';

import { useState } from 'react';
import { CelebrationModal } from '@/components/interview/celebration-modal';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';

export default function TestCelebration() {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [scenario, setScenario] = useState<'first' | 'streak' | 'regular'>('first');

  const scenarios = {
    first: {
      duration: 22,
      questionCount: 8,
      estimatedScore: 86,
      isFirstSession: true,
      streakDays: 1,
    },
    streak: {
      duration: 18,
      questionCount: 6,
      estimatedScore: 92,
      isFirstSession: false,
      streakDays: 3,
    },
    regular: {
      duration: 25,
      questionCount: 10,
      estimatedScore: 78,
      isFirstSession: false,
      streakDays: 1,
    },
  };

  const mockData = scenarios[scenario];

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-2xl mx-auto space-y-8">
        <div>
          <h1 className="text-3xl font-bold mb-2">Celebration Modal Test</h1>
          <p className="text-muted-foreground">
            Test different celebration modal scenarios
          </p>
        </div>

        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold mb-3">Select Scenario</h2>
            <div className="flex gap-3">
              <Button
                onClick={() => setScenario('first')}
                variant={scenario === 'first' ? 'default' : 'outline'}
              >
                First Session
              </Button>
              <Button
                onClick={() => setScenario('streak')}
                variant={scenario === 'streak' ? 'default' : 'outline'}
              >
                3-Day Streak
              </Button>
              <Button
                onClick={() => setScenario('regular')}
                variant={scenario === 'regular' ? 'default' : 'outline'}
              >
                Regular Session
              </Button>
            </div>
          </div>

          <div className="p-6 bg-card border border-border rounded-lg space-y-3">
            <h3 className="font-semibold">Current Scenario Data:</h3>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <span className="text-muted-foreground">Duration:</span>{' '}
                {mockData.duration} min
              </div>
              <div>
                <span className="text-muted-foreground">Questions:</span>{' '}
                {mockData.questionCount}
              </div>
              <div>
                <span className="text-muted-foreground">Score:</span>{' '}
                {mockData.estimatedScore}/100
              </div>
              <div>
                <span className="text-muted-foreground">First Session:</span>{' '}
                {mockData.isFirstSession ? 'Yes' : 'No'}
              </div>
              <div>
                <span className="text-muted-foreground">Streak:</span>{' '}
                {mockData.streakDays} days
              </div>
            </div>
          </div>

          <Button onClick={() => setIsOpen(true)} size="lg" className="w-full">
            Show Celebration Modal
          </Button>
        </div>

        <div className="border-t border-border pt-6 space-y-3">
          <h3 className="font-semibold">Expected Badges:</h3>
          <div className="text-sm text-muted-foreground space-y-2">
            {scenario === 'first' && (
              <div className="flex items-center gap-2">
                <span>🎉</span> First Interview badge (new)
              </div>
            )}
            {scenario === 'streak' && (
              <>
                <div className="flex items-center gap-2">
                  <span>🔥</span> 3 Day Streak badge (new)
                </div>
              </>
            )}
            {scenario === 'regular' && (
              <div className="text-muted-foreground italic">No badges earned</div>
            )}
          </div>
        </div>
      </div>

      <CelebrationModal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        sessionData={mockData}
        onReturnToDashboard={() => {
          console.log('Return to dashboard');
          setIsOpen(false);
          router.push('/dashboard');
        }}
        onStartAnother={() => {
          console.log('Start another');
          setIsOpen(false);
          router.push('/setup');
        }}
      />
    </div>
  );
}
