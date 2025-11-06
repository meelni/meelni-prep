'use client';

import { ProgressRing } from '@/components/ui/progress-ring';
import { TrendingUp, Target, Zap, Award, Trophy, Star } from 'lucide-react';

export default function TestProgressRing() {
  return (
    <div className="p-8 space-y-12 bg-background min-h-screen">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">Progress Ring Component Test</h1>
        <p className="text-muted-foreground mb-8">
          Testing SVG-based circular progress indicators with spring animations
        </p>

        <section className="mb-12">
          <h2 className="text-xl font-semibold mb-4">Basic Examples</h2>
          <p className="text-sm text-muted-foreground mb-6">
            Default size (80px) with various progress values
          </p>
          <div className="flex gap-8 flex-wrap">
            <div className="text-center">
              <ProgressRing progress={75}>
                <TrendingUp className="w-6 h-6 text-primary" />
              </ProgressRing>
              <p className="text-xs mt-2 text-muted-foreground">75%</p>
            </div>

            <div className="text-center">
              <ProgressRing progress={85}>
                <Target className="w-6 h-6 text-primary" />
              </ProgressRing>
              <p className="text-xs mt-2 text-muted-foreground">85%</p>
            </div>

            <div className="text-center">
              <ProgressRing progress={60}>
                <Zap className="w-6 h-6 text-primary" />
              </ProgressRing>
              <p className="text-xs mt-2 text-muted-foreground">60%</p>
            </div>

            <div className="text-center">
              <ProgressRing progress={92}>
                <Award className="w-6 h-6 text-primary" />
              </ProgressRing>
              <p className="text-xs mt-2 text-muted-foreground">92%</p>
            </div>
          </div>
        </section>

        <section className="mb-12">
          <h2 className="text-xl font-semibold mb-4">With Percentage Display</h2>
          <p className="text-sm text-muted-foreground mb-6">
            Showing percentage inside the ring instead of icons
          </p>
          <div className="flex gap-8 flex-wrap">
            <ProgressRing progress={45} showPercentage />
            <ProgressRing progress={75} showPercentage />
            <ProgressRing progress={90} showPercentage />
            <ProgressRing progress={100} showPercentage />
          </div>
        </section>

        <section className="mb-12">
          <h2 className="text-xl font-semibold mb-4">Different Sizes</h2>
          <p className="text-sm text-muted-foreground mb-6">
            Small (60px), Medium (80px), Large (120px)
          </p>
          <div className="flex gap-8 items-end flex-wrap">
            <div className="text-center">
              <ProgressRing progress={70} size={60} strokeWidth={3}>
                <Award className="w-4 h-4 text-primary" />
              </ProgressRing>
              <p className="text-xs mt-2 text-muted-foreground">Small</p>
            </div>

            <div className="text-center">
              <ProgressRing progress={70} size={80} strokeWidth={4}>
                <Award className="w-6 h-6 text-primary" />
              </ProgressRing>
              <p className="text-xs mt-2 text-muted-foreground">Medium</p>
            </div>

            <div className="text-center">
              <ProgressRing progress={70} size={120} strokeWidth={6}>
                <Award className="w-8 h-8 text-primary" />
              </ProgressRing>
              <p className="text-xs mt-2 text-muted-foreground">Large</p>
            </div>
          </div>
        </section>

        <section className="mb-12">
          <h2 className="text-xl font-semibold mb-4">Staggered Animation</h2>
          <p className="text-sm text-muted-foreground mb-6">
            Each ring animates 150ms after the previous one
          </p>
          <div className="flex gap-8 flex-wrap">
            {[85, 72, 90, 78, 95].map((progress, index) => (
              <div key={index} className="text-center">
                <ProgressRing
                  progress={progress}
                  delay={index * 150}
                >
                  <TrendingUp className="w-6 h-6 text-primary" />
                </ProgressRing>
                <p className="text-xs mt-2 text-muted-foreground">
                  Delay: {index * 150}ms
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="mb-12">
          <h2 className="text-xl font-semibold mb-4">Custom Colors</h2>
          <p className="text-sm text-muted-foreground mb-6">
            Using different color variants
          </p>
          <div className="flex gap-8 flex-wrap">
            <div className="text-center">
              <ProgressRing
                progress={75}
                color="oklch(0.70 0.22 285)"
              >
                <Trophy className="w-6 h-6" style={{ color: 'oklch(0.70 0.22 285)' }} />
              </ProgressRing>
              <p className="text-xs mt-2 text-muted-foreground">Primary</p>
            </div>

            <div className="text-center">
              <ProgressRing
                progress={85}
                color="oklch(0.72 0.18 145)"
              >
                <Star className="w-6 h-6" style={{ color: 'oklch(0.72 0.18 145)' }} />
              </ProgressRing>
              <p className="text-xs mt-2 text-muted-foreground">Success</p>
            </div>

            <div className="text-center">
              <ProgressRing
                progress={60}
                color="oklch(0.75 0.20 75)"
              >
                <Zap className="w-6 h-6" style={{ color: 'oklch(0.75 0.20 75)' }} />
              </ProgressRing>
              <p className="text-xs mt-2 text-muted-foreground">Warning</p>
            </div>

            <div className="text-center">
              <ProgressRing
                progress={90}
                color="oklch(0.68 0.20 240)"
              >
                <Target className="w-6 h-6" style={{ color: 'oklch(0.68 0.20 240)' }} />
              </ProgressRing>
              <p className="text-xs mt-2 text-muted-foreground">Info</p>
            </div>
          </div>
        </section>

        <section className="mb-12">
          <h2 className="text-xl font-semibold mb-4">Edge Cases</h2>
          <p className="text-sm text-muted-foreground mb-6">
            Testing 0%, 100%, and out-of-bounds values
          </p>
          <div className="flex gap-8 flex-wrap">
            <div className="text-center">
              <ProgressRing progress={0}>
                <TrendingUp className="w-6 h-6 text-muted-foreground" />
              </ProgressRing>
              <p className="text-xs mt-2 text-muted-foreground">0%</p>
            </div>

            <div className="text-center">
              <ProgressRing progress={100}>
                <TrendingUp className="w-6 h-6 text-primary" />
              </ProgressRing>
              <p className="text-xs mt-2 text-muted-foreground">100%</p>
            </div>

            <div className="text-center">
              <ProgressRing progress={-20}>
                <TrendingUp className="w-6 h-6 text-muted-foreground" />
              </ProgressRing>
              <p className="text-xs mt-2 text-muted-foreground">-20% (clamped to 0)</p>
            </div>

            <div className="text-center">
              <ProgressRing progress={120}>
                <TrendingUp className="w-6 h-6 text-primary" />
              </ProgressRing>
              <p className="text-xs mt-2 text-muted-foreground">120% (clamped to 100)</p>
            </div>
          </div>
        </section>

        <section className="mb-12">
          <h2 className="text-xl font-semibold mb-4">Animation Timing</h2>
          <p className="text-sm text-muted-foreground mb-6">
            Different animation durations (fast, default, slow)
          </p>
          <div className="flex gap-8 flex-wrap">
            <div className="text-center">
              <ProgressRing progress={75} duration={600}>
                <Zap className="w-6 h-6 text-primary" />
              </ProgressRing>
              <p className="text-xs mt-2 text-muted-foreground">Fast (600ms)</p>
            </div>

            <div className="text-center">
              <ProgressRing progress={75} duration={1200}>
                <Target className="w-6 h-6 text-primary" />
              </ProgressRing>
              <p className="text-xs mt-2 text-muted-foreground">Default (1200ms)</p>
            </div>

            <div className="text-center">
              <ProgressRing progress={75} duration={2000}>
                <Trophy className="w-6 h-6 text-primary" />
              </ProgressRing>
              <p className="text-xs mt-2 text-muted-foreground">Slow (2000ms)</p>
            </div>
          </div>
        </section>

        <section className="mb-12">
          <h2 className="text-xl font-semibold mb-4">Stats Card Mockup</h2>
          <p className="text-sm text-muted-foreground mb-6">
            Example usage in dashboard stats cards
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="p-6 rounded-xl border border-border bg-card flex flex-col items-center gap-3">
              <ProgressRing progress={75}>
                <TrendingUp className="w-6 h-6 text-primary" />
              </ProgressRing>
              <div className="text-2xl font-bold">75%</div>
              <div className="text-sm text-muted-foreground">Completion Rate</div>
            </div>

            <div className="p-6 rounded-xl border border-border bg-card flex flex-col items-center gap-3">
              <ProgressRing progress={85} delay={100}>
                <Target className="w-6 h-6 text-primary" />
              </ProgressRing>
              <div className="text-2xl font-bold">24</div>
              <div className="text-sm text-muted-foreground">Total Sessions</div>
            </div>

            <div className="p-6 rounded-xl border border-border bg-card flex flex-col items-center gap-3">
              <ProgressRing progress={92} delay={200}>
                <Award className="w-6 h-6 text-primary" />
              </ProgressRing>
              <div className="text-2xl font-bold">7.8</div>
              <div className="text-sm text-muted-foreground">Average Score</div>
            </div>
          </div>
        </section>

        <section className="mb-12">
          <h2 className="text-xl font-semibold mb-4">Performance Test</h2>
          <p className="text-sm text-muted-foreground mb-6">
            20 simultaneous animations with staggering - should maintain 60fps
          </p>
          <div className="flex gap-4 flex-wrap">
            {Array.from({ length: 20 }, (_, i) => (
              <ProgressRing
                key={i}
                progress={50 + (i * 2.5)}
                size={60}
                strokeWidth={3}
                delay={i * 50}
              >
                <Star className="w-4 h-4 text-primary" />
              </ProgressRing>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
