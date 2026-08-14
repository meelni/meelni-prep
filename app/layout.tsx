import type { Metadata } from "next";
import localFont from "next/font/local";
import { Public_Sans, Outfit } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/app/providers/auth-provider";
import { QueryProvider } from "@/app/providers/query-provider";
import { ThemeProvider } from "@/app/providers/theme-provider";
import { AnalyticsPageview } from "@/app/providers/analytics-pageview";
import { PostHogProvider } from "@/lib/analytics/posthog-provider";
import { StatsigProvider } from "@/lib/feature-flags/statsig-provider";
import { getFeatureFlagBootstrap } from "@/lib/feature-flags/server-bootstrap";
import { CookieConsentBanner } from "@/components/cookie-consent-banner";
import { ErrorBoundary } from "@/components/error-boundary";
import { Toaster } from "sonner";
import { PRODUCT_LANGUAGE } from "@/lib/product-language";
import { PUBLIC_ORIGIN } from "@/lib/seo/public-metadata";
import { AnalyticsConsentProvider } from "@/app/providers/analytics-consent-provider";
import { AnalyticsIdentityBridge } from "@/app/providers/analytics-identity-bridge";
import { getTrustedServerAnalyticsConsentState } from "@/lib/analytics/trusted-consent";

// Using Outfit as a free alternative to Everett - similar elegant, geometric feel
const outfit = Outfit({
  subsets: ["latin"],
  weight: ["300"],
  variable: "--font-everett",
  display: "swap",
});

const publicSans = Public_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-public-sans",
  display: "swap",
});

const commitMono = localFont({
  src: [
    {
      path: "../public/fonts/commit-mono-regular.otf",
      weight: "400",
      style: "normal",
    },
  ],
  variable: "--font-commit-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Meelni",
    template: "%s | Meelni",
  },
  description: PRODUCT_LANGUAGE.oneLine,
  authors: [{ name: "Meelni" }],
  creator: "Meelni",
  publisher: "Meelni",
  metadataBase: new URL(PUBLIC_ORIGIN),
  openGraph: {
    type: "website",
    siteName: "Meelni",
    locale: "en_US",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  verification: {
    // Add Google Search Console verification when ready
    // google: "your-verification-code",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const featureFlagBootstrap = await getFeatureFlagBootstrap();
  const trustedConsent = await getTrustedServerAnalyticsConsentState();

  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${outfit.variable} ${publicSans.variable} ${commitMono.variable} antialiased`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <ErrorBoundary>
            <AuthProvider>
              <QueryProvider>
                <AnalyticsConsentProvider
                  initialAccountRevision={trustedConsent.accountRevision}
                  initialAccountSyncPending={trustedConsent.accountSyncPending}
                  initialAnalyticsPseudonym={trustedConsent.analyticsPseudonym}
                  initialConsent={trustedConsent.consent}
                  initialResolvedForSubject={trustedConsent.subjectKey}
                >
                  <PostHogProvider>
                    <AnalyticsIdentityBridge />
                    <AnalyticsPageview />
                    <StatsigProvider
                      initialGateValues={featureFlagBootstrap.values}
                    >
                      {children}
                      <Toaster position="top-right" duration={3000} />
                      <CookieConsentBanner />
                    </StatsigProvider>
                  </PostHogProvider>
                </AnalyticsConsentProvider>
              </QueryProvider>
            </AuthProvider>
          </ErrorBoundary>
        </ThemeProvider>
      </body>
    </html>
  );
}
