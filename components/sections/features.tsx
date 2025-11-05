'use client';

import { Section } from '@/components/section';
import { siteConfig } from '@/lib/config';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';

export function Features() {
  const features = siteConfig.features;

  return (
    <Section
      id="features"
      title="Features"
      subtitle="Everything you need to ace your PM interviews"
      align="center"
    >
      <div className="border-x border-b">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
          {features.map(({ name, description, icon: Icon }, index) => (
            <motion.div
              key={index}
              className={cn(
                'flex flex-col gap-y-4 items-center justify-center py-12 px-6 border-b transition-colors hover:bg-indigo-500/5',
                'last:border-b-0',
                'md:[&:nth-child(2n+1)]:border-r md:[&:nth-child(n+5)]:border-b-0',
                'lg:[&:nth-child(3n)]:border-r-0 lg:[&:nth-child(n+4)]:border-b-0 lg:border-r'
              )}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-50px' }}
              transition={{ delay: index * 0.1, duration: 0.5 }}
            >
              <div className="flex flex-col gap-y-3 items-center">
                <div className="bg-gradient-to-b from-indigo-500 to-indigo-600 p-3 rounded-xl text-white shadow-lg">
                  {Icon}
                </div>
                <h2 className="text-lg font-semibold text-foreground text-center text-balance">
                  {name}
                </h2>
              </div>
              <p className="text-sm text-muted-foreground text-balance text-center max-w-xs">
                {description}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </Section>
  );
}
