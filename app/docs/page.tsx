'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import SwaggerUIReact from 'swagger-ui-react';
import 'swagger-ui-react/swagger-ui.css';
import {
  Beaker,
  BookOpen,
  Download,
  Home,
  KeyRound,
} from 'lucide-react';

import {
  MarketingEyebrow,
  MarketingHero,
  MarketingPage,
} from '@/components/marketing/marketing-surface';
import {
  AppSurface,
  AppSurfaceDescription,
  AppSurfaceTitle,
  StatusPill,
} from '@/components/ui/app-surface';
import { Button } from '@/components/ui/button';
import { Header } from '@/components/sections/header';

const docLinks = [
  {
    href: '/docs/API.md',
    title: 'Full API Guide',
    description: 'Authentication, endpoints, response shapes, and examples.',
    icon: BookOpen,
    status: 'Guide',
  },
  {
    href: '/docs/AUTHENTICATION.md',
    title: 'Authentication',
    description: 'Token handling and identity flows for API integrations.',
    icon: KeyRound,
    status: 'Security',
  },
  {
    href: '/docs/TESTING.md',
    title: 'Testing Guide',
    description: 'Recommended checks for local and integration workflows.',
    icon: Beaker,
    status: 'Quality',
  },
  {
    href: '/docs/openapi.yaml',
    title: 'OpenAPI Spec',
    description: 'Download the machine-readable API contract.',
    icon: Download,
    status: 'YAML',
    download: true,
  },
];

export default function APIDocsPage() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Custom CSS for better integration with our design
    const style = document.createElement('style');
    style.innerHTML = `
      .swagger-ui {
        font-family: inherit;
      }

      .swagger-ui .topbar {
        display: none;
      }

      .swagger-ui .info {
        margin: 30px 0;
      }

      .swagger-ui .scheme-container {
        background: transparent;
        box-shadow: none;
        padding: 0;
      }
    `;
    document.head.appendChild(style);

    return () => {
      document.head.removeChild(style);
    };
  }, []);

  return (
    <MarketingPage>
      <Header />

      <main className="mx-auto max-w-6xl px-6 py-12">
        <MarketingHero
          eyebrow={
            <MarketingEyebrow icon={BookOpen}>Developer Docs</MarketingEyebrow>
          }
          title="API Documentation"
          description="Comprehensive API reference for the Meelni interview platform, including OpenAPI exploration and downloadable guides."
        />

        <div className="mb-8 flex justify-center">
          <Button asChild variant="outline">
            <Link href="/">
              <Home className="mr-2 h-4 w-4" />
              Back to Home
            </Link>
          </Button>
        </div>

        <div className="mb-10 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {docLinks.map((doc) => {
            const Icon = doc.icon;

            return (
              <a
                key={doc.href}
                href={doc.href}
                className="group block focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                target="_blank"
                rel="noopener noreferrer"
                download={doc.download}
              >
                <AppSurface className="h-full transition-all duration-200 group-hover:-translate-y-0.5 group-hover:border-primary/40 group-hover:shadow-md">
                  <div className="mb-4 flex items-start justify-between gap-4">
                    <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Icon className="h-5 w-5" />
                    </span>
                    <StatusPill tone="primary">{doc.status}</StatusPill>
                  </div>
                  <AppSurfaceTitle className="font-display text-base">
                    {doc.title}
                  </AppSurfaceTitle>
                  <AppSurfaceDescription className="mt-2 text-sm leading-relaxed">
                    {doc.description}
                  </AppSurfaceDescription>
                </AppSurface>
              </a>
            );
          })}
        </div>

        <AppSurface size="none" className="overflow-hidden">
          <div className="border-b border-border/60 p-6">
            <AppSurfaceTitle className="font-display text-2xl font-bold">
              Interactive Reference
            </AppSurfaceTitle>
            <AppSurfaceDescription className="mt-2 text-sm leading-relaxed">
              Explore endpoints, parameters, schemas, and request examples from the live OpenAPI contract.
            </AppSurfaceDescription>
          </div>
          <div ref={containerRef} className="p-4 sm:p-6">
            <SwaggerUIReact
              url="/docs/openapi.yaml"
              docExpansion="list"
              defaultModelsExpandDepth={1}
              deepLinking={true}
              displayOperationId={false}
              filter={true}
              showExtensions={true}
              showCommonExtensions={true}
              tryItOutEnabled={true}
            />
          </div>
        </AppSurface>
      </main>

      <footer className="border-t border-border/60 py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 text-sm text-muted-foreground sm:flex-row">
          <p>&copy; 2025 Meelni. All rights reserved.</p>
          <div className="flex gap-6">
            <a
              href="mailto:humans@conductor.build"
              className="transition-colors hover:text-foreground"
            >
              Support
            </a>
            <a
              href="https://github.com/your-repo"
              className="transition-colors hover:text-foreground"
              target="_blank"
              rel="noopener noreferrer"
            >
              GitHub
            </a>
          </div>
        </div>
      </footer>
    </MarketingPage>
  );
}
