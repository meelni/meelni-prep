'use client';

import { Section } from '@/components/section';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

export function CTA() {
  return (
    <Section id="cta">
      <div className="border overflow-hidden relative text-center py-20 px-6 mx-auto bg-gradient-to-br from-indigo-500/10 via-purple-500/5 to-background">
        <h2 className="max-w-3xl text-foreground mb-6 text-balance mx-auto font-bold text-3xl md:text-4xl tracking-tight">
          Ready to ace your next PM interview?
        </h2>
        <p className="text-muted-foreground mb-8 text-lg max-w-2xl mx-auto">
          Start practicing with AI today. No credit card required.
        </p>

        <div className="flex justify-center gap-4">
          <Link href="/setup">
            <Button variant="glow" size="lg">
              Start Practicing Now
            </Button>
          </Link>
        </div>
      </div>
    </Section>
  );
}
