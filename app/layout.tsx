import type { Metadata } from "next";
import localFont from "next/font/local";
import { Public_Sans, Outfit } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/app/providers/auth-provider";
import { QueryProvider } from "@/app/providers/query-provider";
import { ThemeProvider } from "@/app/providers/theme-provider";
import { AnalyticsPageview } from "@/app/providers/analytics-pageview";
import { PostHogProvider } from "@/lib/analytics/posthog-provider";
import { CookieConsentBanner } from "@/components/cookie-consent-banner";
import { ErrorBoundary } from "@/components/error-boundary";
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
  weight: ["400", "600"],
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
  title: "Meelni - AI Interview Agent",
  description: "Practice product management interviews with AI-powered voice coaching. Get real-time feedback, master PM frameworks, and ace your next interview.",
  keywords: ["PM interview", "product management", "interview prep", "AI coach", "mock interview", "product sense", "behavioral interview"],
  authors: [{ name: "Meelni" }],
  openGraph: {
    title: "Meelni - AI Interview Agent",
    description: "Practice product management interviews with AI-powered voice coaching. Get real-time feedback, master PM frameworks, and ace your next interview.",
    type: "website",
    siteName: "Meelni",
  },
  twitter: {
    card: "summary_large_image",
    title: "Meelni - AI Interview Agent",
    description: "Practice product management interviews with AI-powered voice coaching.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
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
                  {children}
                  <Toaster position="top-right" duration={3000} />
                  <CookieConsentBanner />
                </AuthProvider>
              </QueryProvider>
            </ErrorBoundary>
          </ThemeProvider>
        </PostHogProvider>
      </body>
    </html>
  );
}
