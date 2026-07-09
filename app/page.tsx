import { Suspense } from "react";
import { Blog } from "@/components/sections/blog";
import { Examples } from "@/components/sections/examples";
import { Features } from "@/components/sections/features";
import { Footer } from "@/components/sections/footer";
import { Logos } from "@/components/sections/logos";
import { Pricing } from "@/components/sections/pricing";
import { HomeWrapper } from "@/components/home-wrapper";
import { DiscontinuedHome } from "@/components/discontinued-home";
import { getFeatureFlagBootstrap } from "@/lib/feature-flags/server-bootstrap";
import { FEATURE_GATES } from "@/lib/feature-flags/gates";
import { getHomeMetadata } from "@/lib/seo/home-metadata";

export async function generateMetadata() {
  const featureFlags = await getFeatureFlagBootstrap();
  return getHomeMetadata(
    featureFlags.values[FEATURE_GATES.meelniReactivationAccess]
  );
}

function LandingContent() {
  return (
    <HomeWrapper>
      <div className="bg-background px-4 py-14 sm:px-6 lg:px-8">
        <Logos />
      </div>
      <div className="border-border/50 border-y bg-[#F6F7F9] pb-20 dark:bg-[#15161B]">
        <Examples />
      </div>
      <div className="bg-background">
        <Features />
      </div>
      <Pricing />
      <Blog />
      <Footer />
    </HomeWrapper>
  );
}

export default async function Home() {
  const featureFlags = await getFeatureFlagBootstrap();

  return (
    <main className="flex flex-col">
      {featureFlags.values[FEATURE_GATES.meelniReactivationAccess] ? (
        <Suspense fallback={<div className="min-h-screen" />}>
          <LandingContent />
        </Suspense>
      ) : (
        <DiscontinuedHome />
      )}
    </main>
  );
}
