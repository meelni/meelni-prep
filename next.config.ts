import type { NextConfig } from "next";

import { ROBOTS_NOINDEX_HEADER } from "./lib/seo/robots-header";

const NOINDEX_ROUTE_SOURCES = [
  "/api",
  "/auth",
  "/auth/:path*",
  "/dashboard",
  "/dashboard/:path*",
  "/feedback",
  "/feedback/:path*",
  "/interview",
  "/interview/:path*",
  "/pricing/canceled",
  "/pricing/success",
  "/setup",
  "/setup/:path*",
] as const;

const nextConfig: NextConfig = {
  transpilePackages: ["@meelni/agent", "@meelni/core", "@meelni/integrations"],
  async headers() {
    const globalHeaders = [
      ...(process.env.VERCEL_ENV === "production"
        ? []
        : [{ key: "X-Robots-Tag", value: ROBOTS_NOINDEX_HEADER }]),
    ];
    return [
      {
        // Apply security headers to all routes
        source: "/:path*",
        headers: [
          ...globalHeaders,
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://us.i.posthog.com https://cdn.livekit.cloud",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: https: blob:",
              "font-src 'self' data:",
              "connect-src 'self' https://*.supabase.co https://*.livekit.cloud https://us.i.posthog.com https://us-assets.i.posthog.com wss://*.livekit.cloud",
              "media-src 'self' blob:",
              "worker-src 'self' blob:", // Allow web workers for PostHog session recording
              "frame-src 'none'",
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'",
              "upgrade-insecure-requests",
            ].join("; "),
          },
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value:
              "camera=(), microphone=(self), geolocation=(), interest-cohort=()",
          },
          {
            key: "X-DNS-Prefetch-Control",
            value: "on",
          },
        ],
      },
      {
        // CORS headers for API routes
        source: "/api/:path*",
        headers: [
          {
            key: "Access-Control-Allow-Origin",
            value: process.env.NEXT_PUBLIC_APP_URL || "https://www.meelni.com",
          },
          {
            key: "Access-Control-Allow-Methods",
            value: "GET, POST, PUT, DELETE, OPTIONS",
          },
          {
            key: "Access-Control-Allow-Headers",
            value: "Content-Type, Authorization",
          },
          {
            key: "Access-Control-Allow-Credentials",
            value: "true",
          },
          {
            key: "Access-Control-Max-Age",
            value: "86400", // 24 hours
          },
          {
            key: "X-Robots-Tag",
            value: ROBOTS_NOINDEX_HEADER,
          },
        ],
      },
      ...NOINDEX_ROUTE_SOURCES.map((source) => ({
        source,
        headers: [
          {
            key: "X-Robots-Tag",
            value: ROBOTS_NOINDEX_HEADER,
          },
        ],
      })),
    ];
  },
  // Configure API route body size limits
  experimental: {
    serverActions: {
      bodySizeLimit: "2mb", // Default for most endpoints
    },
  },
};

export default nextConfig;
