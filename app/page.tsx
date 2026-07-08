import { Suspense } from "react";
import { Blog } from "@/components/sections/blog";
import { Examples } from "@/components/sections/examples";
import { Features } from "@/components/sections/features";
import { Footer } from "@/components/sections/footer";
import { Logos } from "@/components/sections/logos";
import { Pricing } from "@/components/sections/pricing";
import { HomeWrapper } from "@/components/home-wrapper";

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

export default function Home() {
  return (
    <main className="flex flex-col">
      <Suspense fallback={<div className="min-h-screen" />}>
        <LandingContent />
      </Suspense>
    </main>
  );
}
