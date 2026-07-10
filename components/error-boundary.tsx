/**
 * Error Boundary Component
 * Catches React errors and tracks them in analytics
 */

"use client";

import React, { Component, ErrorInfo, ReactNode } from "react";
import { analytics } from "@/lib/analytics/analytics-service";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): State {
    // Update state so the next render will show the fallback UI
    return {
      hasError: true,
      error,
      errorInfo: null,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Log error to console
    console.error("Error boundary caught an error:", error, errorInfo);

    // Track error in analytics
    analytics.track("error_boundary_triggered", {
      error_code: "react_render_error",
      page:
        typeof window !== "undefined" ? window.location.pathname : "unknown",
    });

    // Update state with error info
    this.setState({
      error,
      errorInfo,
    });
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      // Custom fallback UI
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default fallback UI
      return (
        <div className="bg-background flex min-h-screen items-center justify-center p-4">
          <div className="w-full max-w-md space-y-6">
            <div className="text-destructive flex items-center gap-3">
              <AlertCircle className="h-8 w-8" />
              <h1 className="text-2xl font-bold">Something went wrong</h1>
            </div>

            <div className="space-y-2">
              <p className="text-muted-foreground">
                We've encountered an unexpected error. This has been logged and
                we'll look into it.
              </p>

              {process.env.NODE_ENV === "development" && this.state.error && (
                <details className="bg-card border-border mt-4 rounded-lg border p-4">
                  <summary className="cursor-pointer text-sm font-medium">
                    Error Details (Development Only)
                  </summary>
                  <pre className="text-muted-foreground mt-2 overflow-auto text-xs">
                    {this.state.error.toString()}
                    {this.state.errorInfo?.componentStack}
                  </pre>
                </details>
              )}
            </div>

            <div className="flex gap-3">
              <Button
                onClick={this.handleReset}
                variant="outline"
                className="flex-1"
              >
                Try Again
              </Button>
              <Button onClick={this.handleReload} className="flex-1">
                Reload Page
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
