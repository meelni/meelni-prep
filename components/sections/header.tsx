'use client';

import { Button } from '@/components/ui/button';
import { siteConfig } from '@/lib/config';
import { Sparkles } from 'lucide-react';
import Link from 'next/link';

export function Header() {
  return (
    <header className="sticky top-0 h-16 z-50 p-0 bg-background/60 backdrop-blur-xl border-b border-border">
      <div className="flex justify-between items-center container mx-auto px-6 h-full max-w-6xl">
        <Link
          href="/"
          title="MockMate"
          className="relative flex items-center space-x-2 group"
        >
          <div className="p-1.5 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <span className="font-bold text-xl tracking-tight">
            {siteConfig.name}
          </span>
        </Link>

        <Link href="/setup">
          <Button variant="glow" size="md">
            {siteConfig.cta}
          </Button>
        </Link>
      </div>
    </header>
  );
}
