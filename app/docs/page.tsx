'use client';

import { useEffect, useRef } from 'react';
import SwaggerUIReact from 'swagger-ui-react';
import 'swagger-ui-react/swagger-ui.css';

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
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-50">
      {/* Header */}
      <header className="border-b border-gray-200 bg-white/80 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">MockMate API Documentation</h1>
              <p className="mt-2 text-gray-600">
                Comprehensive API reference for the MockMate interview platform
              </p>
            </div>
            <a
              href="/"
              className="inline-flex items-center gap-2 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-800"
            >
              ← Back to App
            </a>
          </div>
        </div>
      </header>

      {/* Quick Links */}
      <div className="border-b border-gray-200 bg-white">
        <div className="container mx-auto px-4 py-4">
          <div className="flex flex-wrap gap-4">
            <a
              href="/docs/API.md"
              className="inline-flex items-center gap-2 rounded-md bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-700 transition-colors hover:bg-blue-100"
              target="_blank"
              rel="noopener noreferrer"
            >
              📘 Full API Guide
            </a>
            <a
              href="/docs/AUTHENTICATION.md"
              className="inline-flex items-center gap-2 rounded-md bg-green-50 px-3 py-1.5 text-sm font-medium text-green-700 transition-colors hover:bg-green-100"
              target="_blank"
              rel="noopener noreferrer"
            >
              🔐 Authentication
            </a>
            <a
              href="/docs/TESTING.md"
              className="inline-flex items-center gap-2 rounded-md bg-purple-50 px-3 py-1.5 text-sm font-medium text-purple-700 transition-colors hover:bg-purple-100"
              target="_blank"
              rel="noopener noreferrer"
            >
              🧪 Testing Guide
            </a>
            <a
              href="/docs/openapi.yaml"
              className="inline-flex items-center gap-2 rounded-md bg-orange-50 px-3 py-1.5 text-sm font-medium text-orange-700 transition-colors hover:bg-orange-100"
              target="_blank"
              rel="noopener noreferrer"
              download
            >
              ⬇️ OpenAPI Spec
            </a>
          </div>
        </div>
      </div>

      {/* Swagger UI */}
      <div ref={containerRef} className="container mx-auto px-4 py-8">
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

      {/* Footer */}
      <footer className="border-t border-gray-200 bg-white py-8">
        <div className="container mx-auto px-4">
          <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
            <p className="text-sm text-gray-600">
              © 2025 MockMate. All rights reserved.
            </p>
            <div className="flex gap-6">
              <a
                href="mailto:humans@conductor.build"
                className="text-sm text-gray-600 transition-colors hover:text-gray-900"
              >
                Support
              </a>
              <a
                href="https://github.com/your-repo"
                className="text-sm text-gray-600 transition-colors hover:text-gray-900"
                target="_blank"
                rel="noopener noreferrer"
              >
                GitHub
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
