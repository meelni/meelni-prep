'use client';

import { siteConfig } from '@/lib/config';
import Link from 'next/link';

export function Footer() {
  return (
    <footer className="border-t border-border bg-background">
      <div className="container mx-auto max-w-6xl px-6 py-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Brand */}
          <div className="space-y-4">
            <h3 className="font-bold text-lg">{siteConfig.footer.brandText}</h3>
            <p className="text-sm text-muted-foreground max-w-xs">
              {siteConfig.description}
            </p>
          </div>

          {/* Links */}
          <div className="space-y-4">
            <h4 className="font-semibold text-sm">Links</h4>
            <ul className="space-y-2">
              {siteConfig.footer.links.map((link) => (
                <li key={link.text}>
                  <Link
                    href={link.url}
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {link.text}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Contact */}
          <div className="space-y-4">
            <h4 className="font-semibold text-sm">Contact</h4>
            <p className="text-sm text-muted-foreground">
              <a
                href={`mailto:${siteConfig.links.email}`}
                className="hover:text-foreground transition-colors"
              >
                {siteConfig.links.email}
              </a>
            </p>
          </div>
        </div>

        <div className="mt-12 pt-8 border-t border-border text-center">
          <p className="text-sm text-muted-foreground">
            {siteConfig.footer.bottomText}
          </p>
        </div>
      </div>
    </footer>
  );
}
