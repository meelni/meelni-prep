"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import SwaggerUIReact from "swagger-ui-react";
import "swagger-ui-react/swagger-ui.css";
import { Beaker, BookOpen, Download, Home, KeyRound } from "lucide-react";

import {
  MarketingEyebrow,
  MarketingHero,
  MarketingPage,
} from "@/components/marketing/marketing-surface";
import {
  AppSurface,
  AppSurfaceDescription,
  AppSurfaceTitle,
  StatusPill,
} from "@/components/ui/app-surface";
import { Button } from "@/components/ui/button";
import { Header } from "@/components/sections/header";

const docLinks = [
  {
    href: "/docs/api/README.md",
    title: "Full API Guide",
    description: "Authentication, endpoints, response shapes, and examples.",
    icon: BookOpen,
    status: "Guide",
  },
  {
    href: "/docs/api/authentication.md",
    title: "Authentication",
    description: "Token handling and identity flows for API integrations.",
    icon: KeyRound,
    status: "Security",
  },
  {
    href: "/docs/development/testing.md",
    title: "Testing Guide",
    description: "Recommended checks for local and integration workflows.",
    icon: Beaker,
    status: "Quality",
  },
  {
    href: "/docs/openapi.yaml",
    title: "OpenAPI Spec",
    description: "Download the machine-readable API contract.",
    icon: Download,
    status: "YAML",
    download: true,
  },
];

export default function APIDocsPage() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Custom CSS for better integration with our design
    const style = document.createElement("style");
    style.innerHTML = `
      .swagger-ui {
        font-family: inherit;
        max-width: 100%;
        overflow-wrap: anywhere;
      }

      .swagger-ui .topbar {
        display: none;
      }

      .swagger-ui .wrapper {
        max-width: 100%;
        padding: 0;
      }

      .swagger-ui .info {
        margin: 30px 0;
      }

      .swagger-ui .scheme-container {
        background: transparent;
        box-shadow: none;
        padding: 0;
      }

      .swagger-ui .opblock-summary,
      .swagger-ui .opblock-summary-path,
      .swagger-ui .parameter__name,
      .swagger-ui .parameter__type,
      .swagger-ui .response-col_description {
        min-width: 0;
        overflow-wrap: anywhere;
        word-break: break-word;
      }

      .swagger-ui table {
        max-width: 100%;
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
                className="group focus-visible:ring-ring block focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
                target="_blank"
                rel="noopener noreferrer"
                download={doc.download}
              >
                <AppSurface className="group-hover:border-primary/40 h-full transition-all duration-200 group-hover:-translate-y-0.5 group-hover:shadow-md">
                  <div className="mb-4 flex items-start justify-between gap-4">
                    <span className="bg-primary/10 text-primary flex h-10 w-10 items-center justify-center rounded-lg">
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
          <div className="border-border/60 border-b p-6">
            <AppSurfaceTitle className="font-display text-2xl font-bold">
              Interactive Reference
            </AppSurfaceTitle>
            <AppSurfaceDescription className="mt-2 text-sm leading-relaxed">
              Explore endpoints, parameters, schemas, and request examples from
              the live OpenAPI contract.
            </AppSurfaceDescription>
          </div>
          <div
            ref={containerRef}
            className="max-w-full min-w-0 overflow-x-auto p-4 sm:p-6"
          >
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

      <footer className="border-border/60 border-t py-8">
        <div className="text-muted-foreground mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 text-sm sm:flex-row">
          <p>&copy; 2025 Meelni. All rights reserved.</p>
          <div className="flex gap-6">
            <a
              href="mailto:humans@conductor.build"
              className="hover:text-foreground transition-colors"
            >
              Support
            </a>
            <a
              href="https://github.com/your-repo"
              className="hover:text-foreground transition-colors"
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
