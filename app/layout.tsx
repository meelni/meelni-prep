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
import { CookieConsentBanner } from "@/components/cookie-consent-banner";
import { ErrorBoundary } from "@/components/error-boundary";
import { StructuredData } from "@/components/structured-data";
import { Toaster } from "sonner";

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
  title:
    "Meelni - AI Mock Interview Coach for Product Managers | Practice PM Interviews",
  description:
    "Master your PM interview with Meelni's AI interview coach. Practice real Product Sense, Behavioral, Execution & Strategy questions with natural voice conversations. Get instant feedback on 2,879+ curated questions. Free 3 interviews/month.",
  keywords: [
    "AI interview coach",
    "mock interview AI",
    "PM interview practice",
    "product manager interview prep",
    "product sense interview",
    "behavioral interview practice",
    "execution interview questions",
    "strategy interview prep",
    "real-time interview feedback",
    "voice interview practice",
    "PM interview questions",
    "product management interview",
    "AI mock interview",
    "interview preparation tool",
    "PM frameworks",
  ],
  authors: [{ name: "Meelni" }],
  creator: "Meelni",
  publisher: "Meelni",
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL || "https://meelni.com"
  ),
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "Meelni - AI Mock Interview Coach for Product Managers",
    description:
      "Practice PM interviews with AI voice coaching. 2,879+ questions across Product Sense, Behavioral, Execution & Strategy. Get real-time feedback and ace your next interview.",
    type: "website",
    siteName: "Meelni",
    url: "/",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "Meelni - AI Mock Interview Coach for Product Managers",
    description:
      "Practice PM interviews with AI voice coaching. 2,879+ questions. Real-time feedback. Master Product Sense, Behavioral, Execution & Strategy interviews.",
    creator: "@trymeelni",
    site: "@trymeelni",
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <StructuredData />
      </head>
      <body
        className={`${outfit.variable} ${publicSans.variable} ${commitMono.variable} antialiased`}
      >
        <PostHogProvider>
          <AnalyticsPageview />
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
          >
            <ErrorBoundary>
              <QueryProvider>
                <AuthProvider>
                  <StatsigProvider>
                    {children}
                    <Toaster position="top-right" duration={3000} />
                    <CookieConsentBanner />
                  </StatsigProvider>
                </AuthProvider>
              </QueryProvider>
            </ErrorBoundary>
          </ThemeProvider>
        </PostHogProvider>
      </body>
    </html>
  );
}
