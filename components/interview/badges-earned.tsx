'use client';

import { motion } from 'framer-motion';
import { Badge } from '@/components/ui/badge';

interface BadgeItem {
  id: string;
  title: string;
  description: string;
  icon: string;
  isNew: boolean;
}

interface BadgesEarnedProps {
  badges: BadgeItem[];
}

export function BadgesEarned({ badges }: BadgesEarnedProps) {
  return (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {badges.map((badge, index) => (
        <motion.div
          key={badge.id}
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: index * 0.1, duration: 0.3 }}
          className="relative flex-shrink-0"
        >
          <div className="w-24 h-24 rounded-xl bg-card border border-border flex flex-col items-center justify-center p-2 hover:border-primary/30 transition-colors">
            <span className="text-3xl mb-1">{badge.icon}</span>
            <span className="text-xs font-medium text-center leading-tight">
              {badge.title}
            </span>
          </div>
          {badge.isNew && (
            <Badge
              variant="success"
              className="absolute -top-2 -right-2 text-xs px-2 py-0.5"
            >
              New!
            </Badge>
          )}
        </motion.div>
      ))}
    </div>
  );
}
